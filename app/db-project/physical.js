(function (root) {
  'use strict';
  const ER = typeof module !== 'undefined' && module.exports ? require('./model.js') : root.ER;
  const actions = ['', 'RESTRICT', 'CASCADE', 'SET NULL', 'NO ACTION'];
  const integer = /^(TINYINT|SMALLINT|MEDIUMINT|INT|BIGINT)$/;
  const numeric = /^(TINYINT|SMALLINT|MEDIUMINT|INT|BIGINT|DECIMAL|FLOAT|DOUBLE)/;
  const unindexed = /^(TINYTEXT|TEXT|MEDIUMTEXT|LONGTEXT|TINYBLOB|BLOB|MEDIUMBLOB|LONGBLOB|JSON)$/;
  const presets = ['MEDIUMINT', 'INT', 'SMALLINT', 'BIGINT', 'VARCHAR(50)', 'VARCHAR(100)', 'VARCHAR(255)', 'VARCHAR(2048)', 'CHAR(1)', 'TEXT', 'TINYTEXT', 'DECIMAL(10,2)', 'BOOLEAN', 'DATE', 'TIME', 'DATETIME', 'TIMESTAMP', 'YEAR', 'JSON'];
  const sqlIdentifier = value => '`' + value.replace(/`/g, '``') + '`';
  function identifier(value, context) {
    if (typeof value !== 'string' || !value.trim() || value.length > 64 || /[\u0000-\u001f\u007f]/.test(value) || /\s$/.test(value)) throw Error(`${context}: nome SQL di 1–64 caratteri, senza caratteri di controllo o spazi finali.`);
    return value;
  }
  // ponytail: check fragment boundaries here; MySQL validates the full expression grammar at execution.
  function tokens(value, context) {
    if (typeof value !== 'string' || !value.trim() || value.length > 5000 || /[\u0000-\u0008\u000b-\u001f\u007f]/.test(value)) throw Error(`${context}: espressione vuota, troppo lunga o con caratteri non validi.`);
    const result = []; let depth = 0;
    for (let i = 0; i < value.length;) {
      const c = value[i];
      if (/\s/.test(c)) { i++; continue; }
      if (c === ';' || c === '#' || c === '@' || c === '\\' || value.startsWith('--', i) || value.startsWith('/*', i) || value.startsWith('*/', i)) throw Error(`${context}: inserisci una sola espressione, senza comandi, commenti o variabili SQL.`);
      if (c === "'" || c === '`') {
        const quote = c; let text = '', closed = false; i++;
        while (i < value.length) {
          if (value[i] === '\\') throw Error(`${context}: usa apici raddoppiati per gli escape, senza backslash.`);
          if (value[i] === quote) { if (value[i + 1] === quote) { text += quote; i += 2; } else { i++; closed = true; break; } }
          else text += value[i++];
        }
        if (!closed) throw Error(`${context}: apici non chiusi.`);
        result.push({ kind: quote === '`' ? 'identifier' : 'literal', text }); continue;
      }
      const word = value.slice(i).match(/^[\p{L}_$][\p{L}\p{N}_$]*/u);
      if (word) { result.push({ kind: 'word', text: word[0] }); i += word[0].length; continue; }
      const number = value.slice(i).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
      if (number) { result.push({ kind: 'number', text: number[0] }); i += number[0].length; continue; }
      if (c === '(') depth++;
      if (c === ')' && --depth < 0) throw Error(`${context}: parentesi non bilanciate.`);
      if (!/[()+\-*/%=<>!|&^~,]/.test(c)) throw Error(`${context}: carattere SQL non supportato: ${c}.`);
      result.push({ kind: 'operator', text: c }); i++;
    }
    if (depth) throw Error(`${context}: parentesi non bilanciate.`);
    return result;
  }
  function columnType(value) {
    if (typeof value !== 'string' || value.length > 1000) throw Error('Tipo SQL non valido.');
    const match = value.trim().match(/^([A-Z]+)\s*(?:\((.*)\))?$/i);
    if (!match) throw Error('Tipo SQL non valido: esempio VARCHAR(50) o DECIMAL(10,2).');
    let type = match[1].toUpperCase(), args = match[2];
    type = ({ INTEGER: 'INT', NUMERIC: 'DECIMAL', BOOL: 'BOOLEAN', REAL: 'DOUBLE' })[type] || type;
    const simple = /^(TINYINT|SMALLINT|MEDIUMINT|INT|BIGINT|FLOAT|DOUBLE|BOOLEAN|TINYTEXT|TEXT|MEDIUMTEXT|LONGTEXT|TINYBLOB|BLOB|MEDIUMBLOB|LONGBLOB|DATE|YEAR|JSON)$/;
    if (simple.test(type) && args == null) return type;
    if (['CHAR', 'VARCHAR', 'BINARY', 'VARBINARY', 'BIT'].includes(type) && /^\d+$/.test(args || '')) {
      const n = +args, max = { CHAR: 255, VARCHAR: 16383, BINARY: 255, VARBINARY: 65535, BIT: 64 }[type];
      if (n >= 1 && n <= max) return `${type}(${n})`;
    }
    if (type === 'DECIMAL') {
      if (args == null) return type;
      const numbers = args.match(/^(\d+)\s*(?:,\s*(\d+))?$/);
      if (numbers && +numbers[1] >= 1 && +numbers[1] <= 65 && +(numbers[2] || 0) <= Math.min(30, +numbers[1])) return `DECIMAL(${+numbers[1]}${numbers[2] != null ? ',' + +numbers[2] : ''})`;
    }
    if (['TIME', 'DATETIME', 'TIMESTAMP'].includes(type) && (args == null || /^[0-6]$/.test(args))) return type + (args == null ? '' : `(${args})`);
    if (['ENUM', 'SET'].includes(type) && args) {
      const list = tokens(args, type);
      if (list.length && list.every((t, i) => i % 2 ? t.text === ',' : t.kind === 'literal') && list.length % 2 && (type !== 'SET' || list.length <= 127)) return `${type}(${args.trim()})`;
    }
    throw Error(`Tipo o parametri non validi: ${value}. UNSIGNED si imposta con la casella dedicata.`);
  }
  function suggestedType(name, key, table) {
    const n = name.toLowerCase();
    if (n === 'id') return { type: 'MEDIUMINT', unsigned: true };
    if (n === 'progressivo') return { type: 'INT', unsigned: true };
    if (/data.*orario|datetime|timestamp/.test(n)) return { type: 'DATETIME' };
    if (/(^|_)(data|date)(_|$)/.test(n)) return { type: 'DATE' };
    if (/(^|_)(ora|orario|time)(_|$)/.test(n)) return { type: 'TIME' };
    if (n === 'anno') return { type: 'YEAR' };
    if (/durata|inizio/.test(n)) return { type: 'SMALLINT', unsigned: true };
    if (/prezzo|costo|importo|stipendio/.test(n)) return { type: 'DECIMAL(10,2)' };
    if (/^(stato_|is_|ha_)|attivo|prescrizione/.test(n)) return { type: 'BOOLEAN', default: n === 'stato_profilo_attivo' ? '1' : '' };
    if (/telefono|fax/.test(n)) return { type: 'VARCHAR(13)' };
    if (/foto|video|url/.test(n)) return { type: key ? 'VARCHAR(255)' : 'VARCHAR(2048)' };
    if (/testo|descrizione/.test(n)) return { type: key ? 'VARCHAR(255)' : 'TEXT' };
    if (n === 'email') return { type: 'VARCHAR(320)', unique: true };
    if (n === 'username') return { type: 'VARCHAR(64)', unique: true };
    if (/password/.test(n)) return { type: 'VARCHAR(255)' };
    if (n === 'sesso') return { type: 'CHAR(1)' };
    if (n === 'nome' && table.toLowerCase() === 'hashtag' && !key) return { type: 'TINYTEXT' };
    if (['nome', 'cognome', 'soprannome'].includes(n)) return { type: 'VARCHAR(50)' };
    if (/titolo|nominativo/.test(n)) return { type: 'VARCHAR(100)' };
    return { type: key ? 'VARCHAR(50)' : 'VARCHAR(100)' };
  }
  function physicalTypeSource(result, table, column, seen = new Set()) {
    const key = `${table.id}:${column.name}`;
    if (seen.has(key)) throw Error('Dipendenza ciclica fra i tipi delle FK.');
    seen.add(key);
    const fk = table.foreignKeys.find(f => f.columns.includes(column.name));
    if (!fk) return column;
    const target = result.tables.find(t => t.id === fk.target), name = fk.references[fk.columns.indexOf(column.name)];
    const reference = target?.columns.find(c => c.name === name);
    if (!reference) throw Error('La FK riferisce una colonna inesistente.');
    return physicalTypeSource(result, target, reference, seen);
  }
  function syncPhysicalTypes(result) {
    result.tables.forEach(t => t.columns.forEach(c => {
      const source = physicalTypeSource(result, t, c);
      if (source !== c) { c.type = source.type; c.unsigned = source.unsigned; c.autoIncrement = false; }
    }));
    return result;
  }
  function physical(relational) {
    const result = { database: relational.title.toLowerCase().replace(/[^\p{L}\p{N}_]+/gu, '_').replace(/^_|_$/g, '').slice(0, 64) || 'schema_db', createDatabase: true, ifNotExists: true, includeEngine: false, includeCharset: false,
      tables: relational.tables.map(t => ({ ...ER.copy(t), name: t.name.toLowerCase(), checks: [],
        columns: t.columns.map(c => ({ ...c, type: 'VARCHAR(100)', unsigned: false, unique: false, default: '', ...suggestedType(c.name, t.primaryKey.includes(c.name), t.name), autoIncrement: t.primaryKey.length === 1 && t.primaryKey[0] === c.name && c.name.toLowerCase() === 'id' && !t.foreignKeys.some(f => f.columns.includes(c.name)) })),
        foreignKeys: t.foreignKeys.map(f => ({ ...ER.copy(f), onDelete: '', onUpdate: '' })) })) };
    syncPhysicalTypes(result);
    result.tables.forEach(t => {
      const has = name => t.columns.some(c => c.name === name);
      if (has('foto') && has('video')) t.checks.push('video IS NOT NULL OR foto IS NOT NULL');
      if (has('sesso')) t.checks.push("sesso IN ('M', 'F')");
      t.foreignKeys.filter(f => f.columns.length > 1 && f.columns.every(name => t.columns.find(c => c.name === name).nullable)).forEach(f => {
        t.checks.push(`(${f.columns.map(c => sqlIdentifier(c) + ' IS NULL').join(' AND ')}) OR (${f.columns.map(c => sqlIdentifier(c) + ' IS NOT NULL').join(' AND ')})`);
      });
    });
    return validatePhysical(result, relational);
  }
  function defaultValue(value, column, context) {
    if (typeof value !== 'string' || value.length > 1000) throw Error(`${context}: DEFAULT non valido.`);
    const text = value.trim(); if (!text) return '';
    const list = tokens(text, context + ' DEFAULT');
    if (/^NULL$/i.test(text)) { if (!column.nullable) throw Error(`${context}: DEFAULT NULL richiede una colonna nullable.`); return 'NULL'; }
    if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text) || /^(TRUE|FALSE)$/i.test(text) || list.length === 1 && list[0].kind === 'literal') return text;
    if (/^CURRENT_TIMESTAMP(?:\([0-6]?\))?$/i.test(text) && /^(DATETIME|TIMESTAMP)/.test(column.type)) return text.toUpperCase();
    throw Error(`${context}: DEFAULT deve essere un numero, NULL, TRUE/FALSE, un testo fra apici o CURRENT_TIMESTAMP per DATETIME/TIMESTAMP.`);
  }
  const keywords = new Set('AND OR XOR NOT NULL TRUE FALSE IS IN BETWEEN LIKE REGEXP RLIKE CASE WHEN THEN ELSE END DIV MOD AS SIGNED UNSIGNED CHAR DATE TIME DATETIME DECIMAL INTEGER JSON INTERVAL DAY MONTH YEAR HOUR MINUTE SECOND ESCAPE'.split(' '));
  const forbidden = new Set('SELECT INSERT UPDATE DELETE DROP CREATE ALTER UNION INTO OUTFILE LOAD SET NOW SYSDATE RAND UUID CURRENT_TIMESTAMP CURRENT_DATE CURRENT_TIME CURDATE CURTIME USER CURRENT_USER CONNECTION_ID'.split(' '));
  function checkExpression(value, table) {
    if (typeof value !== 'string') throw Error(`${table.name}: CHECK non valido.`);
    const expression = value.trim().replace(/^CHECK\s*\(([\s\S]*)\)$/i, '$1').trim();
    const list = tokens(expression, `${table.name} CHECK`), columns = new Set();
    list.forEach((token, i) => {
      if (!['word', 'identifier'].includes(token.kind)) return;
      const column = table.columns.find(c => c.name.toLowerCase() === token.text.toLowerCase());
      if (column) { columns.add(column.name); return; }
      const upper = token.text.toUpperCase();
      if (token.kind === 'word' && !forbidden.has(upper) && (keywords.has(upper) || list[i + 1]?.text === '(')) return;
      throw Error(`${table.name} CHECK: colonna sconosciuta o costrutto non consentito: ${token.text}.`);
    });
    columns.forEach(name => {
      if (table.columns.find(c => c.name === name).autoIncrement) throw Error(`${table.name}: un CHECK non può riferire la colonna AUTO_INCREMENT ${name}.`);
      if (table.foreignKeys.some(f => f.columns.includes(name) && [f.onDelete, f.onUpdate].some(a => a === 'CASCADE' || a === 'SET NULL'))) throw Error(`${table.name}: il CHECK su ${name} richiede azioni FK omesse, RESTRICT o NO ACTION.`);
    });
    return expression;
  }
  function validatePhysical(raw, relational) {
    if (!raw || !Array.isArray(raw.tables) || !raw.tables.length || raw.tables.length !== relational.tables.length || typeof raw.createDatabase !== 'boolean' || typeof raw.ifNotExists !== 'boolean') throw Error('Schema fisico non valido.');
    // Older saved projects always emitted both clauses; preserve that behavior on import.
    if (['includeEngine', 'includeCharset'].some(flag => raw[flag] != null && typeof raw[flag] !== 'boolean')) throw Error('Opzioni ENGINE/CHARSET non valide.');
    const result = { database: identifier(raw.database, 'Database'), createDatabase: raw.createDatabase, ifNotExists: raw.ifNotExists, includeEngine: raw.includeEngine ?? true, includeCharset: raw.includeCharset ?? true, tables: [] }, names = new Set();
    relational.tables.forEach(base => {
      const t = raw.tables.find(t => t.id === base.id);
      if (!t || !Array.isArray(t.columns) || t.columns.length !== base.columns.length || JSON.stringify(t.primaryKey) !== JSON.stringify(base.primaryKey) || JSON.stringify(t.unique) !== JSON.stringify(base.unique) || !Array.isArray(t.foreignKeys) || t.foreignKeys.length !== base.foreignKeys.length || !Array.isArray(t.checks) || t.checks.length > 100) throw Error(`${base.name}: struttura fisica non corrispondente al relazionale.`);
      identifier(t.name, 'Tabella'); if (names.has(t.name.toLowerCase())) throw Error(`Nome di tabella SQL duplicato: ${t.name}.`); names.add(t.name.toLowerCase());
      const table = { id: t.id, name: t.name, primaryKey: [...base.primaryKey], unique: ER.copy(base.unique), foreignKeys: [], columns: [], checks: [] }, columnNames = new Set();
      base.columns.forEach(original => {
        const c = t.columns.find(c => c.name === original.name), context = `${t.name}.${original.name}`;
        if (!c) throw Error(`${context}: colonna mancante.`);
        identifier(c.name, 'Colonna'); if (columnNames.has(c.name.toLowerCase())) throw Error(`${context}: colonna duplicata.`); columnNames.add(c.name.toLowerCase());
        if (['nullable', 'unsigned', 'autoIncrement', 'unique'].some(flag => typeof c[flag] !== 'boolean')) throw Error(`${context}: opzioni non valide.`);
        const type = columnType(c.type), column = { name: c.name, type, nullable: c.nullable, unsigned: c.unsigned, autoIncrement: c.autoIncrement, unique: c.unique, default: '' };
        if (base.primaryKey.includes(c.name) && c.nullable) throw Error(`${context}: una PK non può ammettere NULL.`);
        if (c.unsigned && !numeric.test(type)) throw Error(`${context}: UNSIGNED richiede un tipo numerico.`);
        if (unindexed.test(type) && (c.unique || base.primaryKey.includes(c.name) || base.unique.some(u => u.includes(c.name)) || base.foreignKeys.some(f => f.columns.includes(c.name)))) throw Error(`${context}: per PK, FK e UNIQUE scegli un tipo indicizzabile, come VARCHAR.`);
        column.default = defaultValue(c.default, column, context);
        if (c.autoIncrement && (!integer.test(type) || base.primaryKey[0] !== c.name || c.nullable || column.default || base.foreignKeys.some(f => f.columns.includes(c.name)))) throw Error(`${context}: AUTO_INCREMENT richiede una colonna intera, prima nella PK, senza DEFAULT e non FK.`);
        table.columns.push(column);
      });
      if (table.columns.filter(c => c.autoIncrement).length > 1) throw Error(`${t.name}: è ammesso un solo AUTO_INCREMENT.`);
      base.foreignKeys.forEach((f, i) => {
        const fk = t.foreignKeys[i];
        if (!fk || JSON.stringify({ columns: fk.columns, target: fk.target, references: fk.references }) !== JSON.stringify(f) || !actions.includes(fk.onDelete) || !actions.includes(fk.onUpdate)) throw Error(`${t.name}: FK non valida.`);
        if ([fk.onDelete, fk.onUpdate].includes('SET NULL') && fk.columns.some(name => !table.columns.find(c => c.name === name).nullable)) throw Error(`${t.name}: SET NULL richiede tutte le colonne della FK nullable.`);
        table.foreignKeys.push({ ...ER.copy(f), onDelete: fk.onDelete, onUpdate: fk.onUpdate });
      });
      table.checks = t.checks.map(expression => checkExpression(expression, table)); result.tables.push(table);
    });
    result.tables.forEach(t => t.foreignKeys.forEach(f => f.columns.forEach((name, i) => {
      const c = t.columns.find(c => c.name === name), owner = result.tables.find(t => t.id === f.target)?.columns.find(c => c.name === f.references[i]);
      if (!owner || c.type !== owner.type || c.unsigned !== owner.unsigned) throw Error(`${t.name}.${name}: il tipo della FK deve coincidere con quello della chiave referenziata.`);
    })));
    return result;
  }
  function physicalSQL(raw, relational) {
    const result = validatePhysical(raw, relational), sql = ['-- Schema fisico MySQL 8.0.16+'], done = new Set(), deferred = [];
    const quoteList = list => list.map(sqlIdentifier).join(', ');
    if (result.createDatabase) sql.push(`CREATE DATABASE${result.ifNotExists ? ' IF NOT EXISTS' : ''} ${sqlIdentifier(result.database)}${result.includeCharset ? ' DEFAULT CHARACTER SET utf8mb4' : ''};`);
    sql.push(`USE ${sqlIdentifier(result.database)};`, '');
    function foreignKey(f) {
      const target = result.tables.find(t => t.id === f.target);
      return `FOREIGN KEY (${quoteList(f.columns)}) REFERENCES ${sqlIdentifier(target.name)} (${quoteList(f.references)})` + (f.onDelete ? ` ON DELETE ${f.onDelete}` : '') + (f.onUpdate ? ` ON UPDATE ${f.onUpdate}` : '');
    }
    const pending = [...result.tables];
    while (pending.length) {
      const index = pending.findIndex(t => t.foreignKeys.every(f => f.target === t.id || done.has(f.target))), t = pending.splice(index < 0 ? 0 : index, 1)[0];
      const lines = t.columns.map(c => {
        let definition = `${sqlIdentifier(c.name)} ${c.type}${c.unsigned ? ' UNSIGNED' : ''}${c.autoIncrement ? ' AUTO_INCREMENT' : ''}${c.unique && !(t.primaryKey.length === 1 && t.primaryKey[0] === c.name) ? ' UNIQUE' : ''}${c.nullable ? '' : ' NOT NULL'}`;
        if (c.default) definition += ` DEFAULT ${unindexed.test(c.type) ? '(' + c.default + ')' : c.default}`;
        return definition;
      });
      lines.push(`PRIMARY KEY (${quoteList(t.primaryKey)})`);
      t.unique.filter(u => u.length !== 1 || !t.columns.find(c => c.name === u[0]).unique).forEach(u => lines.push(`UNIQUE (${quoteList(u)})`));
      t.foreignKeys.forEach(f => { if (f.target === t.id || done.has(f.target)) lines.push(foreignKey(f)); else deferred.push({ table: t, fk: f }); });
      t.checks.forEach((expression, i) => lines.push(`CONSTRAINT ${sqlIdentifier('ck_' + t.name.slice(0, 40) + '_' + (result.tables.indexOf(t) + 1) + '_' + (i + 1))} CHECK (${expression})`));
      sql.push(`CREATE TABLE${result.ifNotExists ? ' IF NOT EXISTS' : ''} ${sqlIdentifier(t.name)} (\n  ${lines.join(',\n  ')}\n)${result.includeEngine ? ' ENGINE=InnoDB' : ''}${result.includeCharset ? ' DEFAULT CHARSET=utf8mb4' : ''};`, ''); done.add(t.id);
    }
    deferred.forEach(({ table, fk }) => sql.push(`ALTER TABLE ${sqlIdentifier(table.name)} ADD ${foreignKey(fk)};`));
    if (relational.constraints.length) sql.push('', '-- Vincoli residui: da gestire con controlli applicativi o trigger.', ...relational.constraints.map(c => '-- ' + c.replace(/[\r\n]/g, ' ')));
    return sql.join('\n');
  }
  function restorePhysical(raw, previous, relational, renames = {}) {
    const old = validatePhysical(raw, previous), result = physical(relational);
    ['database', 'createDatabase', 'ifNotExists', 'includeEngine', 'includeCharset'].forEach(key => { result[key] = old[key]; });
    const maps = new Map(result.tables.map(t => [t.id, Object.assign(Object.create(null), Object.hasOwn(renames, t.id) ? renames[t.id] : {})]));
    // Propagate renamed key components through external identifiers before restoring column choices.
    for (let pass = 0; pass < result.tables.length; pass++) {
      let changed = false;
      result.tables.forEach(t => t.foreignKeys.forEach((f, i) => {
        const prior = old.tables.find(o => o.id === t.id)?.foreignKeys[i];
        if (!prior || prior.target !== f.target) throw Error('Le FK salvate non corrispondono al progetto.');
        prior.columns.forEach((name, j) => {
          const reference = maps.get(f.target)[prior.references[j]] || prior.references[j];
          const index = f.references.indexOf(reference), names = maps.get(t.id);
          if (index >= 0 && names[name] !== f.columns[index]) { names[name] = f.columns[index]; changed = true; }
        });
      }));
      if (!changed) break;
    }
    result.tables.forEach(t => {
      const before = old.tables.find(o => o.id === t.id), base = previous.tables.find(o => o.id === t.id);
      if (!before || !base) throw Error('Le tabelle SQL salvate non corrispondono al progetto.');
      if (before.name !== base.name.toLowerCase()) t.name = before.name;
      const names = maps.get(t.id);
      t.foreignKeys.forEach((f, i) => {
        const prior = before.foreignKeys[i];
        if (!prior || prior.target !== f.target) throw Error('Le FK salvate non corrispondono al progetto.');
        f.onDelete = prior.onDelete; f.onUpdate = prior.onUpdate;
      });
      t.columns = t.columns.map(c => {
        const saved = before.columns.find(o => (names[o.name] || o.name) === c.name);
        return saved ? { ...saved, name: c.name, nullable: t.primaryKey.includes(c.name) ? false : saved.nullable } : c;
      });
      t.checks = before.checks.map(expression => expression.replace(/'(?:''|[^'])*'|`(?:``|[^`])*`|[\p{L}_$][\p{L}\p{N}_$]*/gu, token => {
        if (token.startsWith("'")) return token;
        const quoted = token.startsWith('`'), name = quoted ? token.slice(1, -1).replace(/``/g, '`') : token;
        const key = Object.keys(names).find(k => k.toLowerCase() === name.toLowerCase());
        return key ? sqlIdentifier(names[key]) : token;
      }));
    });
    return validatePhysical(syncPhysicalTypes(result), relational);
  }
  Object.assign(ER, { physical, validatePhysical, physicalSQL, restorePhysical, syncPhysicalTypes, physicalTypeSource, physicalTypePresets: presets, physicalActions: actions });
  if (typeof module !== 'undefined' && module.exports) module.exports = ER;
})(globalThis);

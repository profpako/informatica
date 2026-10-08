(function (root) {
  'use strict';
  const ER = typeof module !== 'undefined' && module.exports ? require('./model.js') : root.ER;
  // ponytail: common Italian nouns and suffixes; unusual/invariant names can be adjusted in the relational editor.
  function pluralName(name) {
    const exceptions = { uomo: 'uomini', uovo: 'uova', braccio: 'braccia', mano: 'mani', ala: 'ali', foto: 'foto', auto: 'auto', radio: 'radio', cinema: 'cinema', problema: 'problemi', sistema: 'sistemi', programma: 'programmi', schema: 'schemi', tema: 'temi', specie: 'specie', serie: 'serie', persona: 'persone', ditta: 'ditte' };
    // Pluralize the head of compound nouns, leaving their complements singular.
    const words = name.replace(/(^|[_\s])n([_ ])telefono(?=$|[_\s])/gi, (_, prefix, separator) => prefix + ['numero', 'di', 'telefono'].join(separator));
    let complement = false;
    return words.replace(/[\p{L}]+/gu, word => {
      const lower = word.toLowerCase();
      if (word.length === 1) return word;
      if (['di', 'da', 'del', 'della'].includes(lower)) { complement = true; return word; }
      if (complement || ['e', ...Object.values(exceptions)].includes(lower)) return word;
      let plural = exceptions[lower];
      if (!plural) {
        if (/ca$/.test(lower)) plural = lower.slice(0, -2) + 'che';
        else if (/ga$/.test(lower)) plural = lower.slice(0, -2) + 'ghe';
        else if (/a$/.test(lower)) plural = lower.slice(0, -1) + 'e';
        else if (/ario$/.test(lower)) plural = lower.slice(0, -2) + 'i';
        else if (/[oe]$/.test(lower)) plural = lower.slice(0, -1) + 'i';
        else return word;
      }
      return word === word.toUpperCase() ? plural.toUpperCase() : word[0] === word[0].toUpperCase() ? plural[0].toUpperCase() + plural.slice(1) : plural;
    });
  }
  function relational(input, nameOverrides = {}) {
    const model = ER.validate(input);
    if (!nameOverrides || typeof nameOverrides !== 'object' || Array.isArray(nameOverrides) || Object.keys(nameOverrides).length > 2000) throw Error('Nomi delle relazioni non validi.');
    const overrides = Object.fromEntries(Object.entries(nameOverrides).map(([id, value]) => {
      if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id) || typeof value !== 'string' || !value.trim() || value.trim().length > 64 || /[\u0000-\u001f\u007f]/.test(value)) throw Error('Il nome della relazione deve contenere da 1 a 64 caratteri, senza caratteri di controllo.');
      return [id, value.trim()];
    }));
    if (model.hierarchies?.length || [...model.entities, ...model.relationships].some(n => ER.attributeEntries(n.attributes).some(e => e.attr.children || e.attr.cardinality.endsWith('N')))) throw Error('Genera prima lo schema ER ristrutturato.');
    const tables = [];
    const uniqueName = (base, list) => { let name = base, i = 2; while (list.some(n => n.name.toLowerCase() === name.toLowerCase())) name = `${base}_${i++}`; return name; };
    const automaticNames = [];
    const relationName = (id, base) => {
      const name = uniqueName(base, automaticNames); automaticNames.push({ name });
      return Object.hasOwn(overrides, id) ? overrides[id] : name;
    };
    model.entities.forEach(e => tables.push({ id: e.id, name: relationName(e.id, pluralName(e.name)), columns: e.attributes.map(a => ({ name: a.name, nullable: a.cardinality === '0,1' })), primaryKey: [], foreignKeys: [], unique: [] }));
    const constraints = [...(model.constraints || [])], report = [], participation = [], consumed = new Set(), resolving = new Set(), resolved = new Set();
    const table = id => tables.find(t => t.id === id);
    function reference(target, owner, prefix, nullable, cardinality) {
      resolve(owner.id);
      const columns = owner.primaryKey.map(key => {
        const label = prefix.toLowerCase().replace(/\s+/g, '_');
        const name = uniqueName(`id_${label}${owner.primaryKey.length > 1 ? '_' + key.toLowerCase() : ''}`, target.columns); target.columns.push({ name, nullable }); return name;
      });
      target.foreignKeys.push({ columns, target: owner.id, references: [...owner.primaryKey] });
      if (cardinality) participation.push({ table: target.id, columns: [...columns], min: Number(cardinality[0]), max: cardinality.endsWith('1') ? 1 : null });
      if (nullable && columns.length > 1) constraints.push(`${target.name}: la FK composta ${columns.join(' + ')} deve essere interamente nulla oppure interamente valorizzata.`);
      return columns;
    }
    function resolve(id) {
      if (resolved.has(id)) return;
      if (resolving.has(id)) throw Error('Gli identificatori esterni contengono una dipendenza ciclica.');
      resolving.add(id);
      const entity = model.entities.find(e => e.id === id), t = table(id), own = entity.attributes.filter(a => a.key).map(a => a.name);
      if (entity.externalKey) {
        t.primaryKey = [...entity.externalKey.attributes];
        entity.externalKey.owners.forEach(o => {
          const r = model.relationships.find(r => r.id === o.relationship), end = r.ends.find(end => end.entity === o.entity), owner = table(o.entity);
          const keys = reference(t, owner, end.role || model.entities.find(e => e.id === owner.id).name, false, end.cardinality); t.primaryKey.push(...keys); consumed.add(r.id);
          if (end.cardinality.endsWith('1')) t.unique.push(keys);
        });
        if (own.length) t.unique.push(own);
      } else t.primaryKey = own;
      if (!t.primaryKey.length) throw Error(`${entity.name}: manca un identificatore; aggiungi [ID] o [PK].`);
      t.columns.filter(c => t.primaryKey.includes(c.name)).forEach(c => { c.nullable = false; });
      resolving.delete(id); resolved.add(id);
    }
    tables.forEach(t => resolve(t.id));
    model.relationships.forEach(r => {
      if (consumed.has(r.id)) {
        const identified = model.entities.find(e => e.externalKey?.owners.some(o => o.relationship === r.id));
        r.ends.filter(end => end.entity !== identified.id && end.cardinality[0] === '1').forEach(end => constraints.push(`${r.name}: ogni istanza di ${table(end.entity).name} deve avere almeno un valore o una figlia; PK/FK da sole non garantiscono questo minimo.`));
        report.push(`${r.name}: incorporata nella FK dell’entità identificata esternamente.`); return;
      }
      const single = r.ends.map((end, i) => end.cardinality.endsWith('1') ? i : -1).filter(i => i >= 0);
      if (!single.length) {
        const t = { id: r.id, name: relationName(r.id, r.name), columns: r.attributes.map(a => ({ name: a.name, nullable: a.cardinality === '0,1' })), primaryKey: [], foreignKeys: [], unique: [] };
        r.ends.forEach((end, i) => { const owner = table(end.entity), name = model.entities.find(e => e.id === owner.id).name; t.primaryKey.push(...reference(t, owner, end.role || (r.ends[0].entity === r.ends[1].entity ? `${name}_${i + 1}` : name), false, end.cardinality)); });
        const ownKeys = r.attributes.filter(a => a.key).map(a => a.name); if (ownKeys.length) t.unique.push(ownKeys);
        tables.push(t); report.push(`${r.name}: associazione N:M tradotta nella relazione ${t.name}, con PK composta dalle chiavi dei partecipanti.`);
      } else {
        // Prefer a mandatory single-participation end for 1:1 to avoid unnecessary nulls.
        const i = single.find(i => r.ends[i].cardinality[0] === '1') ?? single[0], j = 1 - i;
        const target = table(r.ends[i].entity), owner = table(r.ends[j].entity), nullable = r.ends[i].cardinality[0] === '0';
        const columns = reference(target, owner, r.ends[j].role || model.entities.find(e => e.id === owner.id).name, nullable, r.ends[j].cardinality);
        if (single.length === 2) target.unique.push(columns);
        const relationColumns = [];
        r.attributes.forEach(a => { const name = uniqueName(`${r.name}_${a.name}`, target.columns); target.columns.push({ name, nullable: nullable || a.cardinality === '0,1' }); relationColumns.push({ name, required: a.cardinality === '1,1' }); });
        const uniqueAttributes = r.attributes.map((a, i) => a.key ? relationColumns[i].name : null).filter(Boolean); if (uniqueAttributes.length) target.unique.push(uniqueAttributes);
        if (nullable && relationColumns.length) constraints.push(`${target.name}: gli attributi di ${r.name} sono nulli se la FK è nulla; quando la FK è presente sono obbligatori ${relationColumns.filter(c => c.required).map(c => c.name).join(', ') || 'solo i campi richiesti dai vincoli'}.`);
        report.push(`${r.name}: FK ${columns.join(' + ')} in ${target.name} verso ${owner.name}${single.length === 2 ? ', con vincolo UNIQUE (1:1)' : ' (1:N)'}.`);
      }
      r.ends.forEach(end => {
        if (end.cardinality[0] === '1') {
          const singleRow = single.length && r.ends[single.find(i => r.ends[i].cardinality[0] === '1') ?? single[0]].entity === end.entity && r.ends[0].entity !== r.ends[1].entity;
          if (!singleRow) constraints.push(`${r.name}: ogni istanza di ${table(end.entity).name}${end.role ? ` nel ruolo ${end.role}` : ''} deve partecipare ad almeno un’associazione; PK/FK da sole non garantiscono questo minimo.`);
        }
      });
    });
    tables.forEach(t => { t.unique = t.unique.filter((cols, i, list) => cols.join('|') !== t.primaryKey.join('|') && list.findIndex(c => c.join('|') === cols.join('|')) === i); });
    const usedNames = new Set();
    tables.forEach(t => {
      if (usedNames.has(t.name.toLowerCase())) throw Error(`Nome di relazione duplicato: ${t.name}.`);
      usedNames.add(t.name.toLowerCase());
    });
    const savedNames = Object.fromEntries(tables.filter(t => Object.hasOwn(overrides, t.id)).map(t => [t.id, t.name]));
    return { title: model.title, tables, constraints: [...new Set(constraints)], report, participation, ...(Object.keys(savedNames).length ? { nameOverrides: savedNames } : {}) };
  }
  function relationalText(result) {
    return [`SCHEMA RELAZIONALE: ${result.title}`, '', ...result.tables.flatMap(t => [
      `${t.name}(${t.columns.map(c => c.name).join(', ')})`, `  PK: ${t.primaryKey.join(', ')}`,
      ...t.foreignKeys.map(f => `  FK: (${f.columns.join(', ')}) -> ${result.tables.find(t => t.id === f.target).name}(${f.references.join(', ')})`),
      ...t.unique.map(columns => `  UNIQUE: ${columns.join(', ')}`),
      `  NOT NULL: ${t.columns.filter(c => !c.nullable).map(c => c.name).join(', ')}`, ''
    ]), 'VINCOLI RESIDUI:', ...result.constraints.map(c => '- ' + c)].join('\n');
  }
  function relationalNotation(t) {
    const isFK = name => t.foreignKeys.some(f => f.columns.includes(name));
    const column = c => {
      const pk = t.primaryKey.includes(c.name), fk = isFK(c.name);
      return `<span class="relational-column${fk && !pk ? ' relational-fk' : ''}">${ER.escape(c.name)}${c.nullable ? '*' : ''}${pk || fk ? `<span class="sr-only"> [${[pk ? 'PK' : '', fk ? 'FK' : ''].filter(Boolean).join(', ')}]</span>` : ''}</span>`;
    };
    const keys = t.primaryKey.map(name => t.columns.find(c => c.name === name));
    const keyGroup = `<span class="relational-key relational-pk${keys.length === 1 && isFK(keys[0].name) ? ' relational-fk' : ''}">${keys.map(column).join(', ')}</span>`;
    const others = t.columns.filter(c => !t.primaryKey.includes(c.name)).map(column);
    return `<p class="compact-relation"><strong>${ER.escape(t.name)}</strong>(${[keyGroup, ...others].join(', ')})</p>`;
  }
  ER.relational = relational; ER.relationalText = relationalText; ER.relationalNotation = relationalNotation;
  if (typeof module !== 'undefined' && module.exports) module.exports = { relational, relationalText, relationalNotation };
})(globalThis);

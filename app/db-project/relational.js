(function (root) {
  'use strict';
  const ER = typeof module !== 'undefined' && module.exports ? require('./model.js') : root.ER;
  function relational(input) {
    const model = ER.validate(input);
    if (model.hierarchies?.length || [...model.entities, ...model.relationships].some(n => ER.attributeEntries(n.attributes).some(e => e.attr.children || e.attr.cardinality.endsWith('N')))) throw Error('Genera prima lo schema ER ristrutturato.');
    const tables = model.entities.map(e => ({ id: e.id, name: e.name, columns: e.attributes.map(a => ({ name: a.name, nullable: a.cardinality === '0,1' })), primaryKey: [], foreignKeys: [], unique: [] }));
    const constraints = [...(model.constraints || [])], report = [], consumed = new Set(), resolving = new Set(), resolved = new Set();
    const table = id => tables.find(t => t.id === id);
    const uniqueName = (base, list) => { let name = base, i = 2; while (list.some(n => n.name.toLowerCase() === name.toLowerCase())) name = `${base}_${i++}`; return name; };
    function reference(target, owner, prefix, nullable) {
      resolve(owner.id);
      const columns = owner.primaryKey.map(key => {
        const name = uniqueName(`${prefix}_${key}`, target.columns); target.columns.push({ name, nullable }); return name;
      });
      target.foreignKeys.push({ columns, target: owner.id, references: [...owner.primaryKey] });
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
          const keys = reference(t, owner, end.role || owner.name, false); t.primaryKey.push(...keys); consumed.add(r.id);
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
        const t = { id: r.id, name: uniqueName(r.name, tables), columns: r.attributes.map(a => ({ name: a.name, nullable: a.cardinality === '0,1' })), primaryKey: [], foreignKeys: [], unique: [] };
        r.ends.forEach((end, i) => { const owner = table(end.entity); t.primaryKey.push(...reference(t, owner, end.role || (r.ends[0].entity === r.ends[1].entity ? `${owner.name}_${i + 1}` : owner.name), false)); });
        const ownKeys = r.attributes.filter(a => a.key).map(a => a.name); if (ownKeys.length) t.unique.push(ownKeys);
        tables.push(t); report.push(`${r.name}: associazione N:M tradotta nella relazione ${t.name}, con PK composta dalle chiavi dei partecipanti.`);
      } else {
        // Prefer a mandatory single-participation end for 1:1 to avoid unnecessary nulls.
        const i = single.find(i => r.ends[i].cardinality[0] === '1') ?? single[0], j = 1 - i;
        const target = table(r.ends[i].entity), owner = table(r.ends[j].entity), nullable = r.ends[i].cardinality[0] === '0';
        const columns = reference(target, owner, r.ends[j].role || r.name, nullable);
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
    return { title: model.title, tables, constraints: [...new Set(constraints)], report };
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

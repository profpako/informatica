(function (root) {
  'use strict';
  const ER = typeof module !== 'undefined' && module.exports ? require('./model.js') : root.ER;
  const blank = (name, attributes = []) => ({ id: ER.uid(), name, attributes, x: 0, y: 0, side: 'top', attributePositions: {} });
  const plain = (name, key = false, cardinality = '1,1') => ({ name, key, cardinality });
  function restructure(source) {
    const model = ER.validate(ER.copy(source)), report = [], constraints = [...(model.constraints || [])];
    const entity = id => model.entities.find(e => e.id === id);
    const unique = (base, list) => {
      base = base.slice(0, 72); let candidate = base, i = 2;
      while (list.some(n => n.name.toLowerCase() === candidate.toLowerCase())) candidate = `${base}_${i++}`;
      return candidate;
    };
    const keyAttrs = e => ER.attributeEntries(e.attributes).filter(x => !x.attr.children && (x.attr.key || ER.attributeEntries(e.attributes).some(p => p.attr.key && x.path.startsWith(p.path + '.'))));
    const dropKeys = attrs => attrs.forEach(a => { a.key = false; if (a.children) dropKeys(a.children); });
    function hasKey(e, visited = new Set()) {
      if (!e || visited.has(e.id)) return false;
      if (keyAttrs(e).length) return true;
      visited.add(e.id);
      if (e.externalKey) return e.externalKey.owners.every(o => hasKey(entity(o.entity), new Set(visited)));
      const ancestor = (model.hierarchies || []).find(h => h.children.includes(e.id));
      return !!ancestor && hasKey(entity(ancestor.parent), visited);
    }
    function association(label, a, b, cardA = '0,N', cardB = '1,1') {
      const r = { ...blank(unique(label, model.relationships)), ends: [{ entity: a.id, cardinality: cardA, role: '' }, { entity: b.id, cardinality: cardB, role: '' }] };
      model.relationships.push(r); return r;
    }
    // Process leaf hierarchies first; expanding a total child also updates the ancestor's branches.
    const pending = ER.copy(model.hierarchies || []);
    while (pending.length) {
      const index = pending.findIndex(h => !h.children.some(c => pending.some(other => other.parent === c)));
      if (index < 0) throw Error('La gerarchia contiene un ciclo.');
      const h = pending.splice(index, 1)[0], parent = entity(h.parent), children = h.children.map(entity);
      if (!hasKey(parent)) {
        const ancestor = pending.find(g => g.children.includes(parent.id));
        if (!ancestor || !hasKey(entity(ancestor.parent))) throw Error(`${parent.name}: indica un identificatore prima di ristrutturare la gerarchia.`);
        const inherited = keyAttrs(entity(ancestor.parent)).map(x => ER.copy(x.attr));
        inherited.forEach(a => { if (!parent.attributes.some(b => b.name === a.name)) parent.attributes.push(a); });
      }
      const label = `${parent.name} → ${children.map(c => c.name).join(', ')}`;
      constraints.push(`Gerarchia ${label}: ${h.total ? 'ogni istanza del padre appartiene ad almeno una figlia' : 'sono ammesse istanze del solo padre'}; ${h.disjoint ? 'le appartenenze alle figlie sono esclusive' : 'è ammessa l’appartenenza a più figlie, con la stessa identità e gli stessi valori ereditati'}.`);
      if (h.strategy === 'keep') {
        children.forEach(child => {
          // The parent identifier is inherited, never combined with a child-specific candidate key.
          const ownKeys = child.attributes.filter(a => a.key);
          if (ownKeys.length) constraints.push(`${child.name}: ${ownKeys.map(a => a.name).join(' + ')} resta un identificatore alternativo della sottoclasse.`);
          dropKeys(child.attributes);
          const inheritedNames = keyAttrs(parent).map(x => x.attr.name);
          child.attributes = child.attributes.filter(a => !inheritedNames.includes(a.name));
          const r = association(`ISA_${child.name}_${parent.name}`, parent, child, '0,1');
          child.externalKey = { attributes: [], owners: [{ entity: parent.id, relationship: r.id }] };
        });
        report.push(`${label}: padre e figlie mantenuti, gerarchia sostituita da associazioni ISA.`);
      } else if (h.strategy === 'up') {
        const membership = new Map();
        if (h.disjoint) {
          const type = unique(`tipo_${parent.name}`, parent.attributes); parent.attributes.push(plain(type));
          children.forEach(c => membership.set(c.id, `${type} = ${c.name}`));
          constraints.push(`${parent.name}.${type}: valori ammessi ${children.map(c => c.name).join(', ')}${h.total ? '' : ', solo_padre'}.`);
        } else {
          children.forEach(c => { const flag = unique(`è_${c.name}`, parent.attributes); parent.attributes.push(plain(flag)); membership.set(c.id, `${flag} = vero`); constraints.push(`${parent.name}.${flag}: valore booleano che indica appartenenza a ${c.name}.`); });
          if (h.total) constraints.push(`${parent.name}: almeno un indicatore di appartenenza deve essere vero.`);
        }
        children.forEach(child => {
          child.attributes.forEach(attr => {
            const inherited = parent.attributes.find(a => a.name === attr.name && a.key && attr.key);
            if (inherited) return;
            const a = ER.copy(attr); a.name = unique(`${child.name}_${a.name}`, parent.attributes); a.key = false;
            if (a.children) dropKeys(a.children);
            const required = a.cardinality[0] === '1'; a.cardinality = a.cardinality.endsWith('N') ? '0,N' : '0,1';
            parent.attributes.push(a);
            constraints.push(`${parent.name}.${a.name}: presente solo quando ${membership.get(child.id)}${required ? '; obbligatorio per quella sottoclasse' : ''}${attr.key ? '; identificatore alternativo della sottoclasse' : ''}.`);
          });
          model.relationships.forEach(r => r.ends.forEach((end, i) => {
            if (end.entity !== child.id) return;
            constraints.push(`${r.name}: il partecipante ${i + 1} di ${parent.name} deve soddisfare ${membership.get(child.id)}; nella sottoclasse conserva cardinalità (${end.cardinality}).`);
            end.entity = parent.id; end.cardinality = '0,' + end.cardinality.slice(2); end.role ||= child.name;
          }));
          model.entities.forEach(e => e.externalKey?.owners.forEach(o => { if (o.entity === child.id) o.entity = parent.id; }));
        });
        model.entities = model.entities.filter(e => !h.children.includes(e.id));
        pending.forEach(g => { g.children = g.children.map(c => h.children.includes(c) ? parent.id : c).filter((id, i, ids) => ids.indexOf(id) === i); });
        report.push(`${label}: figlie accorpate nel padre; appartenenza e vincoli delle sottoclassi conservati.`);
      } else {
        if (!h.total) throw Error(`${parent.name}: una gerarchia parziale non permette l’eliminazione del padre.`);
        children.forEach(child => {
          const inherited = ER.copy(parent.attributes);
          child.attributes.forEach(a => {
            const matching = inherited.find(b => b.name === a.name);
            if (matching) {
              if (ER.attributeText([matching]) !== ER.attributeText([a])) throw Error(`${child.name}.${a.name}: proprietà incompatibile con quella ereditata dal padre.`);
            } else {
              const b = ER.copy(a); if (b.key) { constraints.push(`${child.name}.${b.name}: identificatore alternativo della sottoclasse.`); b.key = false; } inherited.push(b);
            }
          });
          child.attributes = inherited;
          if (child.externalKey?.owners.some(o => o.entity === parent.id)) delete child.externalKey;
          if (parent.externalKey) child.externalKey = ER.copy(parent.externalKey);
        });
        const replacements = [];
        model.relationships.forEach(r => {
          if (!r.ends.some(end => end.entity === parent.id)) { replacements.push(r); return; }
          const choices = r.ends.map(end => end.entity === parent.id ? children : [entity(end.entity)]);
          choices[0].forEach(a => choices[1].forEach(b => {
            const clone = ER.copy(r); clone.id = ER.uid(); clone.name = unique(`${r.name}_${a.name}_${b.name}`, replacements);
            clone.ends = [a, b].map((e, i) => ({ ...r.ends[i], entity: e.id, cardinality: r.ends[i].entity === parent.id ? r.ends[i].cardinality : '0,' + r.ends[i].cardinality.slice(2), role: r.ends[i].role || (a.id === b.id ? `${e.name}_${i + 1}` : '') }));
            replacements.push(clone);
          }));
          constraints.push(`${r.name}: l’unione delle associazioni generate conserva le cardinalità originali ${r.ends.map(e => `(${e.cardinality})`).join(' / ')}${h.disjoint ? '' : '; le copie riferite alla stessa istanza nelle figlie sovrapposte devono essere coerenti'}.`);
        });
        model.relationships = replacements;
        model.entities = model.entities.filter(e => e.id !== parent.id);
        pending.forEach(g => { g.children = g.children.flatMap(c => c === parent.id ? h.children : [c]); });
        report.push(`${label}: padre accorpato nelle figlie, incluse le associazioni; vincoli globali riportati separatamente.`);
      }
      model.relationships.forEach(r => { if (r.ends[0].entity === r.ends[1].entity) { r.ends[0].role ||= 'origine'; r.ends[1].role ||= 'destinazione'; if (r.ends[0].role === r.ends[1].role) r.ends[1].role += '_2'; } });
    }
    model.hierarchies = [];
    // Reify associations with multivalued properties so the values have an identifiable owner.
    [...model.relationships].filter(r => ER.attributeEntries(r.attributes).some(e => e.attr.cardinality.endsWith('N'))).forEach(r => {
      const e = blank(unique(r.name, model.entities), ER.copy(r.attributes)); model.entities.push(e);
      model.relationships = model.relationships.filter(n => n.id !== r.id);
      e.externalKey = { attributes: [], owners: r.ends.map((end, i) => {
        const owner = entity(end.entity), link = association(`${r.name}_${end.role || i + 1}`, owner, e, end.cardinality);
        if (r.ends[0].entity === r.ends[1].entity) link.ends[0].role = end.role;
        return { entity: owner.id, relationship: link.id };
      }) };
      report.push(`${r.name}: associazione trasformata in entità, identificata dalla coppia dei partecipanti, per estrarre gli attributi multivalore.`);
    });
    function flatten(node, attrs, prefix = '', optional = false, inheritedKey = false) {
      const output = [];
      attrs.forEach(attr => {
        const label = prefix ? `${prefix}_${attr.name}` : attr.name;
        if (label.length > 80) throw Error(`${node.name}: il nome appiattito ${label} supera 80 caratteri; abbrevia le componenti.`);
        const min = optional ? '0' : attr.cardinality[0];
        if (attr.cardinality.endsWith('N')) {
          if (!hasKey(node)) throw Error(`${node.name}: indica un identificatore per estrarre ${label}.`);
          const value = blank(unique(`${node.name}_${label}`, model.entities)); model.entities.push(value);
          const values = attr.children ? ER.copy(attr.children) : [plain(attr.name)];
          values.filter(a => a.name.toLowerCase() === 'id').forEach(a => { a.name = unique('valore_id', values); });
          value.attributes = [plain('id', true), ...values];
          association(`ha_${label}`, node, value, `${min},N`);
          if (attr.children) value.attributes = flatten(value, value.attributes);
          constraints.push(`${value.name}: due valori completi uguali non devono comparire due volte per lo stesso proprietario.`);
          report.push(`${node.name}.${label}: estratto in ${value.name}, con identificatore proprio id e ${attr.children ? 'componenti del valore' : `valore in ${values[0].name}`}; cardinalità (${min},N).`);
        } else if (attr.children) {
          if (attr.cardinality[0] === '0') constraints.push(`${node.name}.${label}: tutte le componenti appartengono alla stessa presenza opzionale; se il composto è presente, le componenti obbligatorie devono essere valorizzate.`);
          output.push(...flatten(node, attr.children, label, optional || attr.cardinality[0] === '0', inheritedKey || attr.key));
          report.push(`${node.name}.${label}: attributo composto sostituito dalle componenti semplici.`);
        } else output.push(plain(label, inheritedKey || attr.key, inheritedKey || attr.key ? '1,1' : `${min},1`));
      });
      if (new Set(output.map(a => a.name.toLowerCase())).size !== output.length) throw Error(`${node.name}: nomi duplicati dopo l’appiattimento; rinomina gli attributi in conflitto.`);
      return output;
    }
    [...model.entities, ...model.relationships].forEach(n => { n.attributes = flatten(n, n.attributes); n.attributePositions = {}; if (n.attributeSides) n.attributeSides = {}; });
    model.constraints = [...new Set(constraints)];
    return { model: ER.layout(ER.validate(model)), report };
  }
  ER.restructure = restructure;
  function upgradeMultivalues(raw) {
    const result = { model: ER.validate(raw.model), report: [...raw.report], renames: Object.create(null) };
    result.report = result.report.map(line => {
      const match = line.match(/: estratto in ([^;]+); identificatore /);
      const value = match && result.model.entities.find(e => e.name === match[1] && e.externalKey);
      if (!value) return line;
      const compound = value.attributes.length > 1 || result.model.entities.some(e => e.externalKey?.owners.some(o => o.entity === value.id));
      const ordinal = compound && value.attributes.find(a => a.name === value.externalKey.attributes[0] && /^progressivo(?:_\d+)?$/.test(a.name));
      const renames = Object.create(null);
      if (ordinal) { renames[ordinal.name] = 'id'; ordinal.name = 'id'; ordinal.key = true; }
      else {
        value.attributes.filter(a => a.name.toLowerCase() === 'id').forEach(a => {
          let name = 'valore_id', i = 2;
          while (value.attributes.some(other => other.name.toLowerCase() === name.toLowerCase())) name = `valore_id_${i++}`;
          renames[a.name] = name; a.name = name;
        });
        value.attributes.unshift({ name: 'id', key: true, cardinality: '1,1' });
        value.attributePositions = {}; value.attributeSides = {};
      }
      delete value.externalKey;
      result.renames[value.id] = renames;
      result.model.constraints ||= [];
      result.model.constraints = result.model.constraints.map(c => c.startsWith(`${value.name}: progressivo univoco per proprietario; `) ? c.replace('progressivo univoco per proprietario; ', '') : c);
      const constraint = `${value.name}: due valori completi uguali non devono comparire due volte per lo stesso proprietario.`;
      if (!result.model.constraints.includes(constraint)) result.model.constraints.push(constraint);
      return line.replace(/; identificatore .*; cardinalità /, ', con identificatore proprio id e valore separato; cardinalità ');
    });
    result.model = ER.validate(result.model);
    return result;
  }
  ER.upgradeMultivalues = upgradeMultivalues;
  if (typeof module !== 'undefined' && module.exports) module.exports = { restructure };
})(globalThis);

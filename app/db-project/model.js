(function (root) {
  'use strict';
  const cards = ['0,1', '1,1', '0,N', '1,N'];
  const uid = () => 'n' + (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2));
  const copy = value => JSON.parse(JSON.stringify(value));
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function name(value, context) {
    if (typeof value !== 'string' || !value.trim() || value.length > 80 || /[\n\r\[\]:]/.test(value)) throw Error(`${context}: usa un nome di 1–80 caratteri, senza :, parentesi quadre o a capo.`);
    if ((context === 'Entità' || context === 'Ruolo') && /[()]/.test(value)) throw Error(`${context}: le parentesi tonde sono riservate ai ruoli nella descrizione testuale.`);
    return value.trim();
  }
  function attributes(text) {
    const result = [], levels = [result], parents = [];
    let previous = -1, count = 0;
    text.split('\n').filter(s => s.trim()).forEach(source => {
      if (/\t/.test(source)) throw Error('Attributi composti: usa due spazi per livello, senza tabulazioni.');
      const depth = (source.length - source.trimStart().length) / 2, line = source.trim();
      if (!Number.isInteger(depth) || depth > previous + 1 || depth > 4 || ++count > 60) throw Error('Attributi composti: due spazi per livello, massimo 5 livelli e 60 attributi complessivi.');
      if (depth > previous && depth) { const parent = parents[depth - 1]; parent.children = []; levels[depth] = parent.children; }
      const match = line.match(/^(.+?)(?:\s*\[(.*?)\])?$/);
      const label = name(match[1], 'Attributo');
      if (levels[depth].some(a => a.name.toLowerCase() === label.toLowerCase())) throw Error(`Attributo duplicato: ${label}.`);
      const flag = (match[2] || '1,1').replace(/\s/g, '').toUpperCase();
      const key = flag === 'ID' || flag === 'PK';
      if (!key && !cards.includes(flag)) throw Error(`Attributo ${label}: usa [ID], [PK], [0,1], [1,1], [0,N] o [1,N].`);
      const attr = { name: label, key, cardinality: key ? '1,1' : flag };
      levels[depth].push(attr); parents[depth] = attr; previous = depth;
    });
    return result;
  }
  const attributeText = (attrs, depth = 0) => attrs.map(a => `${'  '.repeat(depth)}${a.name}${a.key ? ' [ID]' : a.cardinality !== '1,1' ? ` [${a.cardinality}]` : ''}${a.children?.length ? '\n' + attributeText(a.children, depth + 1) : ''}`).join('\n');
  function attributeEntries(attrs, prefix = '', parent = null, depth = 0) {
    return attrs.flatMap((a, i) => {
      const path = prefix ? `${prefix}.${i}` : `${i}`;
      return [{ attr: a, path, parent, depth }, ...attributeEntries(a.children || [], path, path, depth + 1)];
    });
  }
  function validate(input) {
    if (!input || !Array.isArray(input.entities) || !Array.isArray(input.relationships)) throw Error('Il progetto deve contenere entities e relationships.');
    if (input.entities.length > 60 || input.relationships.length > 120) throw Error('Questa versione supporta fino a 60 entità e 120 associazioni.');
    const model = { version: 1, title: name(input.title || 'Nuovo schema', 'Titolo'), entities: [], relationships: [] };
    const ids = new Set(), names = new Set();
    function node(raw, kind) {
      if (!raw || typeof raw !== 'object') throw Error(`${kind} non valida.`);
      const id = raw.id;
      if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(id) || ids.has(id)) throw Error(`${kind}: identificatore non valido o duplicato.`);
      ids.add(id);
      let attributeCount = 0;
      function checkAttributes(list, depth = 0, inheritedKey = false, optional = false, multi = false) {
      if (!Array.isArray(list) || list.length > 30 || depth > 4) throw Error(`${kind}: massimo 30 attributi per livello e 5 livelli.`);
      return list.map(a => {
        if (++attributeCount > 60) throw Error(`${kind}: massimo 60 attributi complessivi.`);
        if (!a || typeof a.key !== 'boolean' || !cards.includes(a.cardinality) || (a.key && a.cardinality !== '1,1')) throw Error(`${kind}: attributo non valido; un identificatore deve essere (1,1).`);
        if ((a.key || inheritedKey) && (optional || multi || a.cardinality !== '1,1')) throw Error('Un identificatore composto deve avere componenti obbligatorie e monovalore.');
        const attr = { name: name(a.name, 'Attributo'), key: a.key, cardinality: a.cardinality };
        if (a.children != null) {
          if (!Array.isArray(a.children) || !a.children.length) throw Error('Un attributo composto deve avere almeno una componente.');
          attr.children = checkAttributes(a.children, depth + 1, inheritedKey || a.key, optional || a.cardinality[0] === '0', multi || a.cardinality.endsWith('N'));
        }
        return attr;
      });
      }
      const attrs = checkAttributes(raw.attributes);
      attributes(attributeText(attrs));
      for (const axis of ['x', 'y']) if (raw[axis] != null && (!Number.isFinite(raw[axis]) || Math.abs(raw[axis]) > 50000)) throw Error('Posizione del nodo non valida.');
      const side = raw.side || 'top';
      if (!['top', 'bottom', 'left', 'right'].includes(side)) throw Error('Lato degli attributi non valido.');
      const offsets = {};
      if (raw.attributePositions != null) {
        if (typeof raw.attributePositions !== 'object' || Array.isArray(raw.attributePositions)) throw Error('Posizioni degli attributi non valide.');
        Object.entries(raw.attributePositions).forEach(([i, pos]) => {
          if (!attributeEntries(attrs).some(a => a.path === i) || !pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y) || Math.abs(pos.x) > 5000 || Math.abs(pos.y) > 5000) throw Error('Posizione dell’attributo non valida.');
          offsets[i] = { x: pos.x, y: pos.y };
        });
      }
      const result = { id, name: name(raw.name, kind), attributes: attrs, x: raw.x ?? 0, y: raw.y ?? 0, side, attributePositions: offsets };
      if (raw.attributeSides != null) {
        if (!raw.attributeSides || typeof raw.attributeSides !== 'object' || Array.isArray(raw.attributeSides)) throw Error('Lati degli attributi non validi.');
        result.attributeSides = {};
        Object.entries(raw.attributeSides).forEach(([path, side]) => {
          if (!attributeEntries(attrs).some(e => e.path === path) || !['top', 'bottom', 'left', 'right'].includes(side)) throw Error('Lato del singolo attributo non valido.');
          result.attributeSides[path] = side;
        });
      }
      return result;
    }
    input.entities.forEach(raw => {
      const entity = node(raw, 'Entità');
      if (names.has(entity.name.toLowerCase())) throw Error(`Entità duplicata: ${entity.name}.`);
      names.add(entity.name.toLowerCase()); model.entities.push(entity);
    });
    input.relationships.forEach(raw => {
      const relationship = node(raw, 'Associazione');
      if (!Array.isArray(raw.ends) || raw.ends.length !== 2) throw Error(`${relationship.name}: servono due partecipanti.`);
      relationship.ends = raw.ends.map(end => {
        if (!end || !model.entities.some(e => e.id === end.entity)) throw Error(`${relationship.name}: entità inesistente.`);
        if (!cards.includes(end.cardinality)) throw Error(`${relationship.name}: cardinalità non valida.`);
        if (end.role != null && typeof end.role !== 'string') throw Error('Ruolo non valido.');
        const role = end.role?.trim() || '';
        if (role) name(role, 'Ruolo');
        return { entity: end.entity, cardinality: end.cardinality, role };
      });
      if (relationship.ends[0].entity === relationship.ends[1].entity && (!relationship.ends[0].role || !relationship.ends[1].role || relationship.ends[0].role.toLowerCase() === relationship.ends[1].role.toLowerCase())) throw Error(`${relationship.name}: per un’associazione ricorsiva indica due ruoli distinti.`);
      model.relationships.push(relationship);
    });
    if (input.hierarchies != null) {
      if (!Array.isArray(input.hierarchies) || input.hierarchies.length > 60) throw Error('Gerarchie non valide: massimo 60.');
      const children = new Set(), parents = new Set();
      model.hierarchies = input.hierarchies.map(h => {
        if (!h || typeof h.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(h.id) || ids.has(h.id)) throw Error('Gerarchia: identificatore non valido o duplicato.');
        ids.add(h.id);
        if (!model.entities.some(e => e.id === h.parent) || parents.has(h.parent) || !Array.isArray(h.children) || !h.children.length) throw Error('Gerarchia: scegli un padre e almeno una figlia; un padre può avere una sola gerarchia.');
        parents.add(h.parent);
        h.children.forEach(id => {
          if (id === h.parent || children.has(id) || !model.entities.some(e => e.id === id)) throw Error('Gerarchia: ogni figlia deve esistere e avere un solo padre.');
          children.add(id);
        });
        if (typeof h.total !== 'boolean' || typeof h.disjoint !== 'boolean' || !['up', 'down', 'keep'].includes(h.strategy || 'keep')) throw Error('Gerarchia: indica copertura, esclusività e strategia.');
        if (h.strategy === 'down' && !h.total) throw Error('Il padre può essere eliminato solo in una gerarchia totale.');
        return { id: h.id, parent: h.parent, children: [...h.children], total: h.total, disjoint: h.disjoint, strategy: h.strategy || 'keep' };
      });
      model.entities.forEach(e => {
        let id = e.id; const seen = new Set();
        while (id) { if (seen.has(id)) throw Error('La gerarchia contiene un ciclo.'); seen.add(id); id = model.hierarchies.find(h => h.children.includes(id))?.parent; }
      });
    }
    input.entities.forEach((raw, i) => {
      if (raw.externalKey != null) {
        const key = raw.externalKey;
        if (!key || !Array.isArray(key.attributes) || !Array.isArray(key.owners) || !key.owners.length || key.attributes.some(a => !model.entities[i].attributes.some(b => b.name === a && !b.children && b.cardinality === '1,1')) || new Set(key.attributes).size !== key.attributes.length) throw Error('Identificatore esterno non valido.');
        key.owners.forEach(o => {
          const r = o && model.relationships.find(r => r.id === o.relationship);
          if (!o || o.entity === raw.id || !model.entities.some(e => e.id === o.entity) || !r?.ends.some(e => e.entity === raw.id && e.cardinality === '1,1') || !r.ends.some(e => e.entity === o.entity)) throw Error('Identificatore esterno: proprietario o associazione non validi.');
        });
        model.entities[i].externalKey = { attributes: [...key.attributes], owners: key.owners.map(o => ({ entity: o.entity, relationship: o.relationship })) };
      }
    });
    if (input.constraints != null) {
      if (!Array.isArray(input.constraints) || input.constraints.length > 1000 || input.constraints.some(c => typeof c !== 'string' || !c.trim() || c.length > 2000 || /[\n\r]/.test(c))) throw Error('Vincoli non validi.');
      model.constraints = [...input.constraints];
    }
    return model;
  }
  function parse(text) {
    if (text.length > 1000000) throw Error('La descrizione è troppo grande (massimo 1 MB).');
    const model = { title: 'Nuovo schema', entities: [], relationships: [] };
    let current = null, attrLines = [];
    const pending = [], hierarchies = [], externalKeys = [];
    const flush = () => { if (current) current.attributes = attributes(attrLines.join('\n')); attrLines = []; };
    text.split('\n').forEach((source, index) => {
      const line = source.trim();
      if (!line || line.startsWith('#')) return;
      try {
        if (/^TITOLO\s*:/i.test(line)) { model.title = name(line.replace(/^TITOLO\s*:/i, ''), 'Titolo'); return; }
        if (/^VINCOLO\s*:/i.test(line)) { (model.constraints ||= []).push(line.replace(/^VINCOLO\s*:/i, '').trim()); return; }
        if (/^GERARCHIA\s*:/i.test(line)) {
          flush(); current = null;
          const match = line.match(/^GERARCHIA:\s*(.+?)\s*\[(TOTALE|PARZIALE),\s*(ESCLUSIVA|SOVRAPPOSTA)(?:,\s*(PADRE|FIGLIE|SEPARATE))?\]\s*->\s*(.+)$/i);
          if (!match) throw Error('Sintassi: GERARCHIA: Persona [TOTALE, ESCLUSIVA, SEPARATE] -> Studente, Docente.');
          hierarchies.push({ parent: match[1].trim(), children: match[5].split(',').map(s => s.trim()), total: match[2].toUpperCase() === 'TOTALE', disjoint: match[3].toUpperCase() === 'ESCLUSIVA', strategy: ({ PADRE: 'up', FIGLIE: 'down', SEPARATE: 'keep' })[(match[4] || 'SEPARATE').toUpperCase()] }); return;
        }
        if (/^IDENTIFICATORE ESTERNO\s*:/i.test(line)) {
          const match = line.match(/^IDENTIFICATORE ESTERNO:\s*(.+?):\s*(.*?)\s*->\s*(.+)$/i);
          if (!match) throw Error('Identificatore esterno non valido.');
          externalKeys.push({ entity: match[1].trim(), attributes: match[2].trim() ? match[2].split(',').map(s => s.trim()) : [], owners: match[3].split(';').map(s => s.trim()) }); return;
        }
        if (/^ENTITÀ\s*:|^ENTITA\s*:/i.test(line)) {
          flush(); current = { id: uid(), name: name(line.replace(/^ENTIT[ÀA]\s*:/i, ''), 'Entità'), attributes: [] };
          model.entities.push(current); return;
        }
        if (/^ASSOCIAZIONE\s*:/i.test(line)) {
          flush();
          const match = line.match(/^ASSOCIAZIONE\s*:\s*(.+?)\s*:\s*(.+?)\s*\[\s*([01]\s*,\s*[1N])\s*\]\s*->\s*(.+?)\s*\[\s*([01]\s*,\s*[1N])\s*\]$/i);
          if (!match) throw Error('Sintassi: ASSOCIAZIONE: pubblica: Utente [0,N] -> Post [1,1].');
          current = { id: uid(), name: name(match[1], 'Associazione'), attributes: [] };
          model.relationships.push(current); pending.push({ node: current, ends: [[match[2], match[3]], [match[4], match[5]]], line: index + 1 }); return;
        }
        if (!line.startsWith('-') || !current) throw Error('Usa ENTITA:, ASSOCIAZIONE: oppure - nome_attributo.');
        attrLines.push(source.match(/^(\s*)-/)[1] + line.slice(1).trim());
      } catch (error) { throw Error(`Riga ${index + 1}: ${error.message}`); }
    });
    flush();
    pending.forEach(({ node, ends, line }) => {
      node.ends = ends.map(([label, card]) => {
        const match = label.trim().match(/^(.+?)(?:\s*\((.+)\))?$/);
        const entity = model.entities.find(e => e.name.toLowerCase() === match[1].trim().toLowerCase());
        if (!entity) throw Error(`Riga ${line}: entità ${match[1].trim()} non definita.`);
        return { entity: entity.id, role: match[2]?.trim() || '', cardinality: card.replace(/\s/g, '').toUpperCase() };
      });
    });
    const entityId = label => { const e = model.entities.find(e => e.name.toLowerCase() === label.toLowerCase()); if (!e) throw Error(`Entità ${label} non definita.`); return e.id; };
    if (hierarchies.length) model.hierarchies = hierarchies.map(h => ({ ...h, id: uid(), parent: entityId(h.parent), children: h.children.map(entityId) }));
    externalKeys.forEach(k => {
      const e = model.entities.find(e => e.id === entityId(k.entity));
      e.externalKey = { attributes: k.attributes, owners: k.owners.map(label => {
        const m = label.match(/^(.+?)\s*\((.+)\)$/), owner = m && entityId(m[1].trim()), r = m && model.relationships.find(r => r.name === m[2] && r.ends.some(end => end.entity === e.id) && r.ends.some(end => end.entity === owner));
        if (!r) throw Error('Associazione dell’identificatore esterno non definita.'); return { entity: owner, relationship: r.id };
      }) };
    });
    return layout(validate(model));
  }
  function serialize(model) {
    const lines = [`TITOLO: ${model.title}`, ''];
    const attrLines = attrs => attributeText(attrs).split('\n').filter(Boolean).map(s => s.match(/^\s*/)[0] + '- ' + s.trim());
    model.entities.forEach(e => { lines.push(`ENTITA: ${e.name}`, ...attrLines(e.attributes), ''); });
    model.relationships.forEach(r => {
      const ends = r.ends.map(end => `${model.entities.find(e => e.id === end.entity).name}${end.role ? ` (${end.role})` : ''} [${end.cardinality}]`);
      lines.push(`ASSOCIAZIONE: ${r.name}: ${ends.join(' -> ')}`, ...attrLines(r.attributes), '');
    });
    const entityName = id => model.entities.find(e => e.id === id).name;
    (model.hierarchies || []).forEach(h => lines.push(`GERARCHIA: ${entityName(h.parent)} [${h.total ? 'TOTALE' : 'PARZIALE'}, ${h.disjoint ? 'ESCLUSIVA' : 'SOVRAPPOSTA'}, ${{ up: 'PADRE', down: 'FIGLIE', keep: 'SEPARATE' }[h.strategy]}] -> ${h.children.map(entityName).join(', ')}`, ''));
    model.entities.filter(e => e.externalKey).forEach(e => lines.push(`IDENTIFICATORE ESTERNO: ${e.name}: ${e.externalKey.attributes.join(', ')} -> ${e.externalKey.owners.map(o => `${entityName(o.entity)} (${model.relationships.find(r => r.id === o.relationship).name})`).join('; ')}`, ''));
    (model.constraints || []).forEach(c => lines.push(`VINCOLO: ${c}`));
    return lines.join('\n');
  }
  function layout(model) {
    const nodes = [...model.entities, ...model.relationships];
    // Start from the schema, not the previous drawing: repeating Riordina must be stable.
    nodes.forEach(n => { n.x = n.y = 0; n.side = 'top'; n.attributeSides = {}; n.attributePositions = {}; });
    if (!model.entities.length) return model;
    const footprints = new Map();
    function measuredBounds(node) {
      const key = `${node.id}:${node.side}:${JSON.stringify(node.attributeSides)}`;
      if (!footprints.has(key)) footprints.set(key, nodeBounds({ ...node, x: 0, y: 0 }));
      const box = footprints.get(key);
      return { left: box.left + node.x, right: box.right + node.x, top: box.top + node.y, bottom: box.bottom + node.y };
    }
    const entities = new Map(model.entities.map(e => [e.id, e]));
    const links = model.relationships.map(r => r.ends.map(end => end.entity)).filter(([a, b]) => a !== b);
    (model.hierarchies || []).forEach(h => h.children.forEach(id => links.push([h.parent, id])));
    const depthOf = id => { const h = (model.hierarchies || []).find(h => h.children.includes(id)); return h ? 1 + depthOf(h.parent) : 0; };
    const depths = new Map(model.entities.map(e => [e.id, depthOf(e.id)]));
    const degree = id => links.filter(pair => pair.includes(id)).length;
    const order = [...model.entities].sort((a, b) => depths.get(a.id) - depths.get(b.id) || degree(b.id) - degree(a.id) || links.findIndex(pair => pair.includes(a.id)) - links.findIndex(pair => pair.includes(b.id))).map(e => e.id);
    function topologyScore(positions) {
      let score = 0;
      const segments = links.map(([a, b]) => [positions.get(a), positions.get(b)]);
      segments.forEach(([a, b]) => {
        const dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y);
        score += 10 * (dx + dy) + (dx && dy ? 35 : 0);
        positions.forEach(p => {
          if (p === a || p === b) return;
          if ((!dx && p.x === a.x && p.y > Math.min(a.y, b.y) && p.y < Math.max(a.y, b.y)) ||
              (!dy && p.y === a.y && p.x > Math.min(a.x, b.x) && p.x < Math.max(a.x, b.x))) score += 150;
        });
      });
      const cross = (a, b, p) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
      segments.forEach(([a, b], i) => segments.slice(i + 1).forEach(([c, d]) => {
        if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) score += 60;
      }));
      return score;
    }
    function arrangeAttributes(node, blocked) {
      const sides = ['top', 'bottom', 'left', 'right'];
      let best, bestScore = Infinity;
      const candidates = sides.map(side => ({ side, attributeSides: {} }));
      // Keep compound attributes together; split long fans over the free sides.
      const free = sides.filter(s => !blocked[s]);
      if (node.attributes.length > 7 && free.length > 1) {
        const groups = [free, ...free.flatMap((s, i) => free.slice(i + 1).map(t => [s, t]))];
        groups.forEach(group => {
          const attributeSides = {};
          node.attributes.forEach((_, i) => { attributeSides[i] = group[Math.min(group.length - 1, Math.floor(i * group.length / node.attributes.length))]; });
          candidates.push({ side: group[0], attributeSides });
        });
      }
      candidates.forEach(candidate => {
        Object.assign(node, candidate);
        const box = measuredBounds(node), width = box.right - box.left, height = box.bottom - box.top;
        const used = new Set(attributeEntries(node.attributes).map(e => attributeSide(node, e.path)));
        const conflicts = [...used].reduce((sum, side) => sum + (blocked[side] || 0), 0);
        const lateral = [...used].filter(s => s === 'left' || s === 'right').length;
        const rows = ['top', 'bottom'].reduce((sum, side) => sum + Math.floor(Math.max(0, node.attributes.filter((_, i) => attributeSide(node, i) === side).length - 1) / 7), 0);
        const score = conflicts * 1e9 + width * height + height * height * .4 + rows * 60000 + lateral * 120000 + (used.size - 1) * 12000 + sides.indexOf(candidate.side);
        if (score < bestScore) { bestScore = score; best = candidate; }
      });
      Object.assign(node, best);
    }
    let best, bestScore = Infinity;
    const count = model.entities.length, root = Math.ceil(Math.sqrt(count));
    const columnChoices = [...new Set([Math.max(1, root - 1), root, Math.min(count, root + 1), 1, ...(count <= 8 ? [count] : [])])];
    columnChoices.forEach(columns => {
      const positions = new Map();
      let row = 0;
      [...new Set(order.map(id => depths.get(id)))].forEach(depth => {
        const level = order.filter(id => depths.get(id) === depth);
        level.forEach((id, i) => positions.set(id, { x: i % columns, y: row + Math.floor(i / columns) }));
        row += Math.ceil(level.length / columns);
      });
      let score = topologyScore(positions);
      // ponytail: two bounded swap passes; use a graph-layout engine if large dense graphs need global optimization.
      for (let pass = 0; pass < 2; pass++) for (let i = 0; i < count; i++) for (let j = i + 1; j < Math.min(count, count <= 16 ? count : i + 5); j++) {
        const a = order[i], b = order[j];
        if (depths.get(a) !== depths.get(b)) continue;
        const pa = positions.get(a), pb = positions.get(b);
        positions.set(a, pb); positions.set(b, pa);
        const next = topologyScore(positions);
        if (next < score) score = next;
        else { positions.set(a, pa); positions.set(b, pb); }
      }
      model.entities.forEach(e => {
        const p = positions.get(e.id), blocked = {};
        links.filter(pair => pair.includes(e.id)).forEach(pair => {
          const other = positions.get(pair.find(id => id !== e.id));
          if (other.x !== p.x) blocked[other.x > p.x ? 'right' : 'left'] = 1;
          if (other.y !== p.y) blocked[other.y > p.y ? 'bottom' : 'top'] = 1;
        });
        if (model.relationships.some(r => r.ends.every(end => end.entity === e.id))) blocked.right = 1;
        arrangeAttributes(e, blocked);
      });
      model.relationships.forEach(r => {
        const [a, b] = r.ends.map(end => positions.get(end.entity));
        const blocked = a.x === b.x && a.y !== b.y ? { top: 1, bottom: 1 } : { left: 1, right: 1 };
        arrangeAttributes(r, blocked);
      });
      // A shared center grid keeps aligned entities aligned despite different attribute fans.
      const radius = (boxes, axis) => Math.max(0, ...boxes.flatMap(b => axis === 'x' ? [-b.left, b.right] : [-b.top, b.bottom]));
      const spacing = axis => Math.max(260, 2 * (radius(model.entities.map(measuredBounds), axis) + radius(model.relationships.map(measuredBounds), axis) + 55));
      let cellWidth = spacing('x'), cellHeight = spacing('y');
      const lastColumn = Math.max(...[...positions.values()].map(p => p.x)), lastRow = row - 1;
      // Very wide compound trees must not push centers beyond the saved coordinate range.
      if (lastColumn * cellWidth > 90000 || lastRow * cellHeight > 90000) {
        nodes.forEach(n => { n.side = 'top'; n.attributeSides = {}; });
        cellWidth = spacing('x'); cellHeight = spacing('y'); score += 1000;
      }
      if (lastColumn * cellWidth > 90000 || lastRow * cellHeight > 90000) score += 1e12;
      model.entities.forEach(e => { const p = positions.get(e.id); e.x = p.x * cellWidth; e.y = p.y * cellHeight; });
      const boxes = model.entities.map(measuredBounds);
      const width = Math.max(...boxes.map(b => b.right)) - Math.min(...boxes.map(b => b.left));
      const height = Math.max(...boxes.map(b => b.bottom)) - Math.min(...boxes.map(b => b.top));
      const lateral = nodes.filter(n => n.attributes.length && (n.side === 'left' || n.side === 'right')).length;
      score += lateral * 15 + 12 * Math.abs(Math.log(width / height / 1.65)) + width * height / 1e6;
      if (score < bestScore) { bestScore = score; best = nodes.map(n => ({ x: n.x, y: n.y, side: n.side, attributeSides: n.attributeSides })); }
      nodes.forEach(n => { n.x = n.y = 0; });
    });
    nodes.forEach((n, i) => Object.assign(n, best[i]));
    const occupied = model.entities.map(measuredBounds);
    const groups = new Map();
    model.relationships.forEach(r => {
      const key = r.ends.map(e => e.entity).sort().join('|');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    });
    groups.forEach(group => group.forEach((r, index) => {
      const [a, b] = r.ends.map(end => entities.get(end.entity));
      const dx = b.x - a.x, dy = b.y - a.y, distance = Math.hypot(dx, dy) || 1;
      const perpendicular = { x: -dy / distance, y: dx / distance };
      if (a.id === b.id) { r.x = a.x + 240; r.y = a.y + 130 + index * 140; }
      else {
        const span = Math.max(...group.map(n => { const box = measuredBounds(n); return Math.abs(perpendicular.x) * (box.right - box.left) + Math.abs(perpendicular.y) * (box.bottom - box.top); })) + 70;
        const offset = (index - (group.length - 1) / 2) * span;
        r.x = (a.x + b.x) / 2 - dy / distance * offset; r.y = (a.y + b.y) / 2 + dx / distance * offset;
      }
      const origin = { x: r.x, y: r.y };
      const fits = () => {
        const box = measuredBounds(r);
        return occupied.every(b => box.right + 55 <= b.left || box.left >= b.right + 55 || box.bottom + 55 <= b.top || box.top >= b.bottom + 55);
      };
      for (let ring = 1; !fits(); ring++) {
        // Stay on the perpendicular bisector: both participants remain equally distant.
        const candidates = a.id !== b.id ? [perpendicular, { x: -perpendicular.x, y: -perpendicular.y }].map(p => ({ x: p.x * ring, y: p.y * ring })) : [{ x: ring, y: 0 }, { x: 0, y: ring }];
        for (const p of candidates) { r.x = origin.x + p.x * 120; r.y = origin.y + p.y * 120; if (fits()) break; }
      }
      occupied.push(measuredBounds(r));
    }));
    const boxes = nodes.map(measuredBounds), left = Math.min(...boxes.map(b => b.left)), top = Math.min(...boxes.map(b => b.top));
    const shiftX = Math.min(80 - left, 50000 - Math.max(...nodes.map(n => n.x)));
    const shiftY = Math.min(80 - top, 50000 - Math.max(...nodes.map(n => n.y)));
    nodes.forEach(n => { n.x += shiftX; n.y += shiftY; });
    return model;
  }
  function example(restructured = false) {
    const model = parse(`TITOLO: TikTok · ${restructured ? 'ristrutturato' : 'concettuale'}
ENTITA: Utente
- id [ID]
- username
- nome
- cognome
- soprannome [0,1]
- email
- password
- data_nascita
- sesso
- foto_profilo
- numero_telefono [0,1]
- data_creazione
- stato_profilo_attivo
ENTITA: Post
- id [ID]
- testo
- data_creazione
- orario_creazione
- foto [0,1]
- video [0,1]
${restructured ? '' : '- hashtag [0,N]'}
ENTITA: Commento
- id [ID]
- testo
- data_orario_creazione
ENTITA: Messaggio
- id [ID]
- testo
- data_orario_invio
ENTITA: Canzone
- id [ID]
- titolo
- durata
${restructured ? '' : '- artista [1,N]'}
${restructured ? `ENTITA: Hashtag
- id [ID]
- nome
ENTITA: Versione
- id [ID]
- anno
ENTITA: Artista
- id [ID]
- nominativo` : ''}
ASSOCIAZIONE: pubblica_p: Utente [0,N] -> Post [1,1]
ASSOCIAZIONE: pubblica_c: Utente [0,N] -> Commento [1,1]
ASSOCIAZIONE: relativo_a: Commento [1,1] -> Post [0,N]
ASSOCIAZIONE: invia: Utente [0,N] -> Messaggio [1,1]
ASSOCIAZIONE: riceve: Utente [0,N] -> Messaggio [1,1]
ASSOCIAZIONE: segue: Utente (follower) [0,N] -> Utente (seguito_da) [0,N]
ASSOCIAZIONE: utilizza: Post [0,N] -> Canzone [0,N]
- inizio
- durata
${restructured ? `ASSOCIAZIONE: inserito_in: Post [0,N] -> Hashtag [1,N]
ASSOCIAZIONE: ha: Canzone [1,N] -> Versione [1,1]
ASSOCIAZIONE: interpreta: Versione [1,N] -> Artista [0,N]` : ''}`);
    const positions = { Commento: [260, 270, 'top'], Post: [1020, 270, 'top'], Utente: [1020, 820, 'bottom'], Messaggio: [260, 820, 'bottom'], Canzone: [1650, 530, 'right'], Hashtag: [1650, 270, 'top'], Versione: [1650, 910, 'right'], Artista: [1650, 1280, 'bottom'] };
    const relations = { relativo_a: [640, 270], pubblica_p: [1020, 550], pubblica_c: [640, 480], invia: [640, 1140], riceve: [640, 740], segue: [1420, 820], utilizza: [1340, 530], inserito_in: [1340, 270], ha: [1650, 730], interpreta: [1650, 1100] };
    model.entities.forEach(e => { [e.x, e.y, e.side] = positions[e.name]; });
    model.relationships.forEach(r => { [r.x, r.y] = relations[r.name]; });
    return model;
  }
  function dimensions(node, relationship) {
    return relationship ? { w: Math.max(94, textWidth(node.name, 20) / 2 + 25), h: 48 } : { w: Math.max(85, textWidth(node.name, 20) / 2 + 24), h: 32 };
  }
  // Conservative font estimates also work in Node and for wide/Unicode names.
  const textWidth = (text, size = 17) => [...text].reduce((sum, c) => sum + (/[MW@%]|[^\u0000-\u024f]/u.test(c) ? 18 : /[A-Z]/.test(c) ? 13 : /[mw]/.test(c) ? 15 : 10), 0) * size / 17;
  function anchor(node, toward, relationship, force) {
    const { w, h } = dimensions(node, relationship);
    const dx = toward.x - node.x, dy = toward.y - node.y;
    if (force === 'top') return { x: node.x - w * .36, y: node.y - h };
    if (force === 'bottom') return { x: node.x + w * .36, y: node.y + h };
    const scale = relationship ? 1 / (Math.abs(dx) / w + Math.abs(dy) / h || 1) : Math.min(w / (Math.abs(dx) || .001), h / (Math.abs(dy) || .001));
    return { x: node.x + dx * scale, y: node.y + dy * scale };
  }
  function attributePosition(node, index) {
    if (node.attributePositions?.[index]) return { x: node.x + node.attributePositions[index].x, y: node.y + node.attributePositions[index].y };
    if (Object.keys(node.attributeSides || {}).length) {
      const side = attributeSide(node, String(index)), entries = attributeEntries(node.attributes), mapping = {};
      const sameSide = entries.filter(e => attributeSide(node, e.path) === side);
      function build(entry, virtualPath) {
        mapping[entry.path] = virtualPath;
        const result = { ...entry.attr }; delete result.children;
        const children = sameSide.filter(e => e.parent === entry.path);
        if (children.length) result.children = children.map((e, i) => build(e, `${virtualPath}.${i}`));
        return result;
      }
      const roots = sameSide.filter(e => !sameSide.some(p => p.path === e.parent));
      const virtual = { ...node, side, attributes: roots.map((e, i) => build(e, `${i}`)), attributeSides: {}, attributePositions: {} };
      return attributePosition(virtual, mapping[String(index)]);
    }
    if (node.attributes.some(a => a.children)) {
      const positions = {}, width = a => Math.max(textWidth(a.name + (a.cardinality === '1,1' ? '' : ` (${a.cardinality})`)) + 36, (a.children || []).reduce((sum, child) => sum + width(child), 0));
      const entries = attributeEntries(node.attributes), maxDepth = Math.max(...entries.map(e => e.depth));
      const horizontal = node.side === 'left' || node.side === 'right', direction = node.side === 'left' || node.side === 'top' ? -1 : 1;
      function place(a, path, center, depth, row) {
        positions[path] = horizontal ? { x: node.x + direction * (175 + depth * 220), y: node.y + center } : { x: node.x + center, y: node.y + direction * (115 + depth * 110 + row * (maxDepth + 2) * 110) };
        let cursor = center - (a.children || []).reduce((sum, c) => sum + width(c), 0) / 2;
        (a.children || []).forEach((c, i) => { const w = width(c); place(c, `${path}.${i}`, cursor + w / 2, depth + 1, row); cursor += w; });
      }
      const perRow = horizontal ? node.attributes.length : 7;
      for (let start = 0; start < node.attributes.length; start += perRow) {
        const row = node.attributes.slice(start, start + perRow); let cursor = -row.reduce((sum, a) => sum + width(a), 0) / 2;
        row.forEach((a, i) => { const w = width(a); place(a, `${start + i}`, cursor + w / 2, 0, Math.floor(start / perRow)); cursor += w; });
      }
      return positions[String(index)];
    }
    index = +index;
    const count = node.attributes.length;
    if (node.side === 'left' || node.side === 'right') return { x: node.x + (node.side === 'left' ? -175 : 175), y: node.y + (index - (count - 1) / 2) * 32 };
    const column = index % 7, row = Math.floor(index / 7);
    const widths = node.attributes.slice(row * 7, row * 7 + 7).map(a => textWidth(a.name + (a.cardinality !== '1,1' ? ` (${a.cardinality})` : '')) + 26);
    return { x: node.x - widths.reduce((a, b) => a + b, 0) / 2 + widths.slice(0, column).reduce((a, b) => a + b, 0) + widths[column] / 2, y: node.y + (node.side === 'bottom' ? 1 : -1) * (115 + row * 80) };
  }
  function attributeSide(node, path) {
    let current = String(path);
    while (current) { if (node.attributeSides?.[current]) return node.attributeSides[current]; current = current.includes('.') ? current.slice(0, current.lastIndexOf('.')) : ''; }
    return node.side;
  }
  function nodeBoxes(node) {
    const { w, h } = dimensions(node, !!node.ends);
    const boxes = [{ left: node.x - w, right: node.x + w, top: node.y - h, bottom: node.y + h }];
    attributeEntries(node.attributes).forEach(({ attr, path }) => {
      const p = attributePosition(node, path), width = textWidth(attr.name + (attr.cardinality === '1,1' ? '' : ` (${attr.cardinality})`));
      const side = attributeSide(node, path);
      const left = side === 'left' ? p.x - 12 - width : side === 'right' ? p.x + 12 : p.x - width / 2;
      const baseline = p.y + (side === 'top' ? -14 : side === 'bottom' ? 21 : 5);
      boxes.push({ left: Math.min(left, p.x - 5), right: Math.max(left + width, p.x + 5), top: Math.min(baseline - 18, p.y - 5), bottom: Math.max(baseline + 12, p.y + 5) });
    });
    if (node.externalKey) {
      const label = `ID esterno: ${node.externalKey.attributes.join(' + ')}${node.externalKey.attributes.length ? ' + ' : ''}proprietario`, width = textWidth(label, 15);
      boxes.push({ left: node.x - width / 2, right: node.x + width / 2, top: node.y + h + 12, bottom: node.y + h + 40 });
    }
    return boxes;
  }
  function nodeBounds(node) {
    const boxes = nodeBoxes(node);
    return { left: Math.min(...boxes.map(b => b.left)), right: Math.max(...boxes.map(b => b.right)), top: Math.min(...boxes.map(b => b.top)), bottom: Math.max(...boxes.map(b => b.bottom)) };
  }
  function portOffset(entity, side, slot, count) {
    const { w, h } = dimensions(entity, false);
    return (slot - (count - 1) / 2) * Math.min(28, (side === 'top' || side === 'bottom' ? w * 1.5 : h * 1.5) / Math.max(1, count - 1));
  }
  function connectionSide(entity, relationship, recursive) {
    const counts = { top: 0, bottom: 0, left: 0, right: 0 };
    attributeEntries(entity.attributes).forEach(e => { counts[attributeSide(entity, e.path)]++; });
    if (recursive) return counts.right > counts.left ? 'left' : 'right';
    const dx = relationship.x - entity.x, dy = relationship.y - entity.y;
    let side = Math.abs(dx) >= Math.abs(dy) ? dx >= 0 ? 'right' : 'left' : dy >= 0 ? 'bottom' : 'top';
    if (counts[side]) {
      const options = side === 'top' || side === 'bottom' ? [dx >= 0 ? 'right' : 'left', dx >= 0 ? 'left' : 'right', side] : [dy >= 0 ? 'bottom' : 'top', dy >= 0 ? 'top' : 'bottom', side];
      side = options.reduce((best, s) => counts[s] < counts[best] ? s : best, side);
    }
    return side;
  }
  function render(model, selected = '') {
    const nodes = [...model.entities, ...model.relationships];
    let edges = '', shapes = '', bounds = [];
    const occupiedLabels = nodes.flatMap(nodeBoxes);
    (model.hierarchies || []).forEach(h => {
      const parent = model.entities.find(e => e.id === h.parent), children = h.children.map(id => model.entities.find(e => e.id === id));
      const side = connectionSide(parent, { x: parent.x, y: parent.y + 1000 }, false), size = dimensions(parent, false), box = nodeBounds(parent);
      const dx = side === 'right' ? 1 : side === 'left' ? -1 : 0;
      const p = { x: parent.x + dx * size.w, y: dx ? parent.y : parent.y + size.h };
      const junction = { x: dx > 0 ? box.right + 60 : dx < 0 ? box.left - 60 : p.x, y: Math.max(p.y + 70, box.bottom + 70) };
      const stem = dx ? `M${p.x},${p.y}H${junction.x}V${junction.y}` : `M${p.x},${p.y}V${junction.y}`;
      const arrow = dx ? `${p.x + dx * 3},${p.y} ${p.x + dx * 19},${p.y - 9} ${p.x + dx * 19},${p.y + 9}` : `${p.x},${p.y + 3} ${p.x - 9},${p.y + 19} ${p.x + 9},${p.y + 19}`;
      const label = `${h.total ? 'totale' : 'parziale'} · ${h.disjoint ? 'esclusiva' : 'sovrapposta'}`, lx = junction.x + 18, ly = junction.y - 12;
      edges += `<g class="hierarchy" data-hierarchy="${h.id}" tabindex="0" role="button" aria-label="Modifica gerarchia di ${escape(parent.name)}"><path class="connection" d="${stem}"/><polygon class="isa-arrow" points="${arrow}"/><text class="role" x="${lx}" y="${ly}">${label}</text>`;
      children.forEach(child => {
        const box = nodeBounds(child), right = parent.x > child.x, x = right ? box.right + 45 : box.left - 45, w = dimensions(child, false).w;
        const c = { x: child.x + (right ? w : -w), y: child.y };
        edges += `<polyline class="connection" points="${junction.x},${junction.y} ${x},${junction.y} ${x},${c.y} ${c.x},${c.y}"/>`;
        bounds.push(junction, c, { x, y: junction.y }, { x, y: c.y });
      });
      const labelBox = { left: lx, right: lx + textWidth(label, 15), top: ly - 20, bottom: ly + 8 };
      occupiedLabels.push(labelBox);
      edges += '</g>'; bounds.push(p, { x: junction.x, y: p.y }, { x: labelBox.right, y: labelBox.bottom });
    });
    // ponytail: separate lanes per entity side; add obstacle-aware routing if dense schemas need automatic avoidance.
    const ports = new Map();
    model.relationships.forEach(r => r.ends.forEach((end, index) => {
      const e = model.entities.find(n => n.id === end.entity), recursive = r.ends[0].entity === r.ends[1].entity;
      const side = connectionSide(e, r, recursive);
      const key = `${e.id}:${side}`; if (!ports.has(key)) ports.set(key, []);
      const rd = dimensions(r, true);
      const target = side === 'left' ? r.x + rd.w : side === 'right' ? r.x - rd.w : side === 'top' ? r.y + rd.h : r.y - rd.h;
      ports.get(key).push({ id: r.id, index, entity: e, side, recursive, order: side === 'left' || side === 'right' ? r.y : r.x, target });
    }));
    ports.forEach(group => {
      group.sort((a, b) => a.order - b.order || a.index - b.index);
      const lanes = [];
      group.forEach((p, slot) => {
        const start = (p.side === 'left' || p.side === 'right' ? p.entity.y : p.entity.x) + portOffset(p.entity, p.side, slot, group.length);
        const interval = [Math.min(start, p.order), Math.max(start, p.order)];
        let lane = p.recursive ? -1 : lanes.findIndex(ranges => ranges.every(r => interval[1] + 12 < r[0] || interval[0] > r[1] + 12));
        if (lane < 0) { lane = lanes.length; lanes.push([]); }
        lanes[lane].push(interval); p.lane = lane;
      });
      group.forEach(p => { p.lane -= (lanes.length - 1) / 2; });
      const e = group[0].entity, side = group[0].side, horizontal = side === 'left' || side === 'right', d = dimensions(e, false), box = nodeBounds(e);
      const direction = side === 'left' || side === 'top' ? -1 : 1, axis = horizontal ? e.x + direction * d.w : e.y + direction * d.h;
      const closest = group.reduce((best, p) => Math.abs(p.target - axis) < Math.abs(best - axis) ? p.target : best, group[0].target);
      const spacing = Math.min(36, Math.max(12, Math.abs(closest - axis) / (group.length + 1))), reserve = (lanes.length - 1) * spacing / 2 + 60;
      let base = axis + direction * Math.max(reserve, (closest - axis) * direction / 2);
      // Keep turns outside the attribute fan when a target lies beyond its side.
      const sides = attributeEntries(e.attributes).map(a => attributeSide(e, a.path));
      const towardFan = group.some(p => horizontal ? sides.includes('top') && p.order < e.y || sides.includes('bottom') && p.order > e.y : sides.includes('left') && p.order < e.x || sides.includes('right') && p.order > e.x);
      if (towardFan) base = direction > 0 ? Math.max(base, (horizontal ? box.right : box.bottom) + reserve) : Math.min(base, (horizontal ? box.left : box.top) - reserve);
      group.forEach(p => { p.elbow = base + p.lane * spacing; });
    });
    model.relationships.forEach(r => r.ends.forEach((end, index) => {
      const entity = model.entities.find(e => e.id === end.entity);
      const recursive = r.ends[0].entity === r.ends[1].entity;
      const side = connectionSide(entity, r, recursive), horizontal = side === 'left' || side === 'right';
      const group = ports.get(`${entity.id}:${side}`), slot = group.findIndex(p => p.id === r.id && p.index === index);
      const { w, h } = dimensions(entity, false), rd = dimensions(r, true);
      const offset = portOffset(entity, side, slot, group.length);
      const a = side === 'left' || side === 'right' ? { x: entity.x + (side === 'right' ? w : -w), y: entity.y + offset } : { x: entity.x + offset, y: entity.y + (side === 'bottom' ? h : -h) };
      const b = recursive ? { x: r.x, y: r.y + (index === 0 ? -rd.h : rd.h) } : horizontal ? { x: r.x + (r.x >= entity.x ? -rd.w : rd.w), y: r.y } : { x: r.x, y: r.y + (r.y >= entity.y ? -rd.h : rd.h) };
      let points;
      const elbow = group[slot].elbow;
      if (recursive) { const y = r.y + (index === 0 ? -115 : 115), x = a.x + (side === 'left' ? -1 : 1) * (135 + slot * 36); points = [a, { x, y: a.y }, { x, y }, { x: b.x, y }, b]; }
      else if (horizontal) points = [a, { x: elbow, y: a.y }, { x: elbow, y: b.y }, b];
      else points = [a, { x: a.x, y: elbow }, { x: b.x, y: elbow }, b];
      bounds.push(...points);
      function* labelCandidates() {
        for (const padding of [14, 30, 46, 70, 102, 150, 214]) {
          for (let s = 1; s < points.length; s++) {
            const start = points[s - 1], finish = points[s], dx = finish.x - start.x, dy = finish.y - start.y, distance = Math.hypot(dx, dy);
            if (!distance) continue;
            const steps = [Math.min(52, distance / 2)];
            for (let d = 24; d < distance - 12; d += 36) steps.push(d);
            for (const d of steps) {
              const x = start.x + dx / distance * d, y = start.y + dy / distance * d;
              if (Math.abs(dx) >= 1) { yield { x, y: y - padding, align: 'middle' }; yield { x, y: y + padding + 16, align: 'middle' }; }
              else { yield { x: x + padding, y: y + 6, align: 'start' }; yield { x: x - padding, y: y + 6, align: 'end' }; }
            }
          }
        }
      }
      const labelWidths = [textWidth(`(${end.cardinality})`), ...(end.role ? [textWidth(end.role, 15)] : [])];
      const labelBoxes = p => labelWidths.map((width, i) => {
        const left = p.x - (p.align === 'middle' ? width / 2 : p.align === 'end' ? width : 0), y = p.y + i * 32;
        return { left: left - 4, right: left + width + 4, top: y - 22, bottom: y + 8 };
      });
      let position;
      // ponytail: local label placement near the route; obstacle-aware routing is needed for fully packed manual diagrams.
      for (const p of labelCandidates()) {
        position ||= p;
        if (labelBoxes(p).every(box => occupiedLabels.every(b => box.right + 6 <= b.left || box.left >= b.right + 6 || box.bottom + 6 <= b.top || box.top >= b.bottom + 6))) { position = p; break; }
      }
      const { x: lx, y: ly, align } = position;
      const labels = labelBoxes(position); occupiedLabels.push(...labels);
      labels.forEach(b => bounds.push({ x: b.left, y: b.top }, { x: b.right, y: b.bottom }));
      edges += `<polyline class="connection" points="${points.map(p => `${p.x},${p.y}`).join(' ')}"/><text class="cardinality" x="${lx}" y="${ly}" text-anchor="${align}">(${end.cardinality})</text>`;
      if (end.role) {
        edges += `<text class="role" x="${lx}" y="${ly + 32}" text-anchor="${align}">${escape(end.role)}</text>`;
      }
    }));
    nodes.forEach(node => {
      const relationship = !!node.ends, { w, h } = dimensions(node, relationship);
      const box = nodeBounds(node);
      bounds.push({ x: box.left, y: box.top }, { x: box.right, y: box.bottom });
      let attrs = '';
      const entries = attributeEntries(node.attributes);
      entries.forEach(({ attr, path, parent }) => {
        const p = attributePosition(node, path), a = parent ? attributePosition(node, parent) : anchor(node, p, relationship);
        const side = attributeSide(node, path), align = side === 'left' ? 'end' : side === 'right' ? 'start' : 'middle';
        const tx = p.x + (align === 'end' ? -12 : align === 'start' ? 12 : 0), ty = p.y + (align === 'middle' ? side === 'bottom' ? 21 : -14 : 5);
        const label = `${attr.name}${attr.cardinality === '1,1' ? '' : ` (${attr.cardinality})`}`;
        const inheritedKey = entries.some(e => e.attr.key && (path === e.path || path.startsWith(e.path + '.')));
        attrs += `<line class="attribute-line" x1="${a.x}" y1="${a.y}" x2="${p.x}" y2="${p.y}"/><g class="attribute" data-node="${node.id}" data-attribute="${path}" tabindex="0" role="button" aria-label="Sposta attributo ${escape(attr.name)}"><circle class="attribute-hit" cx="${p.x}" cy="${p.y}" r="14"/><circle class="attribute-dot${inheritedKey || node.externalKey?.attributes.includes(attr.name) ? ' key' : ''}" cx="${p.x}" cy="${p.y}" r="5"/><text class="attribute-label" x="${tx}" y="${ty}" text-anchor="${align}">${escape(label)}</text></g>`;
      });
      if (node.externalKey) shapes += `<text class="role" x="${node.x}" y="${node.y + h + 30}" text-anchor="middle">${escape(`ID esterno: ${node.externalKey.attributes.join(' + ')}${node.externalKey.attributes.length ? ' + ' : ''}proprietario`)}</text>`;
      const shape = relationship ? `<polygon points="${node.x-w},${node.y} ${node.x},${node.y-h} ${node.x+w},${node.y} ${node.x},${node.y+h}"/>` : `<rect x="${node.x-w}" y="${node.y-h}" width="${w*2}" height="${h*2}" rx="2"/>`;
      shapes += attrs + `<g class="diagram-node ${relationship ? 'relationship' : 'entity'}${selected === node.id ? ' selected' : ''}" data-node="${node.id}" tabindex="0" role="button" aria-label="Modifica ${escape(node.name)}">${shape}<text x="${node.x}" y="${node.y + 6}" text-anchor="middle">${escape(node.name)}</text></g>`;
    });
    if (!bounds.length) bounds = [{ x: 0, y: 0 }, { x: 1000, y: 700 }];
    const minX = Math.min(...bounds.map(p => p.x)) - 65, minY = Math.min(...bounds.map(p => p.y)) - 65;
    const width = Math.max(300, Math.max(...bounds.map(p => p.x)) - minX + 65), height = Math.max(250, Math.max(...bounds.map(p => p.y)) - minY + 65);
    return { markup: edges + shapes, bounds: { x: minX, y: minY, w: width, h: height } };
  }
  const svgStyle = `.isa-arrow{fill:#fff;stroke:#53666b;stroke-width:1.6}.connection,.attribute-line{fill:none;stroke:#53666b;stroke-width:1.6;stroke-linejoin:round}.entity rect{fill:#fff;stroke:#23594f;stroke-width:2}.relationship polygon{fill:#fff;stroke:#53666b;stroke-width:1.8}.diagram-node text{font:600 20px "Avenir Next",Arial,sans-serif;fill:#203532}.attribute-dot{fill:#fff;stroke:#364d48;stroke-width:1.6}.attribute-dot.key{fill:#203532}.attribute-hit{fill:transparent}.attribute-label{font:17px "Avenir Next",Arial,sans-serif;fill:#334642}.cardinality{font:600 17px "Avenir Next",Arial,sans-serif;fill:#203532;paint-order:stroke;stroke:#fff;stroke-width:6px;stroke-linejoin:round}.role{font:italic 15px "Avenir Next",Arial,sans-serif;fill:#4a605a;paint-order:stroke;stroke:#fff;stroke-width:5px}.selected rect,.selected polygon{stroke:#067e63;stroke-width:3}.diagram-node,.attribute{cursor:grab}.diagram-node:focus rect,.diagram-node:focus polygon{stroke:#067e63;stroke-width:3}`;
  function svg(model) {
    const { markup, bounds: b } = render(model);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(b.w)}" height="${Math.ceil(b.h)}" viewBox="${b.x} ${b.y} ${b.w} ${b.h}" role="img" aria-label="${escape(model.title)}"><title>${escape(model.title)}</title><style>${svgStyle}</style><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="white"/>${markup}</svg>`;
  }
  const api = { cards, uid, copy, escape, attributes, attributeText, attributeEntries, validate, parse, serialize, layout, example, render, svg, svgStyle, attributePosition, attributeSide, nodeBounds };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ER = api;
})(globalThis);

'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const ER = require('../model.js');

test('descrizione ER: input, validazione, ricorsione, SVG e salvataggio', () => {
  const source = `TITOLO: Rete didattica
ENTITA: Utente
- id [ID]
- nome
- email [0,1]
- interessi [0,N]
ENTITA: Post
- id [ID]
- testo
ASSOCIAZIONE: pubblica: Utente [0,N] -> Post [1,1]
- data
ASSOCIAZIONE: segue: Utente (follower) [0,N] -> Utente (seguito_da) [0,N]`;
  const model = ER.parse(source);
  assert.equal(model.entities.length, 2);
  assert.equal(model.relationships.length, 2);
  assert.equal(model.entities[0].attributes[0].key, true);
  assert.equal(model.entities[0].attributes[2].cardinality, '0,1');
  assert.equal(model.entities[0].attributes[3].cardinality, '0,N');
  assert.equal(model.relationships[0].attributes[0].name, 'data');
  assert.equal(model.relationships[1].ends[1].role, 'seguito_da');
  assert.deepEqual(ER.serialize(ER.parse(ER.serialize(model))), ER.serialize(model));
  assert.deepEqual(ER.validate(JSON.parse(JSON.stringify(model))), model);
  const output = ER.svg(model);
  assert.match(output, /<rect/); assert.match(output, /<polygon/); assert.match(output, /attribute-dot key/);
  assert.match(output, /\(0,N\)/); assert.match(output, /seguito_da/); assert.doesNotMatch(output, /NaN|Infinity/);
  const svgWithEscapes = ER.svg(ER.parse('ENTITA: <script>test<\/script>\n- id [ID]'));
  assert.doesNotMatch(svgWithEscapes, /<script>/); assert.match(svgWithEscapes, /&lt;script&gt;/);
  assert.throws(() => ER.parse('ENTITA: Utente\n- id [ID]\n- ID'), /duplicato/);
  assert.throws(() => ER.parse('ENTITA: Utente\n- telefono [2,N]'), /usa \[ID\]/);
  assert.throws(() => ER.parse('ENTITA: Utente\nASSOCIAZIONE: scrive: Utente [0,N] -> Post [1,1]'), /entità Post non definita/);
  assert.throws(() => ER.parse('ENTITA: Utente\nENTITA: utente'), /duplicata/);
  assert.throws(() => ER.parse('ENTITA: Studente (esterno)\n- id [ID]'), /parentesi tonde/);
  assert.throws(() => ER.validate({ ...model, entities: [{ ...model.entities[0], name: 'Utente (esterno)' }, model.entities[1]] }), /parentesi tonde/);
  assert.throws(() => ER.parse('ENTITA: Utente\nASSOCIAZIONE: segue: Utente [0,N] -> Utente [0,N]'), /due ruoli distinti/);
  assert.throws(() => ER.parse('ENTITA: Utente\nASSOCIAZIONE: segue: Utente (a) [0,N] -> Utente (a) [0,N]'), /due ruoli distinti/);
  assert.throws(() => ER.validate({ title: 'X', entities: [{ ...model.entities[0], x: Infinity }], relationships: [] }), /Posizione/);
  assert.throws(() => ER.validate({ ...model, entities: [model.entities[0], { ...model.entities[1], id: model.entities[0].id }] }), /duplicato/);
  assert.throws(() => ER.validate({ ...model, relationships: [{ ...model.relationships[0], ends: [{ entity: 'missing', cardinality: '0,N' }, model.relationships[0].ends[1]] }] }), /inesistente/);
  const composite = ER.parse('ENTITA: Iscrizione\n- studente [ID]\n- corso [ID]');
  assert.equal(composite.entities[0].attributes.filter(a => a.key).length, 2);
  assert.deepEqual(ER.attributes('id [PK]'), ER.attributes('id [ID]'));
  assert.deepEqual(ER.attributes('id [pk]'), ER.attributes('id [ID]'));
  const mixedKeys = ER.parse('ENTITA: Iscrizione\n- studente [PK]\n- corso [ID]');
  assert.deepEqual(mixedKeys.entities[0].attributes, composite.entities[0].attributes);
  assert.deepEqual(ER.serialize(mixedKeys), ER.serialize(composite));
  assert.deepEqual(ER.validate(mixedKeys), mixedKeys);
  const moved = ER.copy(model); moved.entities[0].attributePositions[0] = { x: -200, y: 100 };
  assert.deepEqual(ER.validate(moved), moved);
  assert.deepEqual(ER.attributePosition(moved.entities[0], 0), { x: moved.entities[0].x - 200, y: moved.entities[0].y + 100 });
  const longRole = ER.copy(model); longRole.relationships[1].ends[0].role = 'a'.repeat(80);
  assert.ok(ER.render(longRole).bounds.w > 0);
  for (const restructured of [false, true]) {
    const example = ER.example(restructured);
    assert.equal(example.entities.length, restructured ? 8 : 5);
    assert.equal(example.relationships.length, restructured ? 10 : 7);
    assert.deepEqual(ER.validate(example), example);
    assert.doesNotMatch(ER.svg(example), /NaN|Infinity/);
  }
  const grid = ER.layout(ER.copy(model));
  assert.notDeepEqual(grid.relationships[0].x, grid.relationships[1].x);
  // Separate ports; reuse elbow columns only for disjoint perpendicular segments.
  for (const vertical of [false, true]) for (const unequalDistance of [false, true]) {
    const routes = ER.parse('ENTITA: A\nENTITA: B\nASSOCIAZIONE: r1: A [0,N] -> B [1,1]\nASSOCIAZIONE: r2: A [0,N] -> B [1,1]');
    routes.entities[0].x = 0; routes.entities[0].y = 0;
    routes.entities[1].x = 800; routes.entities[1].y = 0;
    routes.relationships[0].x = 400; routes.relationships[0].y = unequalDistance ? 80 : -140;
    routes.relationships[1].x = unequalDistance ? 328 : 400; routes.relationships[1].y = 140;
    if (vertical) [...routes.entities, ...routes.relationships].forEach(n => { [n.x, n.y] = [n.y, n.x]; });
    const polylines = [...ER.render(routes).markup.matchAll(/<polyline[^>]*points="([^"]+)"/g)].map(m => m[1].split(' ').map(p => p.split(',').map(Number)));
    for (let i = 0; i < 2; i++) {
      const first = polylines[i], second = polylines[i + 2];
      assert.notDeepEqual(first[0], second[0], 'association ports merged');
      if (unequalDistance) assert.notEqual(first[1][vertical ? 1 : 0], second[1][vertical ? 1 : 0], 'overlapping association elbow lanes merged');
      else assert.equal(first[1][vertical ? 1 : 0], second[1][vertical ? 1 : 0], 'disjoint bends should align');
    }
  }
  // Riordina must reserve the entire attribute fan, repeated diamonds and recursive associations.
  const dense = ER.copy(model);
  dense.entities[0].attributes = Array.from({ length: 30 }, (_, i) => ({ name: `attributo_lungo_${i}_con_descrizione`, key: false, cardinality: '0,N' }));
  dense.relationships.push(...Array.from({ length: 12 }, (_, i) => ({ ...ER.copy(model.relationships[0]), id: `repeated${i}`, name: `associazione_${i}`, attributes: ER.copy(dense.entities[0].attributes.slice(0, 9)) })));
  for (const source of [model, ER.example(), ER.example(true), dense]) {
    const arranged = ER.layout(ER.copy(source));
    const nodes = [...arranged.entities, ...arranged.relationships];
    const boxes = nodes.map(ER.nodeBounds);
    boxes.forEach((a, i) => boxes.slice(i + 1).forEach((b, j) => {
      assert.ok(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom, `${nodes[i].name} overlaps ${nodes[i + j + 1].name} after Riordina`);
    }));
    assert.deepEqual(ER.validate(arranged), arranged);
    assert.deepEqual(ER.layout(ER.copy(arranged)), arranged, 'Riordina must be stable');
    assert.deepEqual(ER.serialize(arranged), ER.serialize(source), 'Riordina must preserve schema content');
    const labels = [...ER.render(arranged).markup.matchAll(/<text class="(cardinality|role)" x="([^"]+)" y="([^"]+)" text-anchor="([^"]+)">([^<]+)<\/text>/g)].map(([, kind, x, y, align, text]) => {
      const width = text.length * (kind === 'role' ? 8 : 9), left = +x - (align === 'middle' ? width / 2 : align === 'end' ? width : 0);
      return { text, left, right: left + width, top: +y - 18, bottom: +y + 4 };
    });
    labels.forEach((a, i) => labels.slice(i + 1).forEach(b => {
      assert.ok(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom, `${a.text} overlaps ${b.text} after Riordina`);
    }));
  }
  assert.equal(ER.validate({ title: 'Vuoto', entities: [], relationships: [] }).entities.length, 0);
  assert.ok(ER.render({ entities: [], relationships: [] }).bounds.w > 0);
});

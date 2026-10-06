'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const ER = require('../model.js');
const fs = require('node:fs');

test('Riordina uses empty cells to align all three branches of the pharmacy schema', () => {
  const original = ER.parse(fs.readFileSync(require.resolve('./fixtures/farmacia.txt'), 'utf8'));
  const arranged = ER.layout(ER.copy(original));
  const medicine = arranged.entities.find(e => e.name === 'medicinale');
  arranged.relationships.forEach(r => {
    const [a, b] = r.ends.map(end => arranged.entities.find(e => e.id === end.entity));
    assert.ok(a.x === b.x || a.y === b.y, `${r.name} must have aligned participants`);
    assert.equal(r.x, (a.x + b.x) / 2); assert.equal(r.y, (a.y + b.y) / 2);
  });
  assert.equal(new Set(arranged.relationships.map(r => r.x === medicine.x ? (r.y > medicine.y ? 'bottom' : 'top') : r.x > medicine.x ? 'right' : 'left')).size, 3);
  const routes = [...ER.render(arranged).markup.matchAll(/<polyline class="connection" points="([^"]+)"/g)];
  assert.equal(routes.length, 6);
  routes.forEach(([, points]) => {
    const p = points.split(' ').map(v => v.split(',').map(Number));
    assert.ok(p.every(v => v[0] === p[0][0]) || p.every(v => v[1] === p[0][1]));
  });
  const boxes = [...arranged.entities, ...arranged.relationships].map(ER.nodeBounds);
  boxes.forEach((a, i) => boxes.slice(i + 1).forEach(b => assert.ok(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top)));
  assert.equal(ER.serialize(arranged), ER.serialize(original));
  assert.deepEqual(ER.layout(ER.copy(arranged)), arranged);
});

test('Riordina aligns centers, balances diamonds and frees connection sides', () => {
  const source = ER.parse(`ENTITA: medicinale
- id [ID]
- prezzo_con_prescrizione
- prezzo_senza_prescrizione [0,1]
- prescrizione
ENTITA: ditta
- id [ID]
- nome
- fax [0,1]
- n_telefono [1,N]
ENTITA: utilizzo
- id [ID]
- nome
- descrizione [0,1]
ASSOCIAZIONE: prevede: medicinale [1,N] -> utilizzo [0,N]
ASSOCIAZIONE: fornisce: medicinale [1,1] -> ditta [0,N]`);
  const input = ER.copy(source);
  input.entities.forEach((e, i) => {
    e.x = i * 137; e.y = i * 239; e.side = 'top';
    e.attributeSides = { '0': 'right' }; e.attributePositions = { '0': { x: 200, y: -200 } };
  });
  const arranged = ER.layout(input), [medicine, company, use] = arranged.entities;
  assert.equal(medicine.y, use.y);
  assert.equal(medicine.x, company.x);
  assert.ok(use.x > medicine.x && company.y > medicine.y);
  assert.equal(medicine.side, 'top'); assert.equal(use.side, 'top'); assert.equal(company.side, 'bottom');
  arranged.relationships.forEach(r => {
    const [a, b] = r.ends.map(end => arranged.entities.find(e => e.id === end.entity));
    assert.equal(r.x, (a.x + b.x) / 2); assert.equal(r.y, (a.y + b.y) / 2);
  });
  const routes = [...ER.render(arranged).markup.matchAll(/<polyline class="connection" points="([^"]+)"/g)];
  assert.equal(routes.length, 4);
  routes.forEach(([, points]) => {
    const positions = points.split(' ').map(p => p.split(',').map(Number));
    assert.ok(positions.every(p => p[0] === positions[0][0]) || positions.every(p => p[1] === positions[0][1]), 'Connections should be straight');
  });
  assert.deepEqual(ER.serialize(arranged), ER.serialize(source));
  assert.deepEqual(ER.validate(arranged), arranged);
  assert.deepEqual(ER.layout(ER.copy(arranged)), arranged);
});

test('Riordina splits a long fan and keeps repeated diamonds equidistant without overlaps', () => {
  const model = ER.parse('ENTITA: A\nENTITA: B\nASSOCIAZIONE: collega: A [1,N] -> B [0,N]');
  model.entities[0].attributes = Array.from({ length: 12 }, (_, i) => ({ name: `a${i}`, key: false, cardinality: '1,1' }));
  const arranged = ER.layout(ER.copy(model));
  const sides = new Set(ER.attributeEntries(arranged.entities[0].attributes).map(e => ER.attributeSide(arranged.entities[0], e.path)));
  assert.ok(sides.size > 1, 'Long attribute fans should use multiple free sides');
  model.relationships.push(...Array.from({ length: 4 }, (_, i) => ({ ...ER.copy(model.relationships[0]), id: `repeat${i}`, name: `collega${i}` })));
  const repeated = ER.layout(model), [a, b] = repeated.entities;
  repeated.relationships.forEach(r => assert.ok(Math.abs(Math.hypot(r.x - a.x, r.y - a.y) - Math.hypot(r.x - b.x, r.y - b.y)) < 1e-7));
  const boxes = [...repeated.entities, ...repeated.relationships].map(ER.nodeBounds);
  boxes.forEach((a, i) => boxes.slice(i + 1).forEach(b => assert.ok(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top)));
  assert.deepEqual(ER.layout(ER.copy(repeated)), repeated);
});

test('Riordina keeps wide compound trees inside the saved coordinate range', () => {
  const model = ER.parse('ENTITA: A\nENTITA: B\nENTITA: C\nENTITA: D\nASSOCIAZIONE: ab: A [0,N] -> B [1,1]\nASSOCIAZIONE: bc: B [0,N] -> C [1,1]\nASSOCIAZIONE: cd: C [0,N] -> D [1,1]');
  model.entities.forEach(e => {
    e.attributes = Array.from({ length: 2 }, (_, i) => ({ name: `gruppo${i}`, key: false, cardinality: '1,1',
      children: Array.from({ length: 28 }, (_, j) => ({ name: String(j).padStart(2, '0') + 'x'.repeat(78), key: false, cardinality: '1,1' })) }));
  });
  assert.deepEqual(ER.validate(ER.layout(model)), model);
});

'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const ER = require('../model.js');

test('preferenze ER: inversione solo grafica, ricorsione, riquadri ed esportazione', () => {
  const model = ER.parse(`ENTITA: Cliente
- id [ID]
ENTITA: Ordine
- id [ID]
ASSOCIAZIONE: effettua: Cliente [0,N] -> Ordine [1,1]
ASSOCIAZIONE: collega: Cliente [0,1] -> Ordine [1,1]
ASSOCIAZIONE: segue: Cliente (capo) [0,N] -> Cliente (subordinato) [1,1]
ASSOCIAZIONE: condivide: Cliente [1,N] -> Ordine [0,N]`);
  const before = JSON.stringify(model);
  const defaults = { cardinalityStyle: 'university', showRelationshipType: false };
  assert.deepEqual(ER.displayOptions(), defaults);
  assert.deepEqual(ER.displayOptions({ cardinalityStyle: '<script>', showRelationshipType: 'true' }), defaults);
  assert.deepEqual(ER.render(model), ER.render(model, '', defaults));
  const labels = output => [...output.matchAll(/<text class="(cardinality(?: cardinality-uml)?|role)"[^>]*>([^<]+)<\/text>/g)].map(([, kind, text]) => [kind, text]);
  const university = labels(ER.render(model).markup);
  const uml = labels(ER.render(model, '', { cardinalityStyle: 'uml' }).markup);
  assert.deepEqual(uml, [
    ['cardinality cardinality-uml', '1'], ['cardinality cardinality-uml', 'N'],
    ['cardinality cardinality-uml', '1'], ['cardinality cardinality-uml', '1'],
    ['cardinality cardinality-uml', '1'], ['role', 'capo'],
    ['cardinality cardinality-uml', 'N'], ['role', 'subordinato'],
    ['cardinality cardinality-uml', 'N'], ['cardinality cardinality-uml', 'N']
  ]);
  const options = { cardinalityStyle: 'both', showRelationshipType: true };
  const rendered = ER.render(model, '', options), both = labels(rendered.markup);
  assert.deepEqual(both.filter(([kind]) => kind !== 'cardinality cardinality-uml'), university);
  assert.deepEqual(both.filter(([kind]) => kind === 'cardinality cardinality-uml').map(([, text]) => text), ['UML 1', 'UML N', 'UML 1', 'UML 1', 'UML 1', 'UML N', 'UML N', 'UML N']);
  assert.deepEqual([...rendered.markup.matchAll(/Tipo di associazione [^"]+: ([^"<]+)"/g)].map(m => m[1]), ['1:N', '1:1', '1:N', 'N:M']);
  const boxes = [...rendered.markup.matchAll(/class="relationship-type"[^>]*><rect x="([^"]+)" y="([^"]+)"/g)].map(([, x, y]) => ({ left: +x, right: +x + 56, top: +y, bottom: +y + 26 }));
  const nodeBoxes = [...model.entities, ...model.relationships].map(ER.nodeBounds);
  boxes.forEach((box, i) => {
    assert.ok(box.bottom < ER.nodeBounds(model.relationships[i]).top);
    assert.ok(box.top >= rendered.bounds.y && box.bottom <= rendered.bounds.y + rendered.bounds.h);
    [...nodeBoxes, ...boxes.slice(i + 1)].forEach(b => assert.ok(box.right <= b.left || box.left >= b.right || box.bottom <= b.top || box.top >= b.bottom));
  });
  assert.match(ER.svg(model, options), /UML N/);
  assert.match(ER.svg(model, options), /relationship-type/);
  assert.doesNotMatch(ER.render(model).markup, /cardinality-uml|relationship-type/);
  assert.equal(JSON.stringify(model), before, 'Displaying cardinalities must never change the model');
});

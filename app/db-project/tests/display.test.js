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
  const defaults = { cardinalityStyle: 'university', showRelationshipType: false, statementHeight: 200, fontSizes: { nodes: 20, attributes: 17, cardinalities: 17, badges: 14, notes: 15, statement: 14 } };
  assert.deepEqual(ER.displayOptions(), defaults);
  assert.deepEqual(ER.displayOptions({ cardinalityStyle: '<script>', showRelationshipType: 'true' }), defaults);
  assert.equal(ER.displayOptions({ statementHeight: -10 }).statementHeight, 48);
  assert.equal(ER.displayOptions({ statementHeight: 999 }).statementHeight, 200);
  assert.equal(ER.displayOptions({ statementHeight: 117.6 }).statementHeight, 118);
  assert.equal(ER.displayOptions({ statementHeight: '100' }).statementHeight, 200);
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
  assert.deepEqual(both.filter(([kind]) => kind === 'cardinality cardinality-uml').map(([, text]) => text), ['max 1', 'max N', 'max 1', 'max 1', 'max 1', 'max N', 'max N', 'max N']);
  assert.deepEqual([...rendered.markup.matchAll(/Tipo di associazione [^"]+: ([^"<]+)"/g)].map(m => m[1]), ['1:N', '1:1', '1:N', 'N:M']);
  const boxes = [...rendered.markup.matchAll(/class="relationship-type"[^>]*><rect x="([^"]+)" y="([^"]+)"/g)].map(([, x, y]) => ({ left: +x, right: +x + 56, top: +y, bottom: +y + 26 }));
  const nodeBoxes = [...model.entities, ...model.relationships].map(ER.nodeBounds);
  boxes.forEach((box, i) => {
    assert.ok(box.bottom < ER.nodeBounds(model.relationships[i]).top);
    assert.ok(box.top >= rendered.bounds.y && box.bottom <= rendered.bounds.y + rendered.bounds.h);
    [...nodeBoxes, ...boxes.slice(i + 1)].forEach(b => assert.ok(box.right <= b.left || box.left >= b.right || box.bottom <= b.top || box.top >= b.bottom));
  });
  assert.match(ER.svg(model, options), /max N/);
  assert.match(ER.svg(model, options), /relationship-type/);
  assert.doesNotMatch(ER.render(model).markup, /cardinality-uml|relationship-type/);
  assert.equal(JSON.stringify(model), before, 'Displaying cardinalities must never change the model');
});

test('font ER: limiti, dimensioni indipendenti, ingombri, posizioni manuali e layout', () => {
  const model = ER.parse(`ENTITA: Cliente con nome lungo
- id [ID]
- recapito
  - indirizzo
  - città
ENTITA: Ordine
- numero [ID]
ASSOCIAZIONE: effettua: Cliente con nome lungo (acquirente) [0,N] -> Ordine [1,1]`);
  const before = JSON.stringify(model);
  assert.deepEqual(ER.displayOptions({ fontSizes: { nodes: 100, attributes: -2, cardinalities: '<script>', notes: 23.6 } }).fontSizes, { nodes: 40, attributes: 8, cardinalities: 17, badges: 14, notes: 24, statement: 14 });
  assert.deepEqual(ER.displayOptions({ fontSizes: { nodes: null, attributes: Infinity, cardinalities: '24', notes: NaN } }).fontSizes, ER.displayOptions().fontSizes);
  assert.equal(ER.displayOptions({ fontSizes: { cardinalities: 22 } }).fontSizes.badges, 19, 'Older font settings retain their smaller badge size');
  assert.match(ER.diagramStyle({ fontSizes: { cardinalities: 32, badges: 10 } }), /\.cardinality\{font-size:32px\}.*\.relationship-type text\{font-size:10px\}/);
  for (const size of [8, 40]) {
    const display = { cardinalityStyle: 'both', showRelationshipType: true, statementHeight: 200, fontSizes: { nodes: size, attributes: size, cardinalities: size, badges: size, notes: size } };
    const output = ER.svg(model, display);
    assert.match(output, new RegExp(`\\.diagram-node text\\{font-size:${size}px\\}`));
    assert.match(output, new RegExp(`\\.attribute-label\\{font-size:${size}px\\}`));
    assert.match(output, new RegExp(`\\.cardinality\\{font-size:${size}px\\}`));
    assert.doesNotMatch(output, /NaN|Infinity|<script>/);
    const arranged = ER.layout(ER.copy(model), display), fonts = ER.displayOptions(display).fontSizes;
    const boxes = [...arranged.entities, ...arranged.relationships].map(node => ER.nodeBounds(node, fonts));
    boxes.forEach((a, i) => boxes.slice(i + 1).forEach(b => assert.ok(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom)));
    assert.deepEqual(ER.layout(ER.copy(arranged), display), arranged);
    assert.equal(ER.serialize(arranged), ER.serialize(model));
  }
  const fonts = { nodes: 40, attributes: 30, cardinalities: 25, badges: 14, notes: 20 };
  const standard = ER.nodeBounds(model.entities[0]), enlarged = ER.nodeBounds(model.entities[0], fonts);
  assert.ok(enlarged.right - enlarged.left > standard.right - standard.left);
  assert.equal(JSON.stringify(model), before);
  model.entities[0].attributePositions['0'] = { x: 210, y: -190 };
  assert.deepEqual(ER.attributePosition(model.entities[0], '0', fonts), { x: model.entities[0].x + 210, y: model.entities[0].y - 190 });
});

'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const ER = require('../model.js');
require('../restructure.js');
const hierarchy = `TITOLO: Persone
ENTITA: Persona
- codice [PK]
- indirizzo [0,1]
  - via
  - città
- telefoni [0,N]
ENTITA: Studente
- matricola
ENTITA: Docente
- stipendio
ENTITA: Corso
- codice [ID]
ASSOCIAZIONE: frequenta: Studente [1,N] -> Corso [0,N]
ASSOCIAZIONE: coordina: Persona [0,N] -> Corso [1,1]
GERARCHIA: Persona [TOTALE, ESCLUSIVA, SEPARATE] -> Studente, Docente`;

test('ER esteso e ristrutturazione: alberi, ISA, copie, cardinalità e identificatori', () => {
  const source = ER.parse(hierarchy), before = ER.copy(source);
  assert.equal(source.entities[0].attributes[1].children[0].name, 'via');
  assert.equal(source.hierarchies[0].total, true);
  assert.deepEqual(ER.serialize(ER.parse(ER.serialize(source))), ER.serialize(source));
  assert.deepEqual(ER.validate(source), source);
  assert.match(ER.render(source).markup, /data-attribute="1.0"/);
  assert.match(ER.svg(source), /class="hierarchy"/);
  const moved = ER.copy(source); moved.entities[0].attributePositions['1.0'] = { x: 210, y: -250 };
  assert.deepEqual(ER.attributePosition(moved.entities[0], '1.0'), { x: moved.entities[0].x + 210, y: moved.entities[0].y - 250 });
  assert.deepEqual(ER.validate(moved), moved);
  const arranged = ER.copy(source), node = arranged.entities[0];
  node.attributeSides = { '0': 'left', '1': 'bottom', '2': 'right' };
  assert.ok(ER.attributePosition(node, '0').x < node.x);
  assert.ok(ER.attributePosition(node, '1.0').y > node.y);
  assert.ok(ER.attributePosition(node, '2').x > node.x);
  assert.equal(ER.attributeSide(node, '1.1'), 'bottom');
  assert.deepEqual(ER.validate(JSON.parse(JSON.stringify(arranged))), arranged);
  const optimized = ER.layout(ER.copy(arranged));
  assert.deepEqual(ER.serialize(optimized), ER.serialize(arranged), 'Riordina may change attribute sides, preserving the schema');
  assert.equal(ER.attributeSide(optimized.entities[0], '1.0'), ER.attributeSide(optimized.entities[0], '1'), 'Compound attributes move together');
  assert.doesNotMatch(ER.svg(arranged), /NaN|undefined/);
  const isa = ER.render(arranged).markup.match(/<path class="connection" d="M([^,]+),([^H]+)H([^V]+)V([^\"]+)"/);
  assert.ok(isa, 'ISA should leave sideways when the bottom compound fan is occupied');
  assert.ok(Number(isa[3]) > ER.nodeBounds(node).right || Number(isa[3]) < ER.nodeBounds(node).left, 'ISA bend must stay outside parent attributes');
  assert.ok(Number(isa[4]) > ER.nodeBounds(node).bottom, 'ISA split must stay below the compound fan');
  assert.match(ER.svg(arranged), /\.isa-arrow\{fill:#fff;stroke:#53666b;stroke-width:1\.6\}/, 'Export must preserve the outlined hierarchy triangle');
  const avoiding = ER.parse('ENTITA: A\n- id [ID]\n- nome\nENTITA: B\n- id [ID]\nASSOCIAZIONE: collega: A [0,N] -> B [1,1]');
  Object.assign(avoiding.entities[0], { x: 0, y: 0 }); Object.assign(avoiding.entities[1], { x: 0, y: -800 }); Object.assign(avoiding.relationships[0], { x: 0, y: -400 });
  const line = ER.render(avoiding).markup.match(/<polyline class="connection" points="([^"]+)"/)[1].split(' ').map(p => p.split(',').map(Number));
  assert.equal(line[0][1], line[1][1], 'Association should leave horizontally when attributes occupy top');
  assert.ok(line[1][0] > ER.nodeBounds(avoiding.entities[0]).right, 'Bend should stay outside attribute fan');
  assert.throws(() => ER.attributes('indirizzo\n   via'), /due spazi/);
  assert.throws(() => ER.attributes('  via'), /due spazi/);
  assert.throws(() => ER.parse('ENTITA: A\n- indirizzo [0,1]\n  - via [ID]'), /identificatore composto/);
  assert.throws(() => ER.parse('ENTITA: A\nENTITA: B\nGERARCHIA: A [TOTALE, ESCLUSIVA] -> B\nGERARCHIA: B [TOTALE, ESCLUSIVA] -> A'), /ciclo/);
  assert.throws(() => ER.parse(hierarchy.replace('TOTALE, ESCLUSIVA, SEPARATE', 'PARZIALE, ESCLUSIVA, FIGLIE')), /solo.*totale/);
  for (const total of [true, false]) for (const disjoint of [true, false]) for (const strategy of ['up', 'keep', ...(total ? ['down'] : [])]) {
    const input = ER.copy(source); Object.assign(input.hierarchies[0], { total, disjoint, strategy });
    const { model, report } = ER.restructure(input);
    assert.deepEqual(input, { ...before, hierarchies: [{ ...before.hierarchies[0], total, disjoint, strategy }] }, 'source must stay unchanged');
    assert.equal(model.hierarchies.length, 0);
    assert.ok(report.length > 0);
    assert.equal(ER.attributeEntries([...model.entities, ...model.relationships].flatMap(n => n.attributes)).some(e => e.attr.children || e.attr.cardinality.endsWith('N')), false);
    assert.ok(model.constraints.length);
    assert.deepEqual(ER.validate(model), model);
    assert.deepEqual(ER.serialize(ER.parse(ER.serialize(model))), ER.serialize(model));
    if (strategy === 'up') {
      const parent = model.entities.find(e => e.name === 'Persona');
      assert.equal(model.entities.some(e => e.name === 'Studente'), false);
      assert.ok(parent.attributes.some(a => a.name === 'Studente_matricola' && a.cardinality === '0,1'));
      assert.equal(model.relationships.find(r => r.name === 'frequenta').ends[0].cardinality, '0,N');
      assert.ok(model.constraints.some(c => c.includes('frequenta') && c.includes('(1,N)')));
    } else if (strategy === 'down') {
      assert.equal(model.entities.some(e => e.name === 'Persona'), false);
      assert.ok(model.entities.find(e => e.name === 'Studente').attributes.some(a => a.name === 'codice' && a.key));
      assert.equal(model.relationships.filter(r => r.name.startsWith('coordina_')).length, 2);
      assert.ok(model.constraints.some(c => c.includes('coordina') && c.includes('(1,1)')));
    } else assert.ok(model.entities.find(e => e.name === 'Studente').externalKey);
  }
  const nested = ER.parse(`ENTITA: A\n- id [ID]\nENTITA: B\nENTITA: C\nGERARCHIA: A [TOTALE, ESCLUSIVA, FIGLIE] -> B\nGERARCHIA: B [TOTALE, ESCLUSIVA, FIGLIE] -> C`);
  assert.equal(ER.restructure(nested).model.entities.length, 1);
  const collection = ER.parse(`ENTITA: Persona\n- id [ID]\n- recapiti [0,N]\n  - città\n  - telefoni [1,N]\n  - note [0,1]`);
  const result = ER.restructure(collection).model;
  assert.equal(result.entities.length, 3);
  assert.ok(result.entities.every(e => e.attributes.every(a => !a.children && !a.cardinality.endsWith('N'))));
  assert.deepEqual(ER.validate(result), result);
  const onRelation = ER.parse('ENTITA: A\n- id [ID]\nENTITA: B\n- id [ID]\nASSOCIAZIONE: visita: A [1,N] -> B [0,N]\n- note [0,N]');
  const reified = ER.restructure(onRelation).model;
  assert.ok(reified.entities.find(e => e.name === 'visita').externalKey.owners.length === 2);
  assert.equal(reified.relationships.length, 3);
  assert.throws(() => ER.restructure(ER.parse('ENTITA: A\n- telefoni [0,N]')), /identificatore/);
  const compoundKey = ER.restructure(ER.parse('ENTITA: A\n- codice [ID]\n  - prefisso\n  - numero')).model;
  assert.deepEqual(compoundKey.entities[0].attributes.map(a => [a.name, a.key]), [['codice_prefisso', true], ['codice_numero', true]]);
});

test('Multivalues receive an independent id and separate value, including nested collections and id conflicts', () => {
  const input = ER.parse('ENTITA: Persona\n- codice [ID]\n- telefono [1,N]\n- id [0,N]\n- recapito [0,N]\n  - id\n  - città\n  - telefoni [0,N]');
  const before = ER.serialize(input), { model, report } = ER.restructure(input);
  const phone = model.entities.find(e => e.name === 'Persona_telefono');
  assert.deepEqual(phone.attributes.map(a => [a.name, a.key]), [['id', true], ['telefono', false]]);
  assert.equal(phone.externalKey, undefined);
  const relation = model.relationships.find(r => r.name === 'ha_telefono');
  assert.equal(relation.ends[0].cardinality, '1,N'); assert.equal(relation.ends[1].cardinality, '1,1');
  const ids = model.entities.find(e => e.name === 'Persona_id');
  assert.deepEqual(ids.attributes.map(a => a.name), ['id', 'valore_id']);
  model.entities.slice(1).forEach(e => assert.deepEqual(e.attributes.filter(a => a.key).map(a => a.name), ['id']));
  assert.ok(model.entities.find(e => e.name === 'Persona_recapito').attributes.some(a => a.name === 'valore_id' && !a.key));
  assert.ok(model.constraints.some(c => c.includes('due valori completi uguali')));
  assert.ok(report.some(c => c.includes('identificatore proprio id')));
  assert.equal(ER.serialize(input), before);
  assert.equal(ER.serialize(ER.parse(ER.serialize(model))), ER.serialize(model));
});

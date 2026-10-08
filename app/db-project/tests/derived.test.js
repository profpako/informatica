'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ER = require('../model');
require('../restructure'); require('../relational'); require('../physical');
const app = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const readDerived = vm.runInNewContext(app.slice(app.indexOf('function readDerived(raw)'), app.indexOf('const shownModel')) + '\nreadDerived', { ER });

test('Manual relation names survive load and SQL restoration without losing applied choices', () => {
  const source = ER.parse('ENTITA: proprietario\n- id [ID]\n- cf\nENTITA: auto\n- id [ID]\nASSOCIAZIONE: possiede: proprietario [1,N] -> auto [1,1]');
  const raw = { ...ER.restructure(source), signature: ER.serialize(source) }, id = source.entities[0].id;
  raw.relational = ER.relational(raw.model, { [id]: 'titolari' });
  raw.physical = ER.physical(raw.relational);
  raw.physical.tables[0].columns.find(c => c.name === 'cf').type = 'CHAR(16)';
  raw.physical.tables[0].checks = ["cf <> ''"];
  raw.physical.includeEngine = true;
  const loaded = readDerived(JSON.parse(JSON.stringify(raw)));
  assert.deepEqual(loaded.relational.nameOverrides, { [id]: 'titolari' });
  assert.equal(loaded.relational.tables[0].name, 'titolari');
  assert.equal(loaded.physical.tables[0].columns.find(c => c.name === 'cf').type, 'CHAR(16)');
  assert.deepEqual(loaded.physical.tables[0].checks, ["cf <> ''"]);
  assert.equal(loaded.physical.includeEngine, true);
  assert.match(ER.physicalSQL(loaded.physical, loaded.relational), /REFERENCES `titolari`/);
  assert.throws(() => readDerived({ ...raw, relational: { ...raw.relational, nameOverrides: { [id]: '' } } }), /nome della relazione/);
});

test('Loading an old multivalue derivation adds id, renames FKs and preserves applied SQL choices', () => {
  const original = ER.parse('ENTITA: ditta\n- id [ID]\n- n_telefono [1,N]');
  const legacy = ER.restructure(original), [owner, phone] = legacy.model.entities;
  const link = legacy.model.relationships[0];
  phone.attributes = phone.attributes.filter(a => a.name !== 'id');
  phone.externalKey = { attributes: ['n_telefono'], owners: [{ entity: owner.id, relationship: link.id }] };
  legacy.report = ['ditta.n_telefono: estratto in ditta_n_telefono; identificatore n_telefono + proprietario; cardinalità (1,N).'];
  legacy.signature = ER.serialize(original);
  legacy.relational = ER.relational(legacy.model);
  const table = legacy.relational.tables.find(t => t.id === phone.id);
  table.name = 'ditte_n_telefoni';
  table.columns.find(c => c.name === 'id_ditta').name = 'ha_n_telefono_id';
  table.primaryKey = table.primaryKey.map(name => name === 'id_ditta' ? 'ha_n_telefono_id' : name);
  table.foreignKeys[0].columns = ['ha_n_telefono_id'];
  legacy.physical = ER.physical(legacy.relational);
  legacy.physical.database = 'farmacia'; legacy.physical.includeEngine = true;
  const sqlPhone = legacy.physical.tables.find(t => t.id === phone.id);
  sqlPhone.columns.find(c => c.name === 'n_telefono').type = 'VARCHAR(20)';
  sqlPhone.foreignKeys[0].onDelete = 'RESTRICT';
  sqlPhone.checks = ["ha_n_telefono_id > 0 AND n_telefono <> 'ha_n_telefono_id'"];
  legacy.physical.tables.find(t => t.id === owner.id).name = 'fornitori';
  const before = JSON.stringify(legacy), loaded = readDerived(legacy);
  const updated = loaded.model.entities.find(e => e.id === phone.id);
  assert.deepEqual(updated.attributes.map(a => [a.name, a.key]), [['id', true], ['n_telefono', false]]);
  assert.equal(updated.externalKey, undefined);
  assert.equal(updated.x, phone.x); assert.equal(updated.y, phone.y);
  assert.equal(loaded.relational.tables.find(t => t.id === phone.id).name, 'ditte_numeri_di_telefono');
  const physical = loaded.physical.tables.find(t => t.id === phone.id);
  assert.deepEqual(physical.primaryKey, ['id']);
  assert.deepEqual(physical.foreignKeys[0].columns, ['id_ditta']);
  assert.equal(physical.foreignKeys[0].onDelete, 'RESTRICT');
  assert.equal(physical.columns.find(c => c.name === 'n_telefono').type, 'VARCHAR(20)');
  assert.ok(physical.columns.find(c => c.name === 'id').autoIncrement);
  assert.equal(loaded.physical.tables.find(t => t.id === owner.id).name, 'fornitori');
  assert.deepEqual(physical.checks, ["`id_ditta` > 0 AND n_telefono <> 'ha_n_telefono_id'"]);
  assert.equal(loaded.physical.database, 'farmacia'); assert.equal(loaded.physical.includeEngine, true);
  assert.equal(JSON.stringify(legacy), before);
  assert.deepEqual(readDerived(JSON.parse(JSON.stringify(loaded))), loaded);
  assert.match(ER.physicalSQL(loaded.physical, loaded.relational), /FOREIGN KEY \(`id_ditta`\) REFERENCES `fornitori` \(`id`\)/);
  assert.doesNotMatch(ER.render(loaded.model).markup, /ID esterno/);
});

test('Old compound ordinals become id while a simple value named progressivo stays a value', () => {
  const source = ER.parse('ENTITA: Persona\n- codice [ID]\n- recapiti [0,N]\n  - città\n- progressivo [0,N]');
  const legacy = ER.restructure(source), owner = legacy.model.entities[0];
  legacy.report = [];
  legacy.model.entities.slice(1).forEach(e => {
    const ordinal = e.name.endsWith('_recapiti');
    if (ordinal) { e.attributes[0].name = 'progressivo'; e.attributes[0].key = false; }
    else e.attributes.shift();
    const local = e.attributes[0].name, link = legacy.model.relationships.find(r => r.ends.some(end => end.entity === e.id));
    e.externalKey = { attributes: [local], owners: [{ entity: owner.id, relationship: link.id }] };
    legacy.report.push(`Persona.${ordinal ? 'recapiti' : 'progressivo'}: estratto in ${e.name}; identificatore ${local} + proprietario; cardinalità (0,N).`);
  });
  const loaded = ER.upgradeMultivalues(legacy);
  assert.deepEqual(loaded.model.entities[1].attributes.map(a => [a.name, a.key]), [['id', true], ['città', false]]);
  assert.deepEqual(loaded.model.entities[2].attributes.map(a => [a.name, a.key]), [['id', true], ['progressivo', false]]);
});

test('Saved FK names and CHECK references follow renamed components of an external key', () => {
  const model = ER.parse('ENTITA: A\n- id [ID]\nENTITA: B\n- codice\nENTITA: C\n- id [ID]\nASSOCIAZIONE: ha_b: A [0,N] -> B [1,1]\nASSOCIAZIONE: riferisce: B [0,N] -> C [1,1]\nIDENTIFICATORE ESTERNO: B: codice -> A (ha_b)');
  const current = ER.relational(model), previous = ER.copy(current);
  const b = previous.tables.find(t => t.name === 'B'), c = previous.tables.find(t => t.name === 'C');
  b.columns.find(col => col.name === 'id_a').name = 'A_id'; b.primaryKey = ['codice', 'A_id']; b.foreignKeys[0].columns = ['A_id'];
  c.foreignKeys[0].references = ['codice', 'A_id'];
  c.columns.filter(col => col.name !== 'id').forEach((col, i) => { col.name = ['b_codice', 'b_A_id'][i]; });
  c.foreignKeys[0].columns = ['b_codice', 'b_A_id'];
  const physical = ER.physical(previous), row = physical.tables.find(t => t.id === c.id);
  row.checks = ['b_A_id > 0'];
  const restored = ER.restorePhysical(physical, previous, current);
  assert.deepEqual(restored.tables.find(t => t.id === c.id).checks, ['`id_b_id_a` > 0']);
  assert.match(ER.physicalSQL(restored, current), /FOREIGN KEY \(`id_b_codice`, `id_b_id_a`\)/);
});

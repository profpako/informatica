'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const ER = require('../model.js');
require('../restructure.js'); require('../relational.js');

test('schema relazionale: PK, FK composte, 1:N, N:M, 1:1, ricorsione e minimi residui', () => {
  const source = ER.parse(`ENTITA: Utente\n- prefisso [PK]\n- numero [PK]\n- nome\n- telefoni [1,N]\nENTITA: Post\n- id [PK]\n- testo\nASSOCIAZIONE: pubblica: Utente [0,N] -> Post [1,1]\nASSOCIAZIONE: segue: Utente (follower) [0,N] -> Utente (seguito) [0,N]`);
  const result = ER.relational(ER.restructure(source).model);
  const utente = result.tables.find(t => t.name === 'Utenti'), post = result.tables.find(t => t.name === 'Post'), segue = result.tables.find(t => t.name === 'segue'), telefoni = result.tables.find(t => t.name === 'Utenti_telefoni');
  assert.deepEqual(utente.primaryKey, ['prefisso', 'numero']);
  assert.equal(post.foreignKeys.length, 1); assert.deepEqual(post.foreignKeys[0].references, utente.primaryKey);
  assert.ok(post.columns.filter(c => post.foreignKeys[0].columns.includes(c.name)).every(c => !c.nullable));
  assert.equal(segue.foreignKeys.length, 2); assert.equal(segue.primaryKey.length, 4);
  assert.notDeepEqual(segue.foreignKeys[0].columns, segue.foreignKeys[1].columns);
  const notation = ER.relationalNotation(segue);
  assert.equal((notation.match(/class="relational-key relational-pk"/g) || []).length, 1, 'Composite PK is one underlined group');
  assert.doesNotMatch(notation, /relational-fk/, 'FK components of the composite PK retain its single underline');
  assert.equal((notation.match(/\[PK, FK\]/g) || []).length, 4, 'Each component still has its FK semantics');
  assert.match(ER.relationalNotation(post), /class="relational-column relational-fk"/, 'Other FK columns receive double underlining');
  assert.deepEqual(telefoni.primaryKey, ['id']); assert.equal(telefoni.foreignKeys.length, 1);
  assert.equal(telefoni.foreignKeys[0].columns.length, 2);
  assert.ok(telefoni.columns.some(c => c.name === 'telefoni'));
  assert.ok(result.constraints.some(c => c.includes('ha_telefoni') && c.includes('almeno un')));
  assert.match(ER.relationalText(result), /FK: .* -> Utenti\(prefisso, numero\)/);
  const one = ER.relational(ER.parse('ENTITA: A\n- id [ID]\nENTITA: B\n- id [ID]\nASSOCIAZIONE: abbina: A [0,1] -> B [1,1]'));
  assert.equal(one.tables.find(t => t.name === 'B').foreignKeys.length, 1);
  assert.equal(one.tables.find(t => t.name === 'B').unique.length, 1);
  assert.equal(one.tables.find(t => t.name === 'A').foreignKeys.length, 0);
  const optional = ER.relational(ER.parse('ENTITA: A\n- id [ID]\nENTITA: B\n- id [ID]\nASSOCIAZIONE: usa: A [0,N] -> B [0,1]\n- data'));
  const b = optional.tables.find(t => t.name === 'B'); assert.ok(b.columns.find(c => c.name === 'usa_data').nullable);
  assert.ok(optional.constraints.some(c => c.includes('FK è nulla')));
  const hierarchy = ER.parse('ENTITA: Persona\n- id [PK]\nENTITA: Studente\n- matricola\nGERARCHIA: Persona [PARZIALE, ESCLUSIVA, SEPARATE] -> Studente');
  const isa = ER.relational(ER.restructure(hierarchy).model), student = isa.tables.find(t => t.name === 'Studenti');
  assert.deepEqual(student.primaryKey, student.foreignKeys[0].columns);
  assert.match(ER.relationalNotation(student), /class="relational-key relational-pk relational-fk"/, 'A single-column PK that is a FK retains the FK notation');
  for (const t of result.tables) t.foreignKeys.forEach(f => {
    const owner = result.tables.find(o => o.id === f.target);
    assert.deepEqual(f.references, owner.primaryKey);
    assert.equal(f.columns.length, f.references.length);
    assert.ok(f.columns.every(c => t.columns.some(col => col.name === c)));
  });
  assert.throws(() => ER.relational(source), /ristrutturato/);
  assert.throws(() => ER.relational(ER.parse('ENTITA: SenzaChiave')), /identificatore/);
});

test('Manual relation names preserve keys, update references and reject duplicate or invalid names', () => {
  const model = ER.parse('ENTITA: proprietario\n- id [ID]\nENTITA: auto\n- id [ID]\nASSOCIAZIONE: possiede: proprietario [1,N] -> auto [0,1]\nASSOCIAZIONE: utilizza: proprietario [0,N] -> auto [0,N]');
  const original = ER.relational(model), [owner, car, uses] = original.tables;
  const before = JSON.stringify(model);
  const names = { [owner.id]: ' titolari ', [uses.id]: 'usi', deleted_entity: 'ignorato' };
  const changed = ER.relational(model, names);
  assert.deepEqual(changed.tables, original.tables.map(t => ({ ...t, name: t.id === owner.id ? 'titolari' : t.id === uses.id ? 'usi' : t.name })));
  assert.deepEqual(changed.nameOverrides, { [owner.id]: 'titolari', [uses.id]: 'usi' });
  assert.deepEqual(changed.participation, original.participation);
  assert.match(ER.relationalText(changed), /-> titolari\(id\)/);
  assert.ok(changed.report.some(text => text.includes('verso titolari')));
  assert.ok(changed.report.some(text => text.includes('relazione usi')));
  assert.ok(changed.constraints.some(text => text.includes('istanza di titolari')));
  for (const value of ['', '  ', '\u0000', 'x'.repeat(65), 3, null]) assert.throws(() => ER.relational(model, { [owner.id]: value }), /nome della relazione/);
  assert.throws(() => ER.relational(model, { [owner.id]: car.name.toUpperCase() }), /duplicato/);
  assert.throws(() => ER.relational(model, []), /non validi/);
  assert.equal(JSON.stringify(model), before);
});

test('Entity relations use plural names and id-first foreign key names', () => {
  const source = ER.parse(require('node:fs').readFileSync(require.resolve('./fixtures/farmacia.txt'), 'utf8'));
  const r = ER.relational(ER.restructure(source).model);
  assert.deepEqual(r.tables.slice(0, 4).map(t => t.name), ['medicinali', 'ditte', 'utilizzi', 'articoli']);
  assert.deepEqual(r.tables.find(t => t.name === 'ditte_numeri_di_telefono').primaryKey, ['id']);
  assert.equal(r.tables.find(t => t.name === 'ditte_numeri_di_telefono').foreignKeys.length, 1);
  assert.deepEqual(r.tables.find(t => t.name === 'ditte_numeri_di_telefono').foreignKeys[0].columns, ['id_ditta']);
  assert.deepEqual(r.participation.find(p => p.table === r.tables.find(t => t.name === 'ditte_numeri_di_telefono').id),
    { table: r.tables.find(t => t.name === 'ditte_numeri_di_telefono').id, columns: ['id_ditta'], min: 1, max: null });
  assert.deepEqual(r.tables.find(t => t.name === 'medicinali').foreignKeys[0].columns, ['id_ditta']);
  const collision = ER.relational(ER.parse('ENTITA: Persona\n- id [ID]\nENTITA: Persone\n- id [ID]'));
  assert.deepEqual(collision.tables.map(t => t.name), ['Persone', 'Persone_2']);
  assert.equal(source.entities[0].name, 'medicinale');
  const compound = ER.relational(ER.parse('ENTITA: numero di telefono\n- id [ID]\nENTITA: indirizzo di spedizione\n- id [ID]'));
  assert.deepEqual(compound.tables.map(t => t.name), ['numeri di telefono', 'indirizzi di spedizione']);
  const owners = ER.relational(ER.parse('ENTITA: proprietario\n- id [ID]\nENTITA: proprietari\n- id [ID]\nENTITA: Inventario\n- id [ID]\nENTITA: NOTARIO\n- id [ID]'));
  assert.deepEqual(owners.tables.map(t => t.name), ['proprietari', 'proprietari_2', 'Inventari', 'NOTARI']);
  const roles = ER.relational(ER.parse('ENTITA: Utente\n- id [ID]\nASSOCIAZIONE: segue: Utente (follower) [0,N] -> Utente (seguito_da) [0,N]'));
  assert.deepEqual(roles.tables.find(t => t.name === 'segue').primaryKey, ['id_follower', 'id_seguito_da']);
});

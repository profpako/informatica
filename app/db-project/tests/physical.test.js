'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const ER = require('../model');
require('../restructure'); require('../relational'); require('../physical');

test('Database name can be applied beside its field and survives project storage with the updated SQL', () => {
  const fs = require('node:fs'), vm = require('node:vm');
  const app = fs.readFileSync(require.resolve('../app.js'), 'utf8');
  const relational = ER.relational(ER.parse('TITOLO: Nuovo schema\nENTITA: ditta\n- id [ID]\n- nome'));
  const physical = ER.physical(relational), table = physical.tables[0];
  const nodes = new Map(), handlers = {};
  const $ = id => {
    if (!nodes.has(id)) nodes.set(id, { value: '', checked: false, hidden: true, innerHTML: '',
      addEventListener(type, handler) { handlers[type] = handler; } });
    return nodes.get(id);
  };
  let saved, context;
  $('physical-form').querySelector = selector => {
    const [, index, option] = selector.match(/data-column="(\d+)"\]\[data-option="(\w+)"/);
    const value = table.columns[Number(index)][option];
    return typeof value === 'boolean' ? { type: 'checkbox', checked: value } : { type: 'text', value };
  };
  context = vm.createContext({ ER, $, derived: { physical, relational }, physicalTableId: '', formDirty: false,
    remember() {}, draw() { context.renderPhysical(); }, persist() { saved = JSON.stringify(context.derived); }, notify() {},
    errorIn(id, message) { throw Error(message); } });
  vm.runInContext(app.slice(app.indexOf('function renderPhysical()'), app.indexOf("$('physical-panel').addEventListener('click'")), context);
  context.renderPhysical();
  const markup = $('physical-panel').innerHTML;
  assert.match(markup.slice(markup.indexOf('id="physical-database"'), markup.indexOf('class="physical-options"')), /type="submit"[^>]*>Applica scelte SQL/);
  assert.ok(markup.indexOf('id="physical-error"') < markup.indexOf('class="physical-table-control"'));
  $('physical-database').value = 'farmacia'; $('physical-table-name').value = table.name;
  $('physical-create-database').checked = true; $('physical-if-not-exists').checked = true;
  handlers.submit({ target: { id: 'physical-form' }, preventDefault() {} });
  const restored = JSON.parse(saved);
  assert.equal(restored.physical.database, 'farmacia');
  assert.match(ER.physicalSQL(restored.physical, restored.relational), /CREATE DATABASE IF NOT EXISTS `farmacia`;/);
  assert.match(ER.physicalSQL(restored.physical, restored.relational), /USE `farmacia`;/);
  assert.match($('physical-panel').innerHTML, /id="physical-database" value="farmacia"/);
  assert.equal(context.formDirty, false);
});

test('MySQL proposal follows TikTok conventions and preserves editable choices', () => {
  const relational = ER.relational(ER.example(true)), original = ER.copy(relational), physical = ER.physical(relational);
  const user = physical.tables.find(t => t.name === 'utenti'), post = physical.tables.find(t => t.name === 'post');
  const column = name => user.columns.find(c => c.name === name);
  assert.equal(column('id').type, 'MEDIUMINT'); assert.ok(column('id').unsigned && column('id').autoIncrement);
  assert.equal(column('nome').type, 'VARCHAR(50)'); assert.equal(column('email').type, 'VARCHAR(320)'); assert.ok(column('email').unique);
  assert.equal(column('data_nascita').type, 'DATE'); assert.equal(column('stato_profilo_attivo').default, '1');
  assert.deepEqual(post.checks, ['video IS NOT NULL OR foto IS NOT NULL']);
  assert.equal(physical.tables.find(t => t.name === 'hashtag').columns.find(c => c.name === 'nome').type, 'TINYTEXT');
  user.name = 'utenti'; physical.database = 'tiktok'; column('id').type = 'BIGINT'; column('nome').type = 'VARCHAR(80)';
  user.checks.push('LENGTH(nome) > 0'); ER.syncPhysicalTypes(physical);
  const sql = ER.physicalSQL(physical, relational);
  assert.match(sql, /CREATE DATABASE IF NOT EXISTS `tiktok`/);
  assert.match(sql, /`id` BIGINT UNSIGNED AUTO_INCREMENT NOT NULL/);
  assert.match(sql, /`nome` VARCHAR\(80\) NOT NULL/);
  assert.match(sql, /CHECK \(LENGTH\(nome\) > 0\)/);
  assert.match(sql, /REFERENCES `utenti` \(`id`\)/);
  assert.ok(sql.indexOf('CREATE TABLE IF NOT EXISTS `utenti`') < sql.indexOf('CREATE TABLE IF NOT EXISTS `post`'));
  physical.tables.forEach(t => t.foreignKeys.forEach(f => f.columns.forEach((name, i) => {
    const c = t.columns.find(c => c.name === name), owner = physical.tables.find(t => t.id === f.target).columns.find(c => c.name === f.references[i]);
    assert.equal(c.type, owner.type); assert.equal(c.unsigned, owner.unsigned); assert.equal(c.autoIncrement, false);
  })));
  assert.deepEqual(ER.validatePhysical(JSON.parse(JSON.stringify(physical)), relational), physical);
  assert.equal(ER.physicalSQL(ER.copy(physical), relational), sql);
  assert.deepEqual(relational, original, 'Physical choices must not change the relational schema');
});

test('ENGINE/CHARSET and referential clauses are optional, explicit and preserved in saved choices', () => {
  const r = ER.relational(ER.restructure(ER.parse(require('node:fs').readFileSync(require.resolve('./fixtures/farmacia.txt'), 'utf8'))).model);
  const proposal = ER.physical(r);
  assert.doesNotMatch(ER.physicalSQL(proposal, r), /ENGINE=|CHARSET=|CHARACTER SET|ON DELETE|ON UPDATE/);
  assert.match(ER.physicalSQL(proposal, r), /CREATE TABLE IF NOT EXISTS `medicinali`/);
  assert.match(ER.physicalSQL(proposal, r), /`id` MEDIUMINT UNSIGNED AUTO_INCREMENT NOT NULL/);
  const phone = proposal.tables.find(t => t.name === 'ditte_numeri_di_telefono');
  assert.ok(phone.columns.some(c => c.name === 'n_telefono' && !c.autoIncrement));
  proposal.includeEngine = true;
  assert.match(ER.physicalSQL(proposal, r), /ENGINE=InnoDB;/);
  assert.doesNotMatch(ER.physicalSQL(proposal, r), /CHARSET=|CHARACTER SET/);
  proposal.includeCharset = true;
  assert.match(ER.physicalSQL(proposal, r), /DEFAULT CHARACTER SET utf8mb4/);
  assert.match(ER.physicalSQL(proposal, r), /ENGINE=InnoDB DEFAULT CHARSET=utf8mb4/);
  phone.foreignKeys[0].onDelete = 'RESTRICT'; phone.foreignKeys[0].onUpdate = 'NO ACTION';
  assert.match(ER.physicalSQL(proposal, r), /ON DELETE RESTRICT ON UPDATE NO ACTION/);
  phone.foreignKeys[0].onDelete = 'CASCADE'; phone.foreignKeys[0].onUpdate = 'CASCADE';
  assert.match(ER.physicalSQL(proposal, r), /ON DELETE CASCADE ON UPDATE CASCADE/);
  phone.columns.find(c => c.name === phone.foreignKeys[0].columns[0]).nullable = true;
  phone.foreignKeys[0].onDelete = 'SET NULL';
  assert.match(ER.physicalSQL(proposal, r), /ON DELETE SET NULL/);
  assert.deepEqual(ER.validatePhysical(JSON.parse(JSON.stringify(proposal)), r), proposal);
  const legacy = ER.copy(proposal); delete legacy.includeEngine; delete legacy.includeCharset;
  const loaded = ER.validatePhysical(legacy, r);
  assert.ok(loaded.includeEngine && loaded.includeCharset);
  const invalid = ER.copy(proposal); invalid.includeEngine = 'yes';
  assert.throws(() => ER.validatePhysical(invalid, r), /Opzioni ENGINE/);
});

test('MySQL rejects broken keys, unsafe fragments and incompatible options without modifying the proposal', () => {
  const r = ER.relational(ER.parse('ENTITA: A\n- id [ID]\n- importo\n- nome\nENTITA: B\n- id [ID]\nASSOCIAZIONE: usa: A [0,N] -> B [0,1]'));
  const proposal = ER.physical(r);
  const invalid = (change, expected) => { const p = ER.copy(proposal); change(p); assert.throws(() => ER.validatePhysical(p, r), expected); };
  invalid(p => { p.tables[0].columns[0].nullable = true; }, /PK/);
  invalid(p => { p.tables[0].columns[0].default = '1'; }, /AUTO_INCREMENT/);
  invalid(p => { p.tables[0].checks = ['id > 0']; }, /AUTO_INCREMENT/);
  invalid(p => { p.tables[0].checks = ['nome = NOW()']; }, /non consentito/);
  invalid(p => { p.tables[0].checks = ['inesistente > 0']; }, /sconosciuta/);
  invalid(p => { p.tables[0].checks = ['nome IS NOT NULL); DROP TABLE A; --']; }, /parentesi|una sola/);
  invalid(p => { p.tables[0].checks = ['LENGTH(nome > 0']; }, /parentesi/);
  invalid(p => { p.tables[0].columns[2].default = "'apice"; }, /apici/);
  invalid(p => { p.tables[0].columns[2].type = 'VARCHAR(50); DROP TABLE A'; }, /Tipo/);
  invalid(p => { p.tables[0].columns[2].unsigned = true; }, /UNSIGNED/);
  invalid(p => { p.tables[0].columns[2].type = 'TEXT'; p.tables[0].columns[2].unique = true; }, /indicizzabile/);
  invalid(p => { p.tables[1].columns.at(-1).type = 'VARCHAR(50)'; p.tables[1].columns.at(-1).unsigned = false; }, /tipo della FK/);
  invalid(p => { p.tables[1].foreignKeys[0].onDelete = 'SET NULL'; p.tables[1].columns.at(-1).nullable = false; }, /SET NULL/);
  invalid(p => { p.tables[1].foreignKeys[0].onDelete = 'CASCADE'; p.tables[1].checks = ['id_a IS NOT NULL']; }, /RESTRICT/);
  invalid(p => { p.tables[1].primaryKey = ['usa_id']; }, /struttura fisica/);
  invalid(p => { p.tables[1].name = p.tables[0].name; }, /duplicato/);
  invalid(p => { p.database = 'x'.repeat(65); }, /1–64/);
  const p = ER.copy(proposal); p.tables[0].columns[2].type = "ENUM('M', 'F')"; p.tables[0].columns[2].default = "'M'";
  p.tables[0].checks = ["nome <> 'test;--''a'"];
  assert.match(ER.physicalSQL(p, r), /ENUM\('M', 'F'\) NOT NULL DEFAULT 'M'/);
  p.tables[0].columns[2].type = 'TEXT'; p.tables[0].columns[2].default = "'valore'";
  assert.match(ER.physicalSQL(p, r), /TEXT NOT NULL DEFAULT \('valore'\)/);
  p.createDatabase = false; p.ifNotExists = false;
  assert.doesNotMatch(ER.physicalSQL(p, r), /CREATE DATABASE|IF NOT EXISTS/);
  assert.deepEqual(ER.physical(r), proposal);
});

test('MySQL handles composite optional FKs and cyclic table dependencies', () => {
  const r = ER.relational(ER.parse('ENTITA: A\n- prefisso [ID]\n- numero [ID]\nENTITA: B\n- id [ID]\nASSOCIAZIONE: abbina: A [0,N] -> B [0,1]'));
  const p = ER.physical(r), b = p.tables.find(t => t.name === 'b');
  assert.equal(b.checks.length, 1); assert.match(b.checks[0], /IS NULL.*IS NULL.*OR.*IS NOT NULL.*IS NOT NULL/);
  assert.match(ER.physicalSQL(p, r), /FOREIGN KEY \(`id_a_prefisso`, `id_a_numero`\)/);
  p.tables[0].columns[0].unique = true;
  assert.match(ER.physicalSQL(p, r), /`prefisso` VARCHAR\(50\) UNIQUE NOT NULL/);
  const cycle = ER.relational(ER.parse('ENTITA: A\n- id [ID]\nENTITA: B\n- id [ID]\nASSOCIAZIONE: ab: A [0,1] -> B [0,N]\nASSOCIAZIONE: ba: B [0,1] -> A [0,N]'));
  const sql = ER.physicalSQL(ER.physical(cycle), cycle);
  assert.ok(sql.indexOf('ALTER TABLE') > sql.lastIndexOf('CREATE TABLE'));
  assert.equal((sql.match(/FOREIGN KEY/g) || []).length, 2);
  const named = ER.relational(ER.parse('ENTITA: ordine`speciale\n- id [ID]'));
  assert.match(ER.physicalSQL(ER.physical(named), named), /`ordini``speciali`/);
});

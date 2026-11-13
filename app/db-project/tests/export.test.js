'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const app = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const context = vm.createContext({ model: { title: 'Biblioteca città / 5A' }, stage: 'initial' });
vm.runInContext(app.slice(app.indexOf('function filename('), app.indexOf('function download(')), context);

test('Export names identify the schema shown and the content of stage-independent exports', () => {
  for (const [stage, suffix] of Object.entries({ initial: 'er-iniziale', restructured: 'er-ristrutturato', relational: 'relazionale', physical: 'fisico-mysql', lab: 'laboratorio-query' })) {
    context.stage = stage;
    for (const extension of [undefined, 'svg', 'png']) {
      assert.equal(context.filename(extension), `Biblioteca-città-5A-${suffix}`);
    }
    assert.equal(context.filename('txt'), 'Biblioteca-città-5A-relazionale');
    assert.equal(context.filename('sql'), 'Biblioteca-città-5A-fisico-mysql');
    assert.equal(context.filename('json'), 'Biblioteca-città-5A-progetto');
  }
  context.model.title = ' / ? ';
  assert.equal(context.filename('json'), 'schema-progetto');
  context.model.title = 'Schema_2.0';
  assert.equal(context.filename('sql'), 'Schema_2.0-fisico-mysql');
});

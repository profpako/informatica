'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const ER = require('../model');
const app = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const readMetadata = vm.runInNewContext(app.slice(app.indexOf('function readExerciseMetadata(raw)'), app.indexOf('function readExerciseRecord(raw)')) + '\nreadExerciseMetadata');
const plain = value => JSON.parse(JSON.stringify(value));

test('Exercise dates and class/year tags validate imported JSON without inventing legacy dates', () => {
  assert.deepEqual(plain(readMetadata(null)), { createdAt: null, updatedAt: null, classTags: [] });
  const metadata = { createdAt: '2026-10-08T10:00:00.000Z', updatedAt: '2026-10-08T11:00:00.000Z', classTags: [{ className: ' 5a ', schoolYear: '2026/27' }, { className: '5A', schoolYear: '2027/28' }] };
  const normalized = plain(readMetadata(metadata));
  assert.equal(normalized.classTags[0].className, '5A');
  assert.deepEqual(plain(readMetadata(JSON.parse(JSON.stringify(normalized)))), normalized);
  assert.equal(metadata.classTags[0].className, ' 5a ');
  for (const createdAt of ['bad', '2026-02-30T00:00:00.000Z', '2026-10-08']) assert.throws(() => readMetadata({ ...metadata, createdAt }), /Data/);
  assert.throws(() => readMetadata({ ...metadata, updatedAt: '2025-10-08T10:00:00.000Z' }), /precede/);
  for (const tag of [{ className: '', schoolYear: '2026/27' }, { className: '5A', schoolYear: '2026/28' }, { className: '5A', schoolYear: '26/27' }, { className: '5A\n', schoolYear: '2026/27' }]) assert.throws(() => readMetadata({ ...metadata, classTags: [tag] }), /classe/);
  assert.throws(() => readMetadata({ ...metadata, classTags: [metadata.classTags[0], metadata.classTags[0]] }), /già presente/);
  assert.throws(() => readMetadata({ ...metadata, classTags: Array(31).fill(metadata.classTags[0]) }), /non validi/);
});

test('Only exercise content and class tags advance the modification date; creation stays fixed', () => {
  const metadata = { createdAt: '2026-10-08T09:00:00.000Z', updatedAt: '2026-10-08T10:00:00.000Z', classTags: [] };
  const record = { model: { title: 'Esercizio' }, derived: null, statement: null, draft: 'testo', display: {}, stage: 'initial', metadata };
  const now = '2026-10-08T11:00:00.000Z';
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } }
  const context = vm.createContext({ ER, Date: Clock, activeExerciseId: 'test', exercises: [{ id: 'test', record: ER.copy(record) }], exerciseMetadata: ER.copy(metadata), record: ER.copy(record) });
  vm.runInContext('function currentExerciseRecord() { return { ...record, metadata: exerciseMetadata }; }\n' + app.slice(app.indexOf('function saveCurrentExercise()'), app.indexOf('function applyExerciseRecord(record)')), context);
  context.saveCurrentExercise();
  context.record.display = { fontSizes: { nodes: 30 } }; context.record.stage = 'lab';
  context.saveCurrentExercise();
  assert.equal(context.exerciseMetadata.updatedAt, metadata.updatedAt);
  context.record.model.title = 'Modificato'; context.saveCurrentExercise();
  assert.equal(context.exerciseMetadata.createdAt, metadata.createdAt);
  assert.equal(context.exerciseMetadata.updatedAt, now);
  context.exerciseMetadata = { ...metadata, createdAt: null };
  context.record.statement = { type: 'text/plain', content: 'Una nuova traccia' }; context.saveCurrentExercise();
  assert.equal(context.exerciseMetadata.createdAt, null, 'Legacy creation remains unknown after an edit');
  assert.equal(context.exerciseMetadata.updatedAt, now);
  context.exerciseMetadata = ER.copy(metadata);
  context.exerciseMetadata.classTags.push({ className: '5A', schoolYear: '2026/27' });
  context.saveCurrentExercise();
  assert.equal(context.exerciseMetadata.updatedAt, now);
  assert.deepEqual(context.exercises[0].record.metadata.classTags, context.exerciseMetadata.classTags);
});

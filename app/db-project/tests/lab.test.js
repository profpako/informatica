const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ER = require('../model.js');
test('Query visualization connects compared columns, highlights phases and escapes database content', () => {
  const context = vm.createContext({ ER });
  vm.runInContext(fs.readFileSync(require.resolve('../lab.js'), 'utf8'), context);
  const { graph, dataTable } = context.TramaLab;
  const result = { sources: [{ name: '<ditte>', alias: 'd', columns: [{ name: 'id', key: 'PRI' }, { name: 'nome', key: '' }] }, { name: 'medicinali', alias: 'm', columns: [{ name: 'id_ditta', key: 'MUL' }] }], usage: { select: [{ alias: 'd', column: 'nome' }], join: [{ alias: 'd', column: 'id' }, { alias: 'm', column: 'id_ditta' }] }, links: [{ left: { alias: 'd', column: 'id' }, right: { alias: 'm', column: 'id_ditta' }, clause: 'join' }] };
  const svg = graph(result, 'join');
  assert.equal((svg.match(/lab-graph-column active/g) || []).length, 2);
  assert.match(svg, /lab-link active/);
  assert.match(svg, /&lt;ditte&gt;/);
  assert.equal((graph(result, 'select').match(/lab-graph-column active/g) || []).length, 1);
  const table = dataTable({ columns: ['<nome>'], rows: [['<script>'], [null]], truncated: true });
  assert.match(table, /&lt;script&gt;/); assert.match(table, /lab-null/); assert.match(table, /altre righe/);
});
test('Generation progress arrives before completion across split UTF-8 chunks, and errors stay visible', async () => {
  const context = vm.createContext({ ER, TextDecoder });
  vm.runInContext(fs.readFileSync(require.resolve('../lab.js'), 'utf8'), context);
  const { readGenerationStream } = context.TramaLab;
  const encoder = new TextEncoder(), progress = [];
  let controller;
  const body = new ReadableStream({ start(c) { controller = c; } });
  const pending = readGenerationStream(body, item => progress.push(item));
  const frame = encoder.encode(JSON.stringify({ event: 'progress', data: { table: 'città', phase: 'generating' } }) + '\n');
  // Split inside the UTF-8 character, as a network response may do.
  const split = frame.indexOf(195) + 1;
  controller.enqueue(frame.slice(0, split)); controller.enqueue(frame.slice(split));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(progress[0].table, 'città');
  controller.enqueue(encoder.encode('{"event":"done","data":{"tables":[]}}\n')); controller.close();
  assert.equal((await pending).tables.length, 0);
  const error = new ReadableStream({ start(c) { c.enqueue(encoder.encode('{"event":"error","error":"CHECK non valido"}\n')); c.close(); } });
  await assert.rejects(readGenerationStream(error, () => {}), /CHECK non valido/);
  const interrupted = new ReadableStream({ start(c) { c.close(); } });
  await assert.rejects(readGenerationStream(interrupted, () => {}), /interrotta/);
});

test('Expired insertion preserves the proposal, unlocks reconnection and inserts only after reconnecting to the same database', async () => {
  // Minimal DOM surface for the real mounted event handlers; no browser dependency.
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { id, value: '', hidden: false, disabled: false, textContent: '', handlers: {},
      addEventListener(type, handler) { this.handlers[type] = handler; },
      querySelectorAll() { return []; }, querySelector() { return node(id + '-submit'); },
      setAttribute() {}, scrollIntoView() {} });
    return nodes.get(id);
  };
  const panel = { hidden: false, set innerHTML(html) {
    for (const match of html.matchAll(/<(\w+)[^>]*\bid="([^"]+)"([^>]*)>/g)) {
      const element = node(match[2]); element.hidden = /\bhidden\b/.test(match[3]);
      element.value = /\bvalue="([^"]*)"/.exec(match[3])?.[1] || '';
    }
  }, querySelector: selector => node(selector.slice(1)), addEventListener() {}, setAttribute() {} };
  const proposal = { fingerprint: 'schema', tables: [{ name: 'ditte', rows: [{ id: 1, nome: 'Ditta A' }] }] };
  const requests = [], notices = [];
  let expired = true, counter = 0;
  const context = vm.createContext({ ER, localStorage: { getItem() {}, setItem() {} }, fetch: async (url, options) => {
    const body = JSON.parse(options.body); requests.push({ url, body });
    let data;
    if (url === '/api/connect') data = { session: 'session-' + ++counter, exists: true, version: 'MySQL', tables: [{ name: 'ditte' }] };
    if (url === '/api/generate') data = proposal;
    if (url === '/api/insert') {
      if (expired) return { ok: false, status: 401, text: async () => JSON.stringify({ code: 'session_expired', error: 'Connessione scaduta. Collegati nuovamente.' }) };
      assert.deepEqual(body.draft, proposal); data = { inserted: 1 };
    }
    return { ok: true, headers: { get() { return 'application/json'; } }, text: async () => JSON.stringify(data) };
  } });
  vm.runInContext(fs.readFileSync(require.resolve('../lab.js'), 'utf8'), context);
  context.TramaLab.mount({ panel, notify: message => notices.push(message), onConnection() {}, getPhysical() {} });
  const act = async (id, type = 'click') => { node(id).handlers[type]({ preventDefault() {} }); await new Promise(resolve => setImmediate(resolve)); };
  node('lab-host').value = '127.0.0.1'; node('lab-database').value = 'farmacia';
  await act('lab-connect-form', 'submit'); await act('lab-generate-form', 'submit');
  const original = node('lab-draft').value;
  await act('lab-insert');
  assert.match(node('lab-insert-status').textContent, /Connessione scaduta/);
  assert.equal(node('lab-draft').value, original); assert.equal(node('lab-draft-section').hidden, false);
  assert.equal(node('lab-connect-form-submit').disabled, false);
  assert.equal(node('lab-insert').disabled, true);
  assert.equal(node('lab-insert').textContent, 'Inserisci queste righe');
  node('lab-database').value = 'altro'; await act('lab-connect-form', 'submit');
  assert.equal(node('lab-draft-section').hidden, true);
  await act('lab-disconnect'); node('lab-database').value = 'farmacia';
  await act('lab-connect-form', 'submit');
  assert.equal(node('lab-draft-section').hidden, false); assert.equal(node('lab-insert').disabled, false);
  expired = false; await act('lab-insert');
  assert.equal(requests.filter(r => r.url === '/api/insert').length, 2);
  assert.equal(requests.at(-1).body.session, 'session-3');
  assert.equal(node('lab-draft').value, ''); assert.equal(node('lab-draft-section').hidden, true);
  assert.match(node('lab-insert-status').textContent, /1 righe inserite/);
  assert.equal(notices.length, 1);
});

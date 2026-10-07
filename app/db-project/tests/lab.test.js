const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ER = require('../model.js');
require('../restructure.js'); require('../relational.js'); require('../physical.js');
test('Filters retain OR truth, distinguish NULL and expose group members and full clause names', () => {
  const context = vm.createContext({ ER });
  vm.runInContext(fs.readFileSync(require.resolve('../lab.js'), 'utf8'), context);
  const { conditionView, groupView, stepLabel, workingRoles } = context.TramaLab;
  const filtered = conditionView({ phase: 'where', condition: 'd.id=1 OR d.nome IS NULL',
    input: { columns: ['d.nome'], rows: [['<Acme>'], [null], ['Beta']] },
    checks: { conditions: ['d.id=1', 'd.nome IS NULL', 'd.id=1 OR d.nome IS NULL'], rows: [[1, 0, 1], [0, 1, 1], [-1, 0, -1]] } }, {});
  assert.equal((filtered.match(/lab-row-kept/g) || []).length, 2);
  assert.equal((filtered.match(/lab-row-discarded/g) || []).length, 1);
  assert.match(filtered, /Scarta \(NULL\)/); assert.match(filtered, /&lt;Acme&gt;/);
  assert.match(filtered, /<strong>C2<\/strong>/);
  const group = { phase: 'group', keys: ['d.nome'], input: { columns: ['Gruppo', 'd.nome', 'm.id'], rows: [[1, 'Acme', 2], [2, 'Beta', 3], [2, 'Beta', 4]] },
    data: { columns: ['Gruppo', 'd.nome', 'COUNT(*)'], rows: [[1, 'Acme', 1], [2, 'Beta', 2]] } };
  const groups = groupView(group, {});
  assert.match(groups, /Gruppo 2 · d.nome = Beta · 2 righe mostrate/);
  assert.equal((groups.match(/class="lab-source lab-group"/g) || []).length, 2);
  assert.equal(stepLabel(group), 'GROUP BY');
  assert.equal(stepLabel({ phase: 'having' }), 'HAVING');
  assert.equal(stepLabel({ phase: 'order' }), 'ORDER BY');
  const roles = workingRoles({ sources: [{ alias: 'm', columns: [{ name: 'id_ditta', key: 'MUL' }], foreignKeys: [{ columns: ['id_ditta'] }] }],
    usage: { join: [{ alias: 'm', column: 'id_ditta' }] } });
  assert.equal(roles['m.id_ditta'].join(', '), 'FK, JOIN');
});
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

test('The laboratory preserves dependency diagnoses and guides AI setup according to service and model availability', async () => {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { value: '', handlers: {},
      addEventListener(type, handler) { this.handlers[type] = handler; },
      querySelectorAll() { return []; }, querySelector() { return node(id + '-submit'); } });
    return nodes.get(id);
  };
  const diagnosis = 'Le dipendenze ora sono disponibili. Arresta il server con Ctrl+C e riavvia ./start_app.sh.';
  let state = { dependencies: false, dependencyError: diagnosis, models: [] };
  const context = vm.createContext({ ER, localStorage: { getItem() {} }, fetch: async () => ({
    ok: true, text: async () => JSON.stringify(state)
  }) });
  vm.runInContext(fs.readFileSync(require.resolve('../lab.js'), 'utf8'), context);
  const panel = { querySelector: selector => node(selector.slice(1)), addEventListener() {}, setAttribute() {} };
  context.TramaLab.mount({ panel, notify() {}, onConnection() {}, getPhysical() {} });
  node('lab-ai-refresh').handlers.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(node('lab-error').hidden, false);
  assert.equal(node('lab-error').textContent, diagnosis);
  for (const link of ['https://ollama.com/download/mac', 'https://ollama.com/download/windows', 'https://docs.ollama.com/linux']) {
    assert.ok(panel.innerHTML.includes(link));
  }
  assert.match(panel.innerHTML, /ollama pull qwen3\.5:2b-q4_K_M/);
  assert.match(panel.innerHTML, /PowerShell/);
  for (const [models, aiError, expected, guideOpen] of [
    [[], 'Ollama non risponde.', /Ollama non risponde.*guida/, true],
    [[], '', /Ollama è attivo.*ollama pull qwen3\.5:2b-q4_K_M/, true],
    [['qwen3.5:2b-q4_K_M'], '', /AI locale disponibile/, false],
    [['another-local-model'], '', /AI locale disponibile/, false]
  ]) {
    state = { dependencies: true, models, aiError };
    node('lab-ai-refresh').handlers.click();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(node('lab-error').hidden, true);
    assert.match(node('lab-ai-status').textContent, expected);
    assert.equal(node('lab-ai-setup').open, guideOpen);
  }
  const small = 'qwen3.5:2b-q4_K_M', medium = 'qwen3.5:4b-q4_K_M', large = 'qwen3.5:9b-q4_K_M';
  state = { dependencies: true, models: [small, medium], defaultModel: medium,
    hardware: { system: 'Darwin', ramGb: 16, appleSilicon: true },
    modelAdvice: [small, medium, large].map((model, i) => ({ model, label: model, downloadGb: [1.9, 3.3, 6.6][i], ramGb: [8, 16, 24][i], source: 'https://huggingface.co/Qwen/Qwen3.5-' + [2, 4, 9][i] + 'B' })) };
  context.TramaLab.mount({ panel, notify() {}, onConnection() {}, getPhysical() {} });
  node('lab-ai-refresh').handlers.click(); await new Promise(resolve => setImmediate(resolve));
  assert.match(node('lab-hardware').textContent, /Apple Silicon.*16 GB/);
  assert.equal(node('lab-model').value, medium);
  assert.equal(node('lab-model-command').textContent, 'ollama pull ' + medium);
  panel.addEventListener = (type, handler) => { panel.change = handler; };
  // Start a fresh mounted flow with a saved choice, which must survive the recommendation.
  context.localStorage.getItem = () => JSON.stringify({ model: small });
  context.TramaLab.mount({ panel, notify() {}, onConnection() {}, getPhysical() {} });
  node('lab-ai-refresh').handlers.click(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(node('lab-model').value, small);
  node('lab-model-advice').value = large; node('lab-model-advice').handlers.change();
  assert.match(node('lab-advice-details').innerHTML, /inferiore a quella consigliata/);
  assert.equal(node('lab-model').value, small, 'An uninstalled suggestion cannot become the active model');
  state.models.push(large);
  node('lab-ai-refresh').handlers.click(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(node('lab-model').value, large, 'The explicitly chosen model becomes selectable after download');
  node('lab-model').value = small;
  panel.change({ target: { id: 'lab-model', value: small, closest() { return null; } } });
  node('lab-ai-refresh').handlers.click(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(node('lab-model').value, small, 'A later explicit choice must survive another verification');
  state.hardware = {}; node('lab-ai-refresh').handlers.click(); await new Promise(resolve => setImmediate(resolve));
  assert.match(node('lab-hardware').textContent, /RAM non rilevabile/);
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

test('Physical database renames replace stale preferences, preserve manual choices and wait for active connections to close', async () => {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { id, value: '', handlers: {},
      addEventListener(type, handler) { this.handlers[type] = handler; },
      querySelectorAll() { return []; }, querySelector() { return node(id + '-submit'); } });
    return nodes.get(id);
  };
  const panel = { set innerHTML(html) {
    for (const match of html.matchAll(/<\w+[^>]*\bid="([^"]+)"([^>]*)>/g)) {
      const element = node(match[1]); element.hidden = /\bhidden\b/.test(match[2]);
      element.value = /\bvalue="([^"]*)"/.exec(match[2])?.[1] || '';
    }
  }, querySelector: selector => node(selector.slice(1)), addEventListener(type, handler) { this[type] = handler; }, setAttribute() {} };
  let stored = JSON.stringify({ database: 'nuovo_schema', port: 8889, user: 'root', model: 'modello_scelto' });
  let physical = 'farmacia', finishConnect;
  const requests = [];
  const context = vm.createContext({ ER, localStorage: { getItem: () => stored, setItem(key, value) { stored = value; } },
    fetch: async (url, options) => {
      requests.push({ url, body: options.body ? JSON.parse(options.body) : null });
      if (url === '/api/connect') await new Promise(resolve => { finishConnect = resolve; });
      const data = url === '/api/status' ? { dependencies: true, models: ['qwen3.5:2b-q4_K_M', 'modello_scelto'] }
        : url === '/api/connect' ? { session: 'session', version: 'MySQL', exists: true, tables: [] } : {};
      return { ok: true, text: async () => JSON.stringify(data) };
    } });
  vm.runInContext(fs.readFileSync(require.resolve('../lab.js'), 'utf8'), context);
  const mount = () => context.TramaLab.mount({ panel, notify() {}, onConnection() {},
    getPhysical: () => physical ? { result: { database: physical } } : null });
  let lab = mount();
  await lab.activate();
  assert.equal(node('lab-database').value, 'farmacia', 'A legacy saved name must not override the physical schema');
  assert.equal(node('lab-port').value, '8889');
  assert.equal(node('lab-model').value, 'modello_scelto', 'Database synchronization preserves the saved AI choice before status loads');
  physical = 'farmacia_test'; await lab.activate();
  assert.equal(node('lab-database').value, physical);
  assert.equal(JSON.parse(stored).database, physical);
  node('lab-database').value = 'scelta_manuale';
  panel.change({ target: { id: 'lab-database', closest() { return null; } } });
  await lab.activate();
  assert.equal(node('lab-database').value, 'scelta_manuale');
  lab = mount(); await lab.activate();
  assert.equal(node('lab-database').value, 'scelta_manuale', 'A manual choice survives reload if the physical name is unchanged');
  physical = 'farmacia_nuova';
  lab = mount(); await lab.activate();
  assert.equal(node('lab-database').value, physical, 'A physical rename is detected after reload too');
  node('lab-host').value = '127.0.0.1';
  node('lab-connect-form').handlers.submit({ preventDefault() {} });
  physical = 'farmacia_finale'; await lab.activate();
  assert.equal(node('lab-database').value, 'farmacia_nuova', 'A pending request keeps its original target');
  finishConnect(); await new Promise(resolve => setImmediate(resolve));
  assert.match(node('lab-connected').textContent, /farmacia_nuova/);
  assert.equal(node('lab-database').value, 'farmacia_nuova');
  assert.equal(node('lab-database-hint').hidden, false);
  assert.match(node('lab-database-hint').textContent, /farmacia_finale.*Scollega/);
  await lab.activate();
  assert.equal(requests.filter(r => r.url === '/api/connect').length, 1, 'Renames never reconnect implicitly');
  await node('lab-disconnect').handlers.click();
  assert.equal(node('lab-database').value, physical);
  assert.equal(node('lab-database-hint').hidden, true);
  assert.equal(JSON.parse(stored).database, physical);
  physical = null; await lab.activate();
  assert.equal(node('lab-database').value, 'farmacia_finale', 'An unavailable physical schema leaves the connection settings intact');
});

test('Guided population sends distinct quantities and ER bounds; query errors and progress appear beside the execution button', async () => {
  const relational = ER.relational(ER.restructure(ER.parse('ENTITA: ditta\n- id [ID]\n- nome\n- n_telefono [1,N]')).model);
  const physical = { result: ER.physical(relational), relational };
  const tables = physical.result.tables.map(t => ({ name: t.name, unique: [t.primaryKey, ...t.unique],
    foreignKeys: t.foreignKeys.map(f => ({ ...f, target: physical.result.tables.find(t => t.id === f.target).name })) }));
  const source = { name: 'ditte', alias: 'd', columns: [{ name: 'id', key: 'PRI' }], foreignKeys: [], sample: { columns: ['id'], rows: [[1]] } };
  const queryResult = { sources: [source], links: [], usage: { select: [] }, note: '',
    working: { label: 'Tabella intermedia · FROM e JOIN', data: source.sample }, final: { data: source.sample },
    steps: [{ phase: 'select', label: 'Risultato', activeAliases: ['d'], data: source.sample, sql: 'SELECT d.id FROM ditte d' }] };
  const nodes = new Map(), scrolled = [];
  function parse(html) {
    for (const match of html.matchAll(/<\w+[^>]*\bid="([^"]+)"([^>]*)>/g)) {
      const e = node(match[1]), attrs = match[2];
      e.value = /\bvalue="([^"]*)"/.exec(attrs)?.[1] || '';
      e.checked = /\bchecked\b/.test(attrs); e.hidden = /\bhidden\b/.test(attrs); e.disabled = /\bdisabled\b/.test(attrs);
      e.dataset.planDisabled = /data-plan-disabled="true"/.test(attrs) ? 'true' : undefined;
    }
  }
  function node(id) {
    if (!nodes.has(id)) nodes.set(id, { id, value: '', dataset: {}, handlers: {}, textContent: '',
      set innerHTML(html) { this.html = html; parse(html); }, get innerHTML() { return this.html; },
      addEventListener(type, handler) { this.handlers[type] = handler; },
      querySelectorAll() { return id === 'lab-generate-form' ? [...nodes.values()].filter(e => /^lab-(count|link-)/.test(e.id)) : []; },
      querySelector() { return node(id + '-submit'); }, setAttribute() {}, scrollIntoView() { scrolled.push(id); } });
    return nodes.get(id);
  }
  const panel = { hidden: false, set innerHTML(html) { parse(html); }, querySelector: selector => nodes.get(selector.slice(1)),
    addEventListener(type, handler) { this[type] = handler; }, setAttribute() {} };
  const requests = []; let finishQuery, failQuery = true;
  const context = vm.createContext({ ER, localStorage: { getItem() {}, setItem() {} }, fetch: async (url, options) => {
    const body = options.body ? JSON.parse(options.body) : null; requests.push({ url, body });
    let data = {};
    if (url === '/api/status') data = { dependencies: true, models: ['qwen3.5:2b-q4_K_M'] };
    if (url === '/api/connect') data = { session: 'session', exists: true, version: 'MySQL', tables };
    if (url === '/api/generate') data = { tables: [{ name: 'ditte', rows: [{ id: 1, nome: 'A' }] }] };
    if (url === '/api/query') {
      await new Promise(resolve => { finishQuery = resolve; });
      if (failQuery) return { ok: false, text: async () => JSON.stringify({ error: 'Colonna sconosciuta o ambigua: d.n_telefono. Specifica tabella/alias.colonna.' }) };
      data = queryResult;
    }
    return { ok: true, headers: { get() { return 'application/json'; } }, text: async () => JSON.stringify(data) };
  } });
  vm.runInContext(fs.readFileSync(require.resolve('../lab.js'), 'utf8'), context);
  const lab = context.TramaLab.mount({ panel, notify() {}, onConnection() {}, getPhysical: () => physical });
  const settle = () => new Promise(resolve => setImmediate(resolve));
  const act = async (id, type = 'click') => { node(id).handlers[type]({ preventDefault() {} }); await settle(); };
  await lab.activate(); node('lab-host').value = '127.0.0.1'; await act('lab-connect-form', 'submit');
  assert.equal(node('lab-link-min-0').value, '1'); assert.equal(node('lab-link-max-0').value, '3');
  assert.equal(node('lab-link-enabled-0').disabled, true, 'Mandatory ER coverage cannot be disabled');
  node('lab-count-0').value = '5'; node('lab-count-1').value = '8'; await act('lab-generate-form', 'submit');
  const first = requests.find(r => r.url === '/api/generate').body;
  assert.deepEqual(first.count, { ditte: 5, ditte_numeri_di_telefono: 8 });
  assert.deepEqual(first.distributions, [{ table: 'ditte_numeri_di_telefono', columns: ['id_ditta'], min: 1, max: 3 }]);
  node('lab-target').value = 'ditte_numeri_di_telefono';
  panel.change({ target: { id: 'lab-target', closest() { return null; } } });
  assert.equal(node('lab-count-0').disabled, true, 'Hidden quantities must not block form validation');
  node('lab-count-1').value = '2'; await act('lab-generate-form', 'submit');
  assert.deepEqual(requests.filter(r => r.url === '/api/generate').at(-1).body.count, { ditte_numeri_di_telefono: 2 });
  const sql = 'SELECT d.n_telefono FROM ditte d JOIN ditte_numeri_di_telefono n ON d.id=n.id_ditta';
  node('lab-sql').value = sql;
  node('lab-query-form').handlers.submit({ preventDefault() {} });
  assert.match(node('lab-query-status').textContent, /Esecuzione/); assert.equal(node('lab-query').textContent, 'Esecuzione in corso…');
  finishQuery(); await settle();
  assert.match(node('lab-query-status').textContent, /d.n_telefono/); assert.equal(node('lab-query-status').className, 'error');
  assert.ok(scrolled.includes('lab-query-status')); assert.equal(node('lab-sql').value, sql);
  assert.equal(node('lab-query').textContent, 'Esegui e spiega'); assert.equal(node('lab-result').hidden, true);
  node('lab-sql').value = 'SELECT d.id FROM ditte d'; node('lab-sql').handlers.input();
  assert.equal(node('lab-query-status').textContent, '');
  failQuery = false; node('lab-query-form').handlers.submit({ preventDefault() {} }); finishQuery(); await settle();
  assert.equal(node('lab-query-status').className, 'field-hint'); assert.match(node('lab-query-status').textContent, /Query eseguita/);
  assert.equal(node('lab-result').hidden, false);
  assert.match(node('lab-result').innerHTML, /Tabella intermedia · FROM e JOIN/);
  assert.match(node('lab-result').innerHTML, /Tabella finale/);
  assert.equal(context.TramaLab.distributionOptions(tables, null)[0].er, false, 'External databases do not invent an ER minimum');
  const renamed = ER.copy(physical); renamed.result.tables[1].name = 'altro';
  assert.equal(context.TramaLab.distributionOptions(tables, renamed)[0].er, false, 'Only matching physical tables inherit the ER minimum');
});

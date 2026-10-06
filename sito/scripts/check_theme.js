// Dalla radice: node sito/scripts/check_theme.js. Usa soltanto moduli Node incorporati.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'assets/theme.js'), 'utf8');

function page(storage, prefersDark = false) {
  const events = {}, changes = {};
  const select = {value: '', addEventListener: (name, callback) => changes[name] = callback};
  const document = {
    documentElement: {dataset: {}},
    addEventListener: (name, callback) => events[name] = callback,
    querySelectorAll: () => [select],
  };
  vm.runInNewContext(source, {document, localStorage: storage, matchMedia: () => ({matches: prefersDark})});
  const initialTheme = document.documentElement.dataset.theme;
  events.DOMContentLoaded();
  assert.equal(select.value, initialTheme);
  return {document, select, changes, initialTheme};
}

let saved = null;
const storage = {
  getItem: key => {assert.equal(key, 'lezioni-theme'); return saved;},
  setItem: (key, value) => {assert.equal(key, 'lezioni-theme'); saved = value;},
};
const first = page(storage);
assert.equal(first.initialTheme, 'light');
first.select.value = 'dark';
first.changes.change();
assert.equal(first.document.documentElement.dataset.theme, 'dark');
assert.equal(saved, 'dark');
assert.equal(page(storage).initialTheme, 'dark');
first.select.value = 'light';
first.changes.change();
assert.equal(page(storage, true).initialTheme, 'light');
saved = 'valore non valido';
assert.equal(page(storage, true).initialTheme, 'dark');
const blocked = page({getItem() {throw Error('Bloccato');}, setItem() {throw Error('Bloccato');}});
blocked.select.value = 'dark';
blocked.changes.change();
assert.equal(blocked.document.documentElement.dataset.theme, 'dark');

// Riusa i controlli già presenti nel laboratorio per verificare l'aritmetica.
const lesson = fs.readFileSync(path.join(root, 'elaborazione/index.html'), 'utf8');
const script = lesson.match(/<script>([\s\S]*?)<\/script>/)[1];
const arithmetic = script.split('// Interfaccia:')[0];
console.log(vm.runInNewContext(arithmetic + '\nrunSelfChecks();'));

// Verifica il rendering delle note e delle formule con gli stessi controlli della pagina.
const elements = {};
function element(id) {
  return elements[id] ||= {
    value: '', checked: false, innerHTML: '', textContent: '', style: {},
    classList: {toggle(name, active) {this[name] = active;}},
    addEventListener() {}, setAttribute() {}, querySelector: () => null,
    parentElement: {querySelector: () => null},
  };
}
element('bit-count').value = '8';
element('number-input').value = '0';
element('second-input').value = '0';
const ui = vm.createContext({document: {
  getElementById: element, querySelectorAll: () => [],
  querySelector: () => element('stage-content'), addEventListener() {},
}});
vm.runInContext(script, ui);
assert.equal(vm.runInContext("formatPowers('<img> 2^9 e 2^N')", ui), '&lt;img&gt; 2<sup>9</sup> e 2<sup>N</sup>');
vm.runInContext("direction = 'bin'; $('bit-count').value = '10'; prepare();", ui);
assert.equal(element('stage-content').classList['notes-below'], true);
assert.ok(element('note').innerHTML.includes('2<sup>9</sup>'));
vm.runInContext("direction = 'dec'; prepare();", ui);
assert.equal(element('stage-content').classList['notes-below'], false);
for (const n of [1, 8, 10, 64, 1024]) {
  element('bit-count').value = String(n);
  for (const rep of ['sm', 'c1', 'c2']) {
    vm.runInContext(`mode = 'signed'; rep = '${rep}'; prepare();`, ui);
    assert.equal(element('configuration-count').textContent, String(1n << BigInt(n)));
    assert.equal(element('symmetric-count').textContent, String((1n << BigInt(n)) - 1n));
    assert.ok(element('note-detail').innerHTML.includes(`<span class="mono">${'0'.repeat(n)}</span>`));
    const zeroExplanation = element('note-detail').innerHTML;
    if (rep === 'c2') assert.ok(zeroExplanation.includes('una sola codifica'));
    else assert.ok(zeroExplanation.includes(`−0 = <span class="mono">${rep === 'sm' ? '1' + '0'.repeat(n - 1) : '1'.repeat(n)}</span>`));
  }
}
vm.runInContext("mode = 'sum'; rep = 'sm'; direction = 'bin'; prepare();", ui);
assert.equal(element('stage-content').classList['notes-below'], false);
assert.ok(element('note-detail').innerHTML.includes('In C2 lo zero ha una sola codifica'));
assert.ok(element('note-detail').innerHTML.includes('2<sup>N</sup>'));
console.log('Note: posizione, apici, conteggi e codifiche dello zero OK (1–1024 bit).');
console.log('Tema: selezione, memoria, preferenza di sistema e salvataggio bloccato OK.');

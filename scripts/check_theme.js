// Esegui con: node scripts/check_theme.js. Usa soltanto moduli Node incorporati.
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
console.log('Tema: selezione, memoria, preferenza di sistema e salvataggio bloccato OK.');

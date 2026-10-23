'use strict';
const assert = require('node:assert/strict');
const C = require('./flowchart-core.js');
const make = (kind, fields = {}) => Object.assign(C.newNode(kind), fields);
const example = C.example();
const generated = C.generate(example);
assert.match(generated.code, /int calcolaArea\(int b, int h\)/);
assert.match(generated.code, /area = calcolaArea\(base, altezza\);/);
assert.equal(generated.lineMap.length, generated.code.split('\n').length + 1);
for (const fn of example.functions) for (const node of fn.body) {
  assert.ok(generated.lineMap.some(point => point?.node === node.id));
  assert.equal(C.locate(example, node.id).fn.id, fn.id);
}
const restored = JSON.parse(JSON.stringify(example));
assert.equal(C.generate(restored).code, generated.code);
const doc = C.blank();
const branch = make('if', { condition: 'n > 0', then: [make('output', { expression: 'n' })], else: [] });
const loop = make('for', { condition: 'i < 3', body: [branch, make('continue')] });
doc.functions[0].body = [make('declare', { name: 'n', init: '3' }), loop,
  make('while', { condition: 'n > 0', body: [make('assign', { expression: 'n--' }), make('break')] }),
  make('do', { condition: 'n < 2', body: [make('assign', { expression: 'n++' })] })];
const code = C.generate(doc).code;
assert.match(code, /for \(int i = 0; i < 3; i\+\+\)/);
assert.match(code, /else \{/);
assert.match(code, /do \{/);
for (const fn of [...example.functions, doc.functions[0]]) {
  const owner = fn.id === 'main' && fn === doc.functions[0] ? doc : example;
  const graph = C.layout(owner, fn.id);
  const ids = new Set(graph.nodes.map(n => n.id));
  assert.equal(ids.size, graph.nodes.length);
  assert.ok(graph.width > 0 && graph.height > 0);
  for (const node of graph.nodes) assert.ok([node.x,node.y,node.width,node.height].every(Number.isFinite));
  for (const edge of graph.edges) {
    assert.ok(ids.has(edge.from), edge.from);
    assert.ok(ids.has(edge.to), edge.to);
    assert.ok(edge.points.flat().every(Number.isFinite));
  }
}
assert.equal(C.locate(doc, branch.then[0].id).branch, 'then');
assert.throws(() => C.validate({}), /formato|versione/);
const duplicate = structuredClone(example); duplicate.functions[0].body[1].id = duplicate.functions[0].body[0].id;
assert.throws(() => C.validate(duplicate), /duplicato/);
const invalid = C.blank(); invalid.functions[0].body.push(make('assign', { expression: 'x=1; while(true)' }));
assert.throws(() => C.generate(invalid), /sola espressione/);
invalid.functions[0].body = [make('break')];
assert.throws(() => C.generate(invalid), /dentro un ciclo/);
invalid.functions[0].body = [make('declare', { name: '__segreto' })];
assert.throws(() => C.generate(invalid), /nome C\+\+ valido/);
invalid.functions[0].body = [make('output', { expression: '"Testo; { } #"' })];
assert.match(C.generate(invalid).code, /Testo; \{ \} #/);
const pointerDoc = C.blank();
pointerDoc.functions.push({id:'inc',name:'incrementa',returnType:'void',params:[{name:'p',type:'int',mode:'pointer'}],body:[make('assign',{expression:'*p += 1'})]});
pointerDoc.functions[0].body=[make('declare',{name:'x',init:'4'}),make('declare',{name:'p',mode:'pointer',init:'&x'}),make('call',{callee:'inc',args:'p'}),make('output',{expression:'x'})];
assert.match(C.generate(pointerDoc).code, /int \*p = &x;/);
if (process.argv.includes('--fixture')) process.stdout.write(JSON.stringify({example,generated,pointer:C.generate(pointerDoc),loops:C.generate(doc)}));
else console.log('Flowchart: generazione, mappa, rami/cicli, layout, puntatori, JSON e validazione verificati.');

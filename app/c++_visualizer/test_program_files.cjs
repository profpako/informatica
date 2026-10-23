'use strict';
const assert = require('node:assert/strict');
const F = require('./program-files.js');
const C = require('./flowchart-core.js');
(async () => {
  assert.equal(F.filename('Area del rettangolo', '.cpp'), 'Area del rettangolo.cpp');
  assert.equal(F.filename('Perché è così.flow.json', '.flow.json'), 'Perché è così.flow.json');
  assert.equal(F.filename('Area.cpp', '.cpp'), 'Area.cpp');
  assert.equal(F.filename('', '.cpp'), 'programma.cpp');
  assert.equal(F.filename('CON', '.cpp'), '_CON.cpp');
  assert.equal(F.filename('../area: "test" / base?', '.cpp'), 'area test base.cpp');
  assert.ok(!/[<>:"/\\|?*\u0000-\u001f]/.test(F.filename('x\0 / y', '.cpp')));
  assert.equal(F.baseName('Somma.flow.json'), 'Somma');
  const source = '#include <iostream>\nint main(){std::cout<<"Ciao è!";}\n';
  assert.equal(await F.readCpp(new Blob([source])), source);
  await assert.rejects(F.readCpp(new Blob(['x'.repeat(30001)])), /30.000/);
  await assert.rejects(F.readCpp(new Blob([new Uint8Array([0xff])])), /UTF-8/);
  await assert.rejects(F.readCpp(new Blob(['x\0y'])), /binari/);
  const doc = {...C.example(), title: 'Area del rettangolo'};
  const restored = C.validate(JSON.parse(JSON.stringify(doc)));
  assert.equal(restored.title, doc.title);
  assert.equal(C.generate(restored).code, C.generate(C.example()).code);
  assert.equal(C.validate(C.blank()).title, undefined);
  for (const title of [42, 'a'.repeat(81), 'Nome\naltro', 'Nome\0']) {
    assert.throws(() => C.validate({...C.blank(), title}), /Nome programma/);
  }
  console.log('File programmi: nomi, UTF-8, limiti e metadati Flowchart verificati.');
})().catch(error => {console.error(error);process.exitCode = 1;});

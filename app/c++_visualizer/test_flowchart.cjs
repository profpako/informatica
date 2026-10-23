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
assert.match(code, /for \(i = 0; i < 3; i = i \+ 1\)/);
assert.equal(C.generate(doc).flow.deferred.length, 1);
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
assert.match(C.generate(pointerDoc).code, /int \*\s*p = &x;/);
const automatic = C.blank();
automatic.functions[0].body = [make('input',{target:'base\nint altezza\nstring nome'}),
  make('assign',{expression:'area = base * altezza\ncontatore = 0\nprezzo = 2.5\nsaluto = "Ciao"'}),
  make('output',{expression:'saluto\n" "\nnome\n": "',ending:'OUT'}),make('output',{expression:'area'})];
const inferred = C.generate(automatic);
assert.match(inferred.code,/double base;/);
assert.match(inferred.code,/int altezza;/);
assert.match(inferred.code,/string nome;/);
assert.ok(!inferred.code.includes("#include <type_traits>"));
assert.ok(!inferred.code.includes("#include <iomanip>"));
assert.ok(!generated.code.includes("return 0;"));
const scoped = C.blank();
scoped.functions[0].body = [make('input',{target:'int scelta'}),make('if',{condition:'scelta > 0',
  then:[make('assign',{expression:'numero = 7\nsaluto = "Ciao"'}),make('declare',{name:'lavoro'})],
  else:[make('assign',{expression:'altro = 2'})]}),
  make('for',{init:'i = 0',condition:'i < 2',update:'i = i + 1',body:[make('assign',{expression:'numero = numero + i\nsaluto = "Fine"'})]}),
  make('output',{expression:'numero\n" "\nsaluto\n" "\ni'})];
const scopedGenerated = C.generate(scoped);
assert.equal(scopedGenerated.flow.deferred.length,5);
assert.ok(scopedGenerated.flow.deferred.some(d=>d.activate));
for(const d of scopedGenerated.flow.deferred) assert.equal(scopedGenerated.lineMap[d.line].phase,'prepare');
const legacy = structuredClone(example); legacy.version=1;
legacy.functions[0].body.at(-1).expression='"Area: " << area'; delete legacy.functions[0].body.at(-1).ending;
assert.equal(C.validate(legacy).version,3); assert.equal(legacy.functions[0].body.at(-1).expression,'"Area: "\narea');
const arrayDoc = C.blank();
arrayDoc.functions[0].body=[make('declare',{name:'N',constant:true,init:'3'}),make('declare',{name:'v',size:'N',init:'1,2,3'}),
  make('for',{condition:'i < N',body:[make('assign',{expression:'v[i] = v[i] * 2'})]}),make('output',{expression:'v[0]\n" "\nv[2]'})];
assert.match(C.generate(arrayDoc).code,/int v\[N\] = \{1,2,3\};/);
const graphical=C.layout(automatic,'main');
assert.ok(graphical.nodes.some(n=>n.shape==='io'&&n.height>62));
assert.deepEqual(C.blockLines('INPUT\nint base\nint altezza'),['INPUT','int base','int altezza']);
const ioDocument=C.blank();
ioDocument.functions[0].body=[make('input',{target:'int base\nint altezza'}),make('output',{expression:'"Base: "\nbase',ending:'OUT'}),make('output',{expression:'"Testo lungo da mostrare nel parallelogramma senza sovrapporre la sigla"'})];
const ioCode=C.generate(ioDocument).code, ioNodes=C.layout(ioDocument,'main').nodes.filter(node=>node.shape==='io');
assert.deepEqual(ioNodes.map(node=>node.badge.text),['I','O','OLN']);
assert.deepEqual(C.visualLines(ioNodes[0].text,'io'),['int base','int altezza']);
assert.deepEqual(C.visualLines(ioNodes[1].text,'io'),['"Base: "','base']);
for(const node of ioNodes) {
  const lines=C.visualLines(node.text,'io'), firstBaseline=node.height/2-(lines.length-1)*8+10;
  const rightSide=node.width/2-node.width*.075*node.badge.y/node.height;
  assert.ok(node.badge.x<rightSide-5);
  assert.ok(firstBaseline-13>node.badge.y+5);
  assert.ok(firstBaseline+(lines.length-1)*16<node.height-10);
  assert.ok(lines.every(line=>!['INPUT','OUT','OUTLN'].includes(line)));
}
assert.equal(C.generate(ioDocument).code,ioCode);
const compactIo=C.blank();compactIo.functions[0].body=[make('input',{target:'n'}),make('output',{expression:'n',ending:'OUT'}),make('output',{expression:'n'})];
const compactNodes=C.layout(compactIo,'main').nodes.filter(node=>node.shape==='io');
assert.ok(compactNodes.every(node=>node.height<62));
assert.ok(ioNodes[0].height>compactNodes[0].height);
for(const node of compactNodes)assert.ok(node.height/2+10-13>node.badge.y+5);
const insertDoc=C.blank(), entryEdge=C.layout(insertDoc,'main').edges[0];
assert.equal(C.layout(insertDoc,'main').nodes[0].text,'INIZIO main()');
assert.equal(C.layout(insertDoc,'main').nodes.at(-1).text,'FINE main()');
const first=C.insertAt(insertDoc,entryEdge.insertion,'assign');first.expression='n = 0';
const beforeFirst=C.layout(insertDoc,'main').edges.find(e=>e.from==='main:start');
const second=C.insertAt(insertDoc,beforeFirst.insertion,'input');second.target='int scelta';
assert.deepEqual(insertDoc.functions[0].body.map(n=>n.id),[second.id,first.id]);
const middle=C.layout(insertDoc,'main').edges.find(e=>e.from===second.id&&e.to===first.id);
const choice=C.insertAt(insertDoc,middle.insertion,'if');choice.condition='scelta > 0';
for(const [outcome,key] of [['true','then'],['false','else']]) {
  const emptyBranch=C.layout(insertDoc,'main').edges.find(e=>e.from===choice.id&&e.outcome===outcome);
  const inserted=C.insertAt(insertDoc,emptyBranch.insertion,'assign');inserted.expression='n = 1';
  assert.equal(choice[key][0].id,inserted.id);
  const afterBranch=C.layout(insertDoc,'main').edges.find(e=>e.from===inserted.id);
  const last=C.insertAt(insertDoc,afterBranch.insertion,'output');last.expression='n';
  assert.equal(choice[key][1].id,last.id);
}
const endEdge=C.layout(insertDoc,'main').edges.find(e=>e.to==='main:end');
const insertedLoop=C.insertAt(insertDoc,endEdge.insertion,'for');insertedLoop.condition='i < 2';
let loopGraph=C.layout(insertDoc,'main'), loopBox=loopGraph.nodes.find(n=>n.id===insertedLoop.id);
assert.equal(loopBox.shape,'for');assert.ok(loopBox.width>240);assert.ok(loopBox.height>=62);
assert.equal(loopBox.text,'i = 0; i < 2; i = i + 1');
assert.deepEqual(loopBox.parts.map(part=>part.label),['Inizializzazione','Condizione','Incremento']);
assert.deepEqual(loopBox.parts.map(part=>part.key),['init','condition','update']);
const emptyBody=loopGraph.edges.find(e=>e.from===insertedLoop.id&&e.outcome==='true');
const inside=C.insertAt(insertDoc,emptyBody.insertion,'assign');inside.expression='n = n + i';
assert.equal(insertedLoop.body[0].id,inside.id);
const back=C.layout(insertDoc,'main').edges.find(e=>e.from===inside.id&&e.to===insertedLoop.id);
assert.equal(back.insertion.parent,insertedLoop.id);assert.equal(back.insertion.index,1);
const loopExit=C.layout(insertDoc,'main').edges.find(e=>e.from===insertedLoop.id&&e.outcome==='false');
const afterLoop=C.insertAt(insertDoc,loopExit.insertion,'output');afterLoop.expression='n';
assert.equal(insertDoc.functions[0].body.at(-1).id,afterLoop.id);
insertedLoop.init='contatoreMoltoLungo = valoreIniziale + unAltroValoreIniziale + 100';
insertedLoop.update='contatoreMoltoLungo = contatoreMoltoLungo + incrementoDefinito';
const visibleFor=C.visualLines(C.label(insertedLoop,insertDoc),'for');
assert.equal(visibleFor.length,1);assert.equal(visibleFor[0],C.label(insertedLoop,insertDoc));
assert.ok(C.layout(insertDoc,'main').nodes.find(n=>n.id===insertedLoop.id).width>=visibleFor[0].length*8+80);
insertedLoop.init='i = 0';insertedLoop.update='i = i + 1';
const unchanged=C.generate(insertDoc).code;C.layout(insertDoc,'main');assert.equal(C.generate(insertDoc).code,unchanged);
const loopConditionPort=C.layout(insertDoc,'main').edges.find(e=>e.from===insertedLoop.id&&e.outcome==='false').points[0];
loopBox=C.layout(insertDoc,'main').nodes.find(n=>n.id===insertedLoop.id);
assert.deepEqual(loopConditionPort,[loopBox.x+loopBox.width/2,loopBox.y+loopBox.height/2]);
const savedInsert=JSON.stringify(insertDoc);
assert.throws(()=>C.insertAt(insertDoc,{fn:'main',parent:choice.id,branch:'then',index:99},'output'),/inserimento/);
assert.throws(()=>C.insertAt(insertDoc,{fn:'missing',parent:null,branch:'body',index:0},'output'),/inserimento/);
assert.equal(JSON.stringify(insertDoc),savedInsert);
const copyDoc=C.blank(), copiedIf=make('if',{condition:'n > 0',then:[make('assign',{expression:'n--'})],else:[make('output',{expression:'n'})]}),
  copiedLoop=make('do',{condition:'n > 0',body:[copiedIf]});
copyDoc.functions[0].body=[copiedLoop];
const clipboard=structuredClone(copiedLoop), clipboardBefore=JSON.stringify(clipboard);
const collectIds=node=>[node.id,...['then','else','body'].flatMap(key=>(node[key]||[]).flatMap(collectIds))];
const pasted=C.insertAt(copyDoc,{fn:'main',parent:null,branch:'body',index:1},clipboard.kind,clipboard);
assert.equal(pasted.body[0].then[0].expression,'n--');assert.equal(pasted.body[0].else[0].expression,'n');
assert.equal(collectIds(pasted).some(id=>collectIds(copiedLoop).includes(id)),false);
pasted.body[0].then[0].expression='n = 0';
assert.equal(copiedIf.then[0].expression,'n--');assert.equal(JSON.stringify(clipboard),clipboardBefore);
const pastedAgain=C.insertAt(copyDoc,{fn:'main',parent:null,branch:'body',index:2},clipboard.kind,clipboard);
assert.equal(collectIds(pastedAgain).some(id=>collectIds(pasted).includes(id)),false);
const copyBefore=JSON.stringify(copyDoc), badCopy=structuredClone(clipboard);badCopy.body[0].kind='invalid';
assert.throws(()=>C.insertAt(copyDoc,{fn:'main',parent:null,branch:'body',index:1},badCopy.kind,badCopy),/Blocco non valido/);
assert.equal(JSON.stringify(copyDoc),copyBefore);
copyDoc.functions.push({id:'other',name:'altra',returnType:'void',params:[],body:[]});
const acrossFunctions=C.insertAt(copyDoc,{fn:'other',parent:null,branch:'body',index:0},clipboard.kind,clipboard);
assert.equal(C.locate(copyDoc,acrossFunctions.body[0].id).fn.id,'other');
const deepCopy=C.blank();let deepList=deepCopy.functions[0].body, deepParent;
for(let depth=0;depth<12;depth++){deepParent=make('while',{condition:'true'});deepList.push(deepParent);deepList=deepParent.body;}
const deepBefore=JSON.stringify(deepCopy);
assert.throws(()=>C.insertAt(deepCopy,{fn:'main',parent:deepParent.id,branch:'body',index:0},clipboard.kind,clipboard),/annidato/);
assert.equal(JSON.stringify(deepCopy),deepBefore);
const full=C.blank();full.functions[0].body=Array.from({length:200},()=>make('output'));
assert.throws(()=>C.insertAt(full,{fn:'main',parent:null,branch:'body',index:0},'output'),/200/);
assert.equal(full.functions[0].body.length,200);
assert.throws(()=>C.insertAt(full,{fn:'main',parent:null,branch:'body',index:0},clipboard.kind,clipboard),/200/);
assert.equal(full.functions[0].body.length,200);
const doDoc=C.blank(), doLoop=make('do',{condition:'false'});doDoc.functions[0].body=[doLoop];
assert.equal(C.label(doLoop,doDoc),'false');
assert.equal(C.label(make('while',{condition:'n > 0'}),doDoc),'n > 0');
const doEdge=C.layout(doDoc,'main').edges.find(e=>e.from===doLoop.id+':entry'&&e.to===doLoop.id);
assert.equal(doEdge.insertion.parent,doLoop.id);assert.equal(doEdge.insertion.branch,'body');
assert.equal(C.kinds.if,'IF');assert.equal(C.kinds.for,'FOR');assert.equal(C.kinds.while,'WHILE');assert.equal(C.kinds.do,'DO...WHILE');
for(const populated of [false,true]) {
  const controls=C.blank(), w=make('while',{condition:'n > 0',body:populated?[make('assign',{expression:'n = n - 1'})]:[]}),
    d=make('do',{condition:'n < 2',body:populated?[make('assign',{expression:'n = n + 1'})]:[]});
  controls.functions[0].body=[make('assign',{expression:'n = 1'}),w,d];
  const graph=C.layout(controls,'main'), whileNode=graph.nodes.find(node=>node.id===w.id), doNode=graph.nodes.find(node=>node.id===d.id);
  const down=graph.edges.find(edge=>edge.from===w.id&&edge.outcome==='true');
  assert.deepEqual(down.points[0],[whileNode.x,whileNode.y+whileNode.height]);
  assert.equal(down.points[1][0],whileNode.x);assert.ok(down.points[1][1]>down.points[0][1]);
  assert.equal(down.arrow,'source-down');assert.deepEqual(down.head.at(-1),[whileNode.x,whileNode.y+whileNode.height+18]);
  assert.ok((down.points[0][1]+down.points[1][1])/2-7>down.head.at(-1)[1]);
  const beforeTest=graph.edges.find(edge=>edge.to===d.id&&!edge.jump);
  assert.deepEqual(beforeTest.points.at(-1),[doNode.x,doNode.y]);
  assert.equal(beforeTest.points.at(-2)[0],doNode.x);assert.ok(beforeTest.points.at(-2)[1]<doNode.y);
  assert.equal(beforeTest.insertion.parent,d.id);
  assert.equal(beforeTest.arrow,'target-down');assert.deepEqual(beforeTest.head.at(-1),[doNode.x,doNode.y]);
  assert.ok((beforeTest.points[0][1]+beforeTest.points.at(-1)[1])/2+7<beforeTest.head[0][1]);
}
const emptyChoice=C.blank(), emptyIf=make('if',{condition:'true'}), destination=make('output',{expression:'1'});
emptyChoice.functions[0].body=[emptyIf,destination];
const emptyChoiceGraph=C.layout(emptyChoice,'main');
for(const outcome of [true,false]) {
  const path=C.pathBetween(emptyChoiceGraph,emptyIf.id,destination.id,outcome);
  assert.equal(path.length,2);assert.equal(emptyChoiceGraph.edges[path[0]].outcome,String(outcome));
  assert.equal(emptyChoiceGraph.edges[path.at(-1)].to,destination.id);
}
assert.deepEqual(C.pathBetween(emptyChoiceGraph,destination.id,emptyIf.id),[]);
const emptyCycle=C.blank(), cycle=make('while',{condition:'true'});emptyCycle.functions[0].body=[cycle];
const forRouting=C.blank(), forEmpty=make('for',{condition:'i < 2'});forRouting.functions[0].body=[forEmpty];
const routingGraph=C.layout(forRouting,'main');
assert.equal(routingGraph.edges.find(edge=>edge.from===forEmpty.id&&edge.outcome==='true').endArrow,false);
assert.equal(routingGraph.edges.find(edge=>edge.from===forEmpty.id&&edge.outcome==='false').endArrow,false);
assert.equal(routingGraph.edges.find(edge=>edge.from===forEmpty.id+':body').endArrow,true);
assert.equal(routingGraph.edges.find(edge=>edge.from===forEmpty.id+':exit').endArrow,true);
for(const edge of routingGraph.edges)assert.equal(edge.endArrow,routingGraph.nodes.find(node=>node.id===edge.to).shape!=='join');
const routingBefore=JSON.stringify(routingGraph), drawnRouting=C.drawingGraph(routingGraph);
const trueRoute=drawnRouting.edges.filter(edge=>edge.from===forEmpty.id&&edge.outcome==='true');
const falseRoute=drawnRouting.edges.filter(edge=>edge.from===forEmpty.id&&edge.outcome==='false');
assert.equal(trueRoute.length,1);assert.equal(falseRoute.length,1);
assert.equal(trueRoute[0].to,forEmpty.id);assert.equal(falseRoute[0].to,'main:end');
for(const edge of [trueRoute[0],falseRoute[0]]) {
  assert.equal(edge.indices.length,2);assert.equal(edge.endArrow,true);assert.deepEqual(edge.heads,[]);
  assert.deepEqual(edge.indices,C.pathBetween(routingGraph,edge.from,edge.to,edge.outcome));
}
assert.equal(drawnRouting.nodes.some(node=>node.shape==='join'),false);
assert.deepEqual(drawnRouting.edges.flatMap(edge=>edge.indices).sort((a,b)=>a-b),routingGraph.edges.map((_,index)=>index));
assert.equal(JSON.stringify(routingGraph),routingBefore);
const differentPositions=JSON.parse(routingBefore);
differentPositions.edges.find(edge=>edge.from===forEmpty.id+':body').insertion.index=1;
assert.ok(C.drawingGraph(differentPositions).nodes.some(node=>node.id===forEmpty.id+':body'));
assert.ok(C.drawingGraph(emptyChoiceGraph).nodes.some(node=>node.id===emptyIf.id+':merge'));
const drawnWhile=C.drawingGraph(C.layout(emptyCycle,'main'));
const whileRoute=drawnWhile.edges.find(edge=>edge.from===cycle.id&&edge.outcome==='true');
assert.equal(whileRoute.to,cycle.id);assert.equal(whileRoute.heads.length,1);assert.equal(whileRoute.endArrow,true);
for(const populated of [false,true]) {
  const consecutive=C.blank(), f=make('for',{condition:'i < 2'}), d=make('do',{condition:'i > 0',body:populated?[make('assign',{expression:'i--'})]:[]});
  consecutive.functions[0].body=[f,d];
  const graph=C.layout(consecutive,'main'), drawn=C.drawingGraph(graph), entry=graph.nodes.find(node=>node.id===d.id+':entry');
  const arrival=drawn.edges.find(edge=>edge.from===f.id&&edge.outcome==='false');
  assert.equal(arrival.to,entry.id);assert.equal(arrival.endArrow,true);
  assert.deepEqual(arrival.points.at(-1),[entry.x,entry.y]);
  const repeat=drawn.edges.find(edge=>edge.from===d.id&&edge.outcome==='true');
  assert.equal(repeat.to,populated?d.body[0].id:d.id);assert.equal(repeat.indices.length,2);
  assert.equal(repeat.segments.length,2);
  assert.deepEqual(repeat.segments[0].points.at(-1),repeat.segments[1].points[0]);
  assert.equal(repeat.segments[0].endArrow,false);
  assert.equal(repeat.segments[1].endArrow,populated);
  assert.equal(drawn.nodes.some(node=>node.id===entry.id),false);
  const intoBody=C.pathBetween(graph,entry.id,populated?d.body[0].id:d.id);
  assert.deepEqual(intoBody,repeat.segments[1].indices);
  assert.equal(intoBody.some(index=>repeat.segments[0].indices.includes(index)),false);
  assert.deepEqual(drawn.edges.flatMap(edge=>edge.indices).sort((a,b)=>a-b),graph.edges.map((_,index)=>index));
}
forEmpty.body=[make('assign',{expression:'n = 1'})];
const populatedRouting=C.layout(forRouting,'main');
assert.equal(populatedRouting.edges.find(edge=>edge.from===forEmpty.id&&edge.outcome==='true').endArrow,true);
assert.equal(populatedRouting.edges.find(edge=>edge.from===forEmpty.id&&edge.outcome==='false').endArrow,false);
const drawnPopulated=C.drawingGraph(populatedRouting);
assert.equal(drawnPopulated.edges.find(edge=>edge.from===forEmpty.id&&edge.outcome==='true').to,forEmpty.body[0].id);
assert.equal(drawnPopulated.edges.find(edge=>edge.from===forEmpty.id&&edge.outcome==='false').to,'main:end');
assert.equal(C.pathBetween(C.layout(emptyCycle,'main'),cycle.id,cycle.id,true).length,2);
const fnGraph=C.layout(example,example.functions[1].id);
assert.equal(fnGraph.nodes[0].text,'INIZIO calcolaArea()');assert.equal(fnGraph.nodes.at(-1).text,'FINE calcolaArea()');
const fnInsert=C.insertAt(example,fnGraph.edges.find(e=>e.from===example.functions[1].id+':start').insertion,'declare');
assert.equal(example.functions[1].body[0].id,fnInsert.id);example.functions[1].body.shift();
const calls = C.blank();
calls.functions.push({id:'next',name:'prossimo',returnType:'int',params:[{name:'n',type:'int',mode:'reference'}],body:[make('assign',{expression:'n = n + 1'}),make('return',{expression:'n'})]});
calls.functions[0].body=[make('assign',{expression:'n = 0\nprimo = prossimo(n)'}),make('if',{condition:'true',then:[make('assign',{expression:'secondo = prossimo(n)'})],else:[]}),make('output',{expression:'n\n" "\nprimo\n" "\nsecondo'})];
const hiddenString=C.blank();hiddenString.functions[0].body=[make('if',{condition:'false',then:[make('assign',{expression:'testo = "Ciao"'})],else:[]}),make('output',{expression:'testo'})];
const stringReference=C.blank();
stringReference.functions.push({id:'edit',name:'modifica',returnType:'void',params:[{name:'t',type:'string',mode:'reference'}],body:[make('assign',{expression:'t = t + "!"'})]});
stringReference.functions[0].body=[make('if',{condition:'true',then:[make('assign',{expression:'testo = "Ciao"'})],else:[]}),make('call',{callee:'edit',args:'testo'}),make('output',{expression:'testo'})];
const nestedInput=C.blank();nestedInput.functions[0].body=[make('if',{condition:'true',then:[make('input',{target:'string nome\nint numero'})],else:[]}),make('output',{expression:'nome\n" "\nnumero'})];
const stable=C.blank();stable.functions[0].body=[make('declare',{name:'n'}),make('input',{target:'double n'})];
assert.throws(()=>C.generate(stable),/tipo rimane stabile/);
stable.functions[0].body=[make('input',{target:'v[0]'})];
assert.throws(()=>C.generate(stable),/Dichiara l’array/);
stable.functions[0].body=[make('assign',{expression:'a=1\na=2.5'})];
assert.equal((C.generate(stable).code.match(/std::decay_t/g)||[]).length,1);
if (process.argv.includes('--fixture')) process.stdout.write(JSON.stringify({example,generated,pointer:C.generate(pointerDoc),loops:C.generate(doc),automatic:inferred,scoped:scopedGenerated,array:C.generate(arrayDoc),calls:C.generate(calls),hiddenString:C.generate(hiddenString),stringReference:C.generate(stringReference),nestedInput:C.generate(nestedInput)}));
else console.log('Flowchart: generazione, mappa, rami/cicli, layout, puntatori, JSON e validazione verificati.');

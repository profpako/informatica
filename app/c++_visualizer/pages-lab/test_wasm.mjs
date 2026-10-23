import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const C=createRequire(import.meta.url)('../flowchart-core.js');

const worker=new Worker(new URL('./test-worker.mjs',import.meta.url));
let sequence=0;
const pending=new Map();
let readyResolve,readyReject;
const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
worker.on('message',message=>{
  if(message.ready){readyResolve();return;}
  if(message.phase)return;
  const task=pending.get(message.id);if(!task)return;
  clearTimeout(task.timer);pending.delete(message.id);
  if(message.error)task.reject(new Error(message.error));else task.resolve(message.result);
});
worker.on('error',error=>{readyReject(error);for(const task of pending.values()){clearTimeout(task.timer);task.reject(error);}pending.clear();});
async function call(path,data){
  await ready;
  return new Promise((resolve,reject)=>{
    const id=++sequence;
    pending.set(id,{resolve,reject,timer:setTimeout(()=>{pending.delete(id);reject(new Error('Timeout: '+path));worker.terminate();},120000)});
    worker.postMessage({id,path,data});
  });
}
const program=(body,functions='')=>'#include <iostream>\n#include <string>\n#include <type_traits>\nusing namespace std;\n'+functions+'\nint main(){'+body+'}';
const run=(code,input='',standard='17',extra={})=>call('/api/run',{code,input,standard,...extra});
const last=result=>result.steps.at(-1);
let passed=0;
async function test(name,action){await action();passed++;console.log('OK',name);}

try{
  await test('Interfaccia e motore condivisi senza riscritture',async()=>{
    const build=JSON.parse(await readFile(new URL('./dist/build-info.json',import.meta.url)));
    for(const name of ['app.js','flowchart-core.js','flowchart-editor.js','engine.py','roles.py','runtime.hpp'])
      assert.deepEqual(await readFile(new URL('../'+name,import.meta.url)),await readFile(new URL('./dist/'+build.assets+name,import.meta.url)));
  });
  await test('C++17: input e area',async()=>{
    const result=await run(program('int b,h;cout<<"Base: ";cin>>b;cout<<"Altezza: ";cin>>h;cout<<b*h;'),'4 6');
    assert.equal(result.error,'');assert.equal(last(result).console,'Base: 4\nAltezza: 6\n24');
  });
  for(const standard of ['17','20','23'])await test('Standard effettivo C++'+standard,async()=>{
    const result=await run(program("cout<<is_same_v<decltype(u8'a'),char>;"),'',standard);
    assert.equal(result.error,'');assert.equal(last(result).output,standard==='17'?'1':'0');
  });
  await test('Valore, riferimento, puntatore e array',async()=>{
    const result=await run(program('int x=4,y=6,v[2]={1,2};aggiorna(x,y,&x,v);cout<<x<<" "<<y<<" "<<v[1];','void aggiorna(int c,int &r,int *p,int v[]){c=99;r++;*p+=2;v[1]=8;}'));
    assert.equal(result.error,'');assert.equal(last(result).output,'6 7 8');
    assert.ok(result.steps.some(s=>s.variables.some(v=>v.origin?.kind==='reference')));
    assert.ok(result.steps.some(s=>s.lastCall?.name==='aggiorna'));
  });
  await test('Input manuali, correzione, prefisso traccia e richieste scadute',async()=>{
    let result=await run(program('int b,h;cin>>b>>h;cout<<b*h;'),'', '20',{manual:true});
    const id=result.session, prefix=result.steps;
    await assert.rejects(call('/api/input',{session:id,request:99,value:'4'}),/scaduta/);
    result=await call('/api/input',{session:id,request:last(result).inputRequest.number,value:'abc'});
    assert.equal(last(result).inputRequest.target,'b');assert.match(last(result).inputRequest.error,/non valido/);
    result=await call('/api/input',{session:id,request:last(result).inputRequest.number,value:'4'});
    assert.equal(last(result).inputRequest.target,'h');assert.deepEqual(result.steps.slice(0,prefix.length),prefix);
    result=await call('/api/input',{session:id,request:last(result).inputRequest.number,value:'6'});
    assert.equal(result.session,null);assert.equal(last(result).output,'24');
    await assert.rejects(call('/api/input',{session:id,value:'8'}),/scaduta/);
  });
  const expectedExamples=[
    'Dopo il passaggio per valore: 5 10\nDopo il passaggio per riferimento: 10 5\n',
    'Somma: 15\n2 4 6 8 10 ', 'Mario Rossi ha 17 anni.\n',
    'Locale: 100\nGlobale: 2\n', 'Fattoriale: 24\n', 'Numero: 11\nSecondo voto: 8\n'
  ];
  const examples=JSON.parse(await readFile(new URL('../examples.json',import.meta.url)));
  for(const [index,example] of examples.entries())await test('Esempio: '+example.title,async()=>{
    const result=await run(example.code,example.input);
    assert.equal(result.error,'');assert.ok(last(result).output.endsWith(expectedExamples[index]));
  });
  await test('Condizioni, short circuit e incremento valutato una volta',async()=>{
    const result=await run(program('int i=0,n=0;while(i++<3){if(i==2)continue;n+=i;}do{n--;}while(n>2);cout<<i<<":"<<n;'));
    assert.equal(result.error,'');assert.equal(last(result).output,'4:2');
    assert.ok(result.steps.some(s=>s.condition?.result===false));assert.ok(result.steps.some(s=>s.condition?.action==='continue'));
  });
  await test('UTF-8 e ruoli input/output',async()=>{
    const result=await run(program('int n;cin>>n;n++;cout<<"Età: "<<n;'),'17');
    assert.equal(last(result).output,'Età: 18');assert.ok(result.steps.some(s=>s.variables.some(v=>v.name==='n'&&v.role==='inout')));
  });
  for(const [name,body,message] of [
    ['variabile non inizializzata','int x;cout<<x;',/inizializzat/],
    ['cella non inizializzata','int v[2];v[0]=1;cout<<v[1];',/inizializzat/],
    ['indice negativo','int v[2]={1,2};int i=-1;cout<<v[i];',/indice/i],
    ['indice fuori array','int v[2]={1,2};int i=2;cout<<v[i];',/indice/i],
    ['nullptr','int *p=nullptr;cout<<*p;',/nullptr/],
    ['puntatore scaduto','int *p;{int n=4;p=&n;}cout<<*p;',/puntatore/i],
    ['divisione per zero','int z=0;cout<<7/z;',/WASM/],
    ['overflow intero','int n=2147483647;n++;cout<<n;',/WASM/],
    ['shift non valido','int s=32,a=1;cout<<(a<<s);',/WASM/],
    ['input esaurito','int n;cin>>n;',/Input/],
    ['limite di passi','int n=0;while(true){n++;}',/800/]
  ])await test('Errore controllato: '+name,async()=>{
    const result=await run(program(body));assert.match(result.error,message);assert.ok(result.steps.length<=801);
  });
  for(const [name,source] of [
    ['sintassi','int main(){int a=;}'],['new non supportato','int main(){int *p=new int;}'],
    ['header non ammesso','#include <fstream>\nint main(){}'],['codice troppo lungo','int main(){}'+' '.repeat(30001)]
  ])await test('Rifiuto: '+name,()=>assert.rejects(run(source)));
  await test('Standard non valido rifiutato',()=>assert.rejects(run('int main(){}','','20 -I/private'),/Standard/));
  await test('Input manuale, getline e riga vuota',async()=>{
    let result=await run(program('int n;string s;cin>>n;cin.ignore();getline(cin,s);cout<<n<<":"<<s;'),'', '23',{manual:true});
    const id=result.session;
    result=await call('/api/input',{session:id,request:last(result).inputRequest.number,value:'7'});
    assert.equal(last(result).inputRequest.target,'s');assert.equal(last(result).inputRequest.formatted,false);
    result=await call('/api/input',{session:id,request:last(result).inputRequest.number,value:''});
    assert.equal(last(result).output,'7:');assert.equal(result.session,null);
  });
  await test('Input manuale in funzione e array',async()=>{
    let result=await run(program('int v[2];for(int i=0;i<2;i++){leggi(v[i]);}cout<<v[0]+v[1];','void leggi(int &n){cin>>n;}'),'', '17',{manual:true});
    const id=result.session;
    for(const value of ['2','3'])result=await call('/api/input',{session:id,request:last(result).inputRequest.number,value});
    assert.equal(result.error,'');assert.equal(last(result).output,'5');
  });
  await test('Annullamento vecchio non cancella la nuova sessione',async()=>{
    const source=program('int n;cin>>n;cout<<n;');
    const first=await run(source,'','17',{manual:true}), second=await run(source,'','17',{manual:true});
    await call('/api/cancel',{session:first.session});
    const result=await call('/api/input',{session:second.session,request:last(second).inputRequest.number,value:'9'});
    assert.equal(last(result).output,'9');
    const pending=await run(source,'','17',{manual:true});await call('/api/cancel',{session:pending.session});
    await assert.rejects(call('/api/input',{session:pending.session,request:1,value:'1'}),/scaduta/);
  });
  await test('Conversione C++ → flowchart → C++ con DO-WHILE',async()=>{
    const source=program('int a=2,i=0;do{a+=i;i++;}while(i<3);cout<<a;');
    const {document}=await call('/api/import-flowchart',{code:source,standard:'20'});
    const generated=C.generate(document), result=await run(generated.code,'','20',{flow:generated.flow});
    assert.equal(result.error,'');assert.equal(last(result).output,'5');
  });
  await test('Flowchart: tipi espliciti e area',async()=>{
    const generated=C.generate(C.example());
    const resolved=await call('/api/flowchart-source',{code:generated.code,standard:'23'});
    assert.ok(!resolved.code.includes('std::decay_t'));assert.ok(!resolved.code.includes('return 0;'));
    const result=await run(resolved.code,'4 6','23',{flow:generated.flow});
    assert.equal(result.error,'');assert.equal(last(result).output,'Inserisci base: Inserisci altezza: Area: 24\n');
  });
  await test('Metadati flowchart non validi rifiutati',()=>assert.rejects(run('int main(){}','','17',{flow:{deferred:[{line:true}]}}),/Metadati|Dichiarazione/));
  console.log('WASM:',passed,'prove superate');
}finally{await worker.terminate();}

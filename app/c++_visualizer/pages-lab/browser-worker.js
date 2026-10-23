let tool, wasiLibrary, python, sysroot, header, loading, session, activeId;
const encoder=new TextEncoder(), decoder=new TextDecoder();
const waitingForInput=new Error('Attesa input');
const phase=text=>postMessage({phase:text,id:activeId});
async function textFile(name){const r=await fetch(new URL(name,import.meta.url));if(!r.ok)throw new Error('File non disponibile: '+name);return r.text();}
async function ready(){
  if(!loading)loading=(async()=>{
    phase('Caricamento del compilatore e del motore Python nel browser…');
    const [compiler,wasi,pyodide,root,runtime,sources]=await Promise.all([
      import('./vendor/browsercc/dist/index.js'),import('./vendor/wasi/dist/index.js'),
      import('./vendor/pyodide/pyodide.mjs'),
      fetch(new URL('./vendor/browsercc/dist/sysroot.tar',import.meta.url)).then(r=>{if(!r.ok)throw new Error('Librerie C++ non disponibili');return r.arrayBuffer();}),
      textFile('runtime.hpp'),Promise.all(['engine.py','roles.py','flowchart_import.py','browser_bridge.py'].map(async name=>[name,await textFile(name)]))
    ]);
    tool=compiler;wasiLibrary=wasi;sysroot=root;header=runtime;
    const pythonURL=new URL('./vendor/pyodide/',import.meta.url);
    python=await pyodide.loadPyodide({indexURL:pythonURL.protocol==='file:'?decodeURIComponent(pythonURL.pathname):pythonURL.href});
    for(const [name,source] of sources)python.FS.writeFile('/home/pyodide/'+name,source);
    python.runPython('import sys\nsys.path.insert(0,"/home/pyodide")\nfrom browser_bridge import browser_call, _asts');
  })();
  return loading;
}
async function ast(source,standard){
  phase('Analisi del codice con Clang '+standard+'…');
  let output='',errors='';
  const clang=await tool.Clang({thisProgram:'clang++',print:s=>{output+=s+'\n';},printErr:s=>{errors+=s+'\n';}});
  tool.setUpSysroot(clang,sysroot,{'lezione.cpp':source});
  const result=clang.callMain(['-std=c++'+standard,'-Wno-return-type','-pedantic-errors','-fno-color-diagnostics','-Xclang','-ast-dump=json','-Xclang','-ast-dump-filter=__cv_user','-fsyntax-only','lezione.cpp']);
  if(result!==0)throw new Error(errors||'Analisi C++ non riuscita.');
  return output;
}
async function callPython(operation,data,standard='17'){
  for(let attempts=0;attempts<5;attempts++){
    python.globals.set('_operation',operation);python.globals.set('_payload',JSON.stringify(data));
    const result=JSON.parse(python.runPython('browser_call(_operation, _payload)'));
    if(!Object.hasOwn(result,'parse'))return result;
    const tree=await ast(result.source,standard);
    python.globals.set('_cached_standard',standard);python.globals.set('_cached_code',result.parse);python.globals.set('_cached_ast',tree);
    python.runPython('import json\n_asts[(_cached_standard, _cached_code)] = json.loads(_cached_ast)');
  }
  throw new Error('Impossibile completare la deduzione dei tipi.');
}
async function execute(current){
  phase('Esecuzione nel browser…');
  const {WASI,File,OpenFile,PreopenDirectory,ConsoleStdout}=wasiLibrary;
  class InputFile extends OpenFile {
    fd_read(size){if(current.manual&&this.file_pos>=this.file.size)throw waitingForInput;return super.fd_read(size);}
  }
  const directory=new PreopenDirectory('.',new Map());let errors='',exitCode=0,waiting=false;
  const input=new InputFile(new File(encoder.encode(current.input)));
  const wasi=new WASI(['programma'],current.manual?['CPPVIZ_MANUAL_INPUT=1']:[],[
    input,new ConsoleStdout(()=>{}),new ConsoleStdout(bytes=>{errors+=decoder.decode(bytes);}),directory
  ],{debug:false});
  const instance=await WebAssembly.instantiate(current.module,{wasi_snapshot_preview1:wasi.wasiImport});
  try{exitCode=wasi.start(instance);}catch(error){if(error===waitingForInput)waiting=true;else{exitCode=1;errors=(error instanceof WebAssembly.RuntimeError?'Controllo WASM: operazione non valida o comportamento indefinito. ':'')+error.message;}}
  const file=directory.dir.contents.get('trace.jsonl');
  const result=await callPython('decorate',{trace:file?decoder.decode(file.data):'',exitCode,error:errors});
  current.pending=waiting?result.steps.at(-1)?.inputRequest:null;
  if(waiting&&!current.pending)throw new Error('Il programma si è fermato senza una richiesta di input valida.');
  phase(current.pending?'In attesa del valore nella console.':'Esecuzione completata nel browser.');
  return {...result,session:current.pending?current.id:null};
}
async function dispatch(path,data){
  await ready();
  const standard=data.standard??'17';
  if(!['17','20','23'].includes(standard))throw new Error('Standard non valido. Scegli C++17, C++20 o C++23.');
  if(['/api/run','/api/import-flowchart','/api/flowchart-source'].includes(path))python.runPython('_asts.clear()');
  if(path==='/api/import-flowchart'){const result=await callPython('import',data,standard);phase('Conversione in flowchart completata nel browser.');return result;}
  if(path==='/api/flowchart-source'){const result=await callPython('source',data,standard);phase('C++ generato nel browser.');return result;}
  if(path==='/api/cancel'){if(data.session===session?.id)session=null;return {cancelled:true};}
  if(path==='/api/input'){
    if(!session?.pending||data.session!==session.id||!Number.isInteger(data.request)||data.request!==session.pending.number)throw new Error('Richiesta di input scaduta. Riavvia il programma.');
    if(typeof data.value!=='string'||/[\r\n]/.test(data.value)||encoder.encode(data.value).length>2000||encoder.encode(session.input+data.value+'\n').length>10000)throw new Error('Inserisci un solo valore entro i limiti di input.');
    // shortcut: riproduzione deterministica con le risposte note; usare Asyncify prima di supportare effetti esterni o fonti non deterministiche.
    session.input+=data.value+'\n';return execute(session);
  }
  if(path!=='/api/run')throw new Error('Operazione non disponibile.');
  if(typeof data.input!=='string'||encoder.encode(data.input).length>10000)throw new Error('Input troppo lungo.');
  const instrumented=await callPython('instrument',data,standard);
  phase('Compilazione del programma osservato in C++'+standard+'…');
  const compiled=await tool.compile({source:instrumented.code,fileName:'osservato.cpp',flags:['-std=c++'+standard,'-O0','-g','-fno-exceptions','-pedantic-errors','-fno-color-diagnostics','-Werror=return-type','-fsanitize=undefined,bounds','-fsanitize-trap=all'],extraFiles:{'runtime.hpp':header}});
  if(!compiled.module)throw new Error(compiled.compileOutput||'Compilazione non riuscita.');
  session={id:crypto.randomUUID(),module:compiled.module,manual:data.manual===true,input:data.manual?'':data.input,pending:null};
  return execute(session);
}
let queue=Promise.resolve();
onmessage=event=>{const {id,path,data}=event.data;queue=queue.then(async()=>{
  activeId=id;
  try{postMessage({id,result:await dispatch(path,data)});}catch(error){phase('Operazione interrotta.');postMessage({id,error:String(error.message||error)});}
});};

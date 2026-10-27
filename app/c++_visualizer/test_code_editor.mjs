import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const source = await readFile(new URL("./code-editor.js",import.meta.url),"utf8");
const {validTabSize,cppHints,contextualHints,compilerErrors,setupCodeEditor} = await import("data:text/javascript;base64,"+Buffer.from(source).toString("base64"));
for (let size=1;size<=8;size++) assert.equal(validTabSize(String(size)),size);
for (const bad of [null,undefined,"",0,9,"NaN","2.5","4px","<script>"]) assert.equal(validTabSize(bad),4);
globalThis.CodeMirror = {resolveMode:()=>({keywords:{if:true,return:true,struct:true,const:true}})};
function completion(lines,cursor,tokenType=null) {
  return cppHints({getCursor:()=>cursor,getLine:n=>lines[n].map(t=>t.string).join(""),getTokenAt:()=>({type:tokenType}),
    firstLine:()=>0,lastLine:()=>lines.length-1,getLineTokens:n=>lines[n]});
}
const token=(string,start=0,type="variable")=>({string,start,type});
let result=completion([[token("int ",0,"type"),token("totale",4),token(";",10,"operator")],[token("to")]],{line:1,ch:2});
assert.ok(result.list.includes("totale"));
assert.deepEqual(result.from,{line:1,ch:0});
assert.deepEqual(result.to,{line:1,ch:2});
assert.ok(completion([[token("do")]],{line:0,ch:2}).list.includes("double"));
assert.ok(completion([[token("ret")]],{line:0,ch:3}).list.includes("return"));
assert.ok(completion([[token("struct ",0,"keyword"),token("Studente",7)],[token("Stu")]],{line:1,ch:3}).list.includes("Studente"));
result=completion([[token("totale")]],{line:0,ch:2});
assert.deepEqual(result.to,{line:0,ch:6});
assert.equal(completion([[token("totalmente",0,"comment")],[token("tot")]],{line:1,ch:3}).list.includes("totalmente"),false);
for (const type of ["comment","string","string-2","meta"]) assert.deepEqual(completion([[token("int")]],{line:0,ch:2},type).list,[]);
result=completion([[token("__privato")],[token("__")]],{line:1,ch:2});
assert.equal(result.list.includes("__privato"),false);
assert.equal(completion([[token("int")]],{line:0,ch:3}).list.includes("int"),false);

function hintEditor(code) {
  return {code,cursor:{line:0,ch:code.lastIndexOf('to') + 2},type:null,
    getValue(){return this.code;},getCursor(){return {...this.cursor};},getLine(n){return this.code.split('\n')[n];},
    getTokenAt(){return {type:this.type};},firstLine:()=>0,lastLine(){return this.code.split('\n').length - 1;},
    getLineTokens(n){return [...this.getLine(n).matchAll(/[A-Za-z_]\w*|\W+/g)].map(m=>token(m[0],m.index));},
    indexFromPos(pos){return this.code.split('\n').slice(0,pos.line).reduce((sum,line)=>sum + line.length + 1,0) + pos.ch;}};
}
const hinted = hintEditor('int totale; int main(){ to }'), requests = [];
let standard='17';
const semantic = contextualHints(async data => {requests.push(data);return {items:[{text:'totale',displayText:'int totale'},{text:'parametro',displayText:'int parametro'}]};},()=>standard);
result = await semantic(hinted);
assert.deepEqual(result.list,[{text:'totale',displayText:'int totale'}]);
assert.equal(requests[0].column,hinted.cursor.ch - 1);
hinted.code=hinted.code.replace(' to }',' tot }');hinted.cursor.ch++;
assert.equal((await semantic(hinted)).list[0].text,'totale');assert.equal(requests.length,1);
standard='23';await semantic(hinted);assert.equal(requests.length,2);assert.equal(requests[1].standard,'23');
hinted.type='comment';assert.deepEqual((await semantic(hinted)).list,[]);assert.equal(requests.length,2);hinted.type=null;
const unavailable = contextualHints(async()=>{throw new Error('offline');},()=>standard);
assert.ok((await unavailable(hinted)).list.includes('totale'));
assert.deepEqual((await contextualHints(async()=>({items:[]}),()=>standard)(hinted)).list,[]);
const utfHints = hintEditor('int main(){const char*s="Età 😀"; to}');
await semantic(utfHints);
assert.equal(requests.at(-1).column,new TextEncoder().encode(utfHints.code.slice(0,utfHints.cursor.ch - 2)).length + 1);
let release;
const delayedRequests=[], delayed = contextualHints(data=>{delayedRequests.push(data);return new Promise(resolve=>{release=resolve;});},()=>standard);
const changing = hintEditor('int main(){ to }'), firstHints = delayed(changing);
changing.code='int main(){int totale; to }';changing.cursor.ch=changing.code.lastIndexOf('to')+2;
const latestHints=delayed(changing);
assert.equal(delayedRequests.length,1);
release({items:[{text:'troppoVecchio'}]});assert.deepEqual((await firstHints).list,[]);
await new Promise(setImmediate);assert.equal(delayedRequests.length,2);
release({items:[{text:'totale'}]});assert.deepEqual((await latestHints).list,[{text:'totale'}]);

assert.deepEqual(compilerErrors('Riga 2:5: error: undeclared identifier\nRiga 1:1: note: here\nRiga 1:2: warning: unused variable','int x;\n    y;'),
  [{line:1,ch:4,message:'undeclared identifier',atEnd:false}]);
assert.equal(compilerErrors('engine.CodeError: Riga 1: costrutto non supportato','new int;')[0].message,'costrutto non supportato');
assert.equal(compilerErrors('Riga 1:1: fatal error: header missing','int x;').length,1);
assert.equal(compilerErrors('Riga 1:1: error: x\nRiga 1:1: error: x','x').length,1);
assert.deepEqual(compilerErrors('Server non raggiungibile\nRiga 0: error: x\nRiga 999: error: x','x'),[]);
const unicode='std::cout << "Età 😀" << errore;';
const column=new TextEncoder().encode(unicode.slice(0,unicode.indexOf('errore'))).length+1;
assert.equal(compilerErrors(`Riga 1:${column}: error: unknown name`,unicode)[0].ch,unicode.indexOf('errore'));
assert.deepEqual(compilerErrors("Riga 4:1: error: expected '}'",'int main(){\n'),
  [{line:1,ch:0,message:"expected '}'",atEnd:true}]);

// Il ponte col programma sincronizza il sorgente e conserva la cronologia durante la digitazione.
const editor=new EventTarget(), choice=new EventTarget(), listeners=new Map(), options={}, styles=new Map();
let text="int x;", inputs=0, historyCleared=0, saved="2";
const wrapper={hidden:false,clientWidth:800},gutter={},input={setAttribute(){}};
const marks=[],widgets=[],lineClasses=new Set(),gutterMarks=new Map();
const createElement=()=>({children:[],setAttribute(){},append(child){this.children.push(child);}});
Object.assign(editor,{value:text,hidden:false,placeholder:"Codice",ownerDocument:{createElement},parentElement:{querySelector:()=>gutter,style:{setProperty:(k,v)=>styles.set(k,String(v))}}});
const cm={state:{},on:(name,fn)=>listeners.set(name,fn),getWrapperElement:()=>wrapper,getInputField:()=>input,
  getValue:()=>text,setValue(value){text=value;listeners.get("change")?.();},clearHistory(){historyCleared++;},
  save(){editor.value=text;},setOption:(k,v)=>options[k]=v,closeHint(){},refresh(){},focus(){},
  somethingSelected:()=>false,replaceSelection(value){text+=value;listeners.get("change")();},
  operation:fn=>fn(),getLine:n=>text.split('\n')[n],getTokenAt:()=>({end:5}),
  markText(from,to,options){const mark={from,to,options,clear(){this.cleared=true;}};marks.push(mark);return mark;},
  addLineClass(line){lineClasses.add(line);return line;},removeLineClass(line){lineClasses.delete(line);},
  addLineWidget(line,node){const widget={line,node,clear(){this.cleared=true;}};widgets.push(widget);return widget;},
  setGutterMarker:(line,id,node)=>gutterMarks.set(line,node),clearGutter:()=>gutterMarks.clear(),scrollIntoView(){}};
globalThis.CodeMirror.fromTextArea=(textarea,config)=>{Object.assign(options,config);return cm;};
globalThis.ResizeObserver=class{observe(){}};
editor.addEventListener("input",()=>inputs++);
const controller=setupCodeEditor(editor,choice,{get:()=>saved,set:(key,value)=>{assert.equal(key,"tab-size");saved=value;}});
assert.equal(choice.value,"2");
assert.equal(options.indentUnit,2);
assert.equal(options.autoCloseBrackets,true);
options.extraKeys.Tab(cm);
assert.equal(editor.value,"int x;  ");assert.equal(inputs,1);
controller.sync();assert.equal(historyCleared,0);
editor.value="int y;";controller.sync();
assert.equal(text,"int y;");assert.equal(inputs,1);assert.equal(historyCleared,1);
choice.value="8";choice.dispatchEvent(new Event("change"));
assert.equal(saved,"8");assert.equal(options.indentUnit,8);assert.equal(editor.value,"int y;");
options.extraKeys.Tab(cm);assert.equal(editor.value,"int y;"+" ".repeat(8));
editor.hidden=true;controller.sync();assert.equal(wrapper.hidden,true);assert.equal(gutter.hidden,false);
editor.hidden=false;controller.sync();assert.equal(wrapper.hidden,false);assert.equal(gutter.hidden,true);
options.extraKeys.Esc();const tab={key:"Tab"};listeners.get("keydown")(cm,tab);assert.equal(tab.codemirrorIgnore,true);
const nextTab={key:"Tab"};listeners.get("keydown")(cm,nextTab);assert.equal(nextTab.codemirrorIgnore,undefined);
controller.showDiagnostics('Riga 1:5: error: unknown variable\nRiga 1:5: error: second error');
assert.equal(widgets.length,1);assert.equal(widgets[0].node.children.length,2);
assert.equal(gutterMarks.size,1);assert.equal(lineClasses.size,1);assert.equal(marks[0].from.ch,4);
assert.equal(inputs,2);
controller.clearDiagnostics();
assert.equal(widgets[0].cleared,true);assert.equal(marks[0].cleared,true);assert.equal(gutterMarks.size,0);assert.equal(lineClasses.size,0);
controller.showDiagnostics('Riga 1:1: error: <img src=x onerror=alert(1)>');
assert.equal(widgets.at(-1).node.children[0].textContent,'Errore: <img src=x onerror=alert(1)>');
options.extraKeys.Tab(cm);
assert.equal(widgets.at(-1).cleared,true);
controller.showDiagnostics('Riga 1:1: error: stale');editor.value='int z;';controller.sync();
assert.equal(widgets.at(-1).cleared,true);
console.log("Editor: completamenti C++, filtri, intervalli, sorgente condiviso, cronologia, Tab e vista esecuzione verificati.");

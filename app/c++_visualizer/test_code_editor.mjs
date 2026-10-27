import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const source = await readFile(new URL("./code-editor.js",import.meta.url),"utf8");
const {validTabSize,cppHints,setupCodeEditor} = await import("data:text/javascript;base64,"+Buffer.from(source).toString("base64"));
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
for (const type of ["comment","string","string-2"]) assert.deepEqual(completion([[token("int")]],{line:0,ch:2},type).list,[]);
result=completion([[token("__privato")],[token("__")]],{line:1,ch:2});
assert.equal(result.list.includes("__privato"),false);
assert.equal(completion([[token("int")]],{line:0,ch:3}).list.includes("int"),false);

// Il ponte col programma sincronizza il sorgente e conserva la cronologia durante la digitazione.
const editor=new EventTarget(), choice=new EventTarget(), listeners=new Map(), options={}, styles=new Map();
let text="int x;", inputs=0, historyCleared=0, saved="2";
const wrapper={hidden:false,clientWidth:800},gutter={},input={setAttribute(){}};
Object.assign(editor,{value:text,hidden:false,placeholder:"Codice",parentElement:{querySelector:()=>gutter,style:{setProperty:(k,v)=>styles.set(k,String(v))}}});
const cm={state:{},on:(name,fn)=>listeners.set(name,fn),getWrapperElement:()=>wrapper,getInputField:()=>input,
  getValue:()=>text,setValue(value){text=value;listeners.get("change")?.();},clearHistory(){historyCleared++;},
  save(){editor.value=text;},setOption:(k,v)=>options[k]=v,closeHint(){},refresh(){},focus(){},
  somethingSelected:()=>false,replaceSelection(value){text+=value;listeners.get("change")();}};
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
console.log("Editor: completamenti C++, filtri, intervalli, sorgente condiviso, cronologia, Tab e vista esecuzione verificati.");

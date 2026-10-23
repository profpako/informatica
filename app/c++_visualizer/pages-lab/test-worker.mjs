// Esegue lo stesso Worker distribuito al browser; adatta solo lettura file e messaggi a Node.
import {parentPort} from 'node:worker_threads';
import {readFile} from 'node:fs/promises';
const networkFetch=globalThis.fetch;
globalThis.fetch=async(input,options)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
  if(url.protocol!=='file:')return networkFetch(input,options);
  return new Response(await readFile(url),{headers:{'Content-Type':url.pathname.endsWith('.wasm')?'application/wasm':'application/octet-stream'}});
};
globalThis.postMessage=message=>parentPort.postMessage(message);
globalThis.onmessage=null;
const build=JSON.parse(await readFile(new URL('./dist/build-info.json',import.meta.url)));
await import(new URL('./dist/'+build.assets+'browser-worker.js',import.meta.url));
parentPort.on('message',data=>globalThis.onmessage({data}));
parentPort.postMessage({ready:true});

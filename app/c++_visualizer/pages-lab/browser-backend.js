let worker,sequence=0;
const pending=new Map();
const status=text=>{const target=document.getElementById('lab-status');if(target)target.textContent=text;};
function stop(reason){worker?.terminate();worker=null;for(const task of pending.values()){clearTimeout(task.timer);task.reject(new Error(reason));}pending.clear();status(reason);}
function request(path,data){
  if(!worker){
    worker=new Worker(new URL('./browser-worker.js',import.meta.url),{type:'module'});
    worker.onmessage=({data:message})=>{
      if(message.phase){status(message.phase);if(message.phase==='Esecuzione nel browser…')for(const task of pending.values()){clearTimeout(task.timer);task.timer=setTimeout(()=>stop('Tempo massimo di esecuzione superato. Controlla i cicli.'),10000);}return;}
      const task=pending.get(message.id);if(!task)return;pending.delete(message.id);clearTimeout(task.timer);
      if(message.error)task.reject(new Error(message.error));else task.resolve(message.result);
    };
    worker.onerror=()=>stop('Il motore WASM si è interrotto. Riprova con un programma più breve.');
  }
  return new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject,timer:setTimeout(()=>stop('Caricamento o compilazione troppo lungo. Controlla la connessione e riprova.'),120000)});worker.postMessage({id,path,data});});
}
export async function browserRequest(path,options={}){
  try{
    if(path==='/api/config'){
      const response=await fetch(new URL('./examples.json',import.meta.url));if(!response.ok)throw new Error('Esempi non disponibili.');
      return Response.json({token:'browser-local',examples:await response.json()});
    }
    const data=JSON.parse(options.body||'{}');data.standard=document.getElementById('lab-standard')?.value||'17';
    return Response.json(await request(path,data));
  }catch(error){return Response.json({error:error.message},{status:400});}
}

'use strict';
const FlowchartEditor = (() => {
  const C = FlowchartCore;
  const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const svg = (tag, attributes = {}) => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    return node;
  };
  return class {
    constructor(root, options) {
      this.root = root; this.options = options; this.document = C.blank();
      this.fnId = 'main'; this.selected = null; this.running = false; this.history = []; this.traceState = null;
      let restoreError = '';
      if (options.saved) {
        try { this.document = C.validate(JSON.parse(options.saved)); }
        catch { restoreError = 'Il diagramma salvato non è leggibile. Apri un file valido oppure scegli Nuovo diagramma.'; }
      }
      this.build(); this.render(); if (restoreError) this.message(restoreError, true);
    }
    button(text, action, parent, className) {
      const button = el('button', text, className); button.type = 'button';
      button.addEventListener('click', action); parent.append(button); return button;
    }
    select(options, label) {
      const select = el('select'); select.setAttribute('aria-label', label);
      for (const [value, text] of options) { const option = el('option', text); option.value = value; select.append(option); }
      return select;
    }
    build() {
      const toolbar = el('div', undefined, 'flow-toolbar');
      this.fnSelect = this.select([], 'Diagramma della subroutine');
      this.fnSelect.addEventListener('change', () => { this.fnId = this.fnSelect.value; this.selected = null; this.render(); });
      const diagramLabel = el('label', 'Diagramma '); diagramLabel.append(this.fnSelect); toolbar.append(diagramLabel);
      this.addFunction = this.button('Nuova subroutine', () => this.mutate(() => {
        let index = 1; while (this.document.functions.some(fn => fn.name === 'procedura' + index)) index++;
        const fn = { id: C.id(), name: 'procedura' + index, returnType: 'void', params: [], body: [] };
        this.document.functions.push(fn); this.fnId = fn.id; this.selected = null;
      }, true), toolbar);
      this.edit = this.button('Modifica diagramma', () => this.options.onEdit(), toolbar); this.edit.hidden = true;
      this.root.append(toolbar);
      const files = el('div', undefined, 'flow-files');
      this.newButton = this.button('Nuovo diagramma', () => this.replace(C.blank()), files);
      this.exampleButton = this.button('Esempio area', () => this.replace(C.example()), files);
      this.undoButton = this.button('Annulla', () => this.undo(), files);
      this.file = el('input'); this.file.type = 'file'; this.file.accept = '.json,application/json'; this.file.hidden = true;
      this.file.addEventListener('change', async () => {
        const file = this.file.files[0]; if (!file) return;
        try {
          if (file.size > 250000) throw new Error('File troppo grande: massimo 250 KB.');
          const doc = C.validate(JSON.parse(await file.text())); this.replace(doc);
        } catch (error) { this.message('Apertura non riuscita: ' + error.message, true); }
        this.file.value = '';
      });
      this.openButton = this.button('Apri diagramma', () => this.file.click(), files);
      this.button('Salva diagramma', () => this.download(JSON.stringify(this.document, null, 2), 'lezione.flow.json', 'application/json'), files);
      files.append(this.file); this.root.append(files);
      this.functionProps = el('details', undefined, 'flow-function-props'); this.functionProps.append(el('summary', 'Parametri e risultato della subroutine'));
      this.functionForm = el('div'); this.functionProps.append(this.functionForm); this.root.append(this.functionProps);
      this.status = el('p', '', 'flow-status'); this.status.setAttribute('role', 'status'); this.root.append(this.status);
      this.canvas = el('div', undefined, 'flow-canvas'); this.canvas.tabIndex = 0;
      this.canvas.setAttribute('aria-label', 'Diagramma di flusso: seleziona un blocco per modificarlo'); this.root.append(this.canvas);
      this.inspector = el('div', undefined, 'flow-inspector'); this.root.append(this.inspector);
      const palette = el('div', undefined, 'flow-palette');
      this.kindSelect = this.select(Object.entries(C.kinds), 'Tipo di blocco da aggiungere');
      this.insertion = this.select([], 'Posizione del nuovo blocco');
      const typeLabel = el('label', 'Nuovo blocco '); typeLabel.append(this.kindSelect);
      const whereLabel = el('label', 'Inserisci '); whereLabel.append(this.insertion);
      palette.append(typeLabel, whereLabel);
      this.addButton = this.button('Aggiungi blocco', () => this.addNode(), palette, 'flow-add'); this.root.append(palette);
      const preview = el('details', undefined, 'flow-preview'); preview.append(el('summary', 'C++ generato'));
      this.source = el('pre'); this.source.tabIndex = 0; this.source.setAttribute('aria-label', 'Sorgente C++ generato dal diagramma'); preview.append(this.source);
      this.button('Scarica C++ generato', () => { try { this.download(this.getSource().code, 'lezione.cpp', 'text/plain'); } catch {} }, preview);
      this.root.append(preview);
    }
    download(text, filename, type) {
      const link = el('a'); link.href = URL.createObjectURL(new Blob([text], { type: type + ';charset=utf-8' }));
      link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }
    message(text, error = false) { this.status.textContent = text; this.status.classList.toggle('flow-error', error); }
    mutate(action, openProperties = false) {
      if (this.running) return;
      const previous = JSON.stringify(this.document);
      try { action(); C.validate(this.document); }
      catch (error) { this.document = JSON.parse(previous); this.message(error.message, true); return; }
      this.history.push(previous); if (this.history.length > 30) this.history.shift();
      this.options.onChange(JSON.stringify(this.document)); this.render();
      if (openProperties) this.functionProps.open = true;
    }
    replace(doc) { this.mutate(() => { this.document = doc; this.fnId = 'main'; this.selected = null; }); }
    undo() {
      if (this.running || !this.history.length) return;
      this.document = JSON.parse(this.history.pop()); this.selected = null;
      if (!this.document.functions.some(fn => fn.id === this.fnId)) this.fnId = 'main';
      this.options.onChange(JSON.stringify(this.document)); this.render();
    }
    getSource() {
      try { return C.generate(this.document); }
      catch (error) {
        this.message(error.message, true);
        const location = C.locate(this.document, error.node);
        if (location) { this.fnId = location.fn.id; this.selected = location.node.id; this.render(); }
        else if (this.document.functions.some(fn => fn.id === error.node)) { this.fnId = error.node; this.render(); this.functionProps.open = true; }
        throw error;
      }
    }
    setRunning(enabled) { if (this.running !== enabled) { this.running = enabled; this.render(); } }
    clearTrace() { this.traceState = null; this.paintTrace(); }
    field(parent, caption, value, apply, options = null, hint = '') {
      const label = el('label', caption, 'flow-field');
      const input = options ? this.select(options, caption) : el('input');
      input.setAttribute('aria-label', caption);
      if (!options) input.type = 'text'; input.value = value ?? ''; input.disabled = this.running;
      input.addEventListener('change', () => this.mutate(() => apply(input.value)));
      label.append(input);
      if (hint) {
        const description = el('small', hint); description.id = C.id();
        input.setAttribute('aria-describedby', description.id); label.append(description);
      }
      parent.append(label); return input;
    }
    render() {
      const fn = this.document.functions.find(f => f.id === this.fnId) || this.document.functions[0]; this.fnId = fn.id;
      const found = C.locate(this.document, this.selected);
      if (found?.fn.id !== fn.id) this.selected = null;
      this.fnSelect.replaceChildren(...this.document.functions.map(f => { const option = el('option', f.name + '()'); option.value = f.id; return option; }));
      this.fnSelect.value = fn.id;
      this.edit.hidden = !this.running;
      for (const control of [this.newButton,this.exampleButton,this.openButton,this.addFunction,this.kindSelect,this.insertion,this.addButton]) control.disabled = this.running;
      this.undoButton.disabled = this.running || !this.history.length;
      this.renderFunction(fn); this.renderInspector(fn); this.renderGraph(); this.preview();
    }
    preview() {
      try {
        this.generated = C.generate(this.document); this.source.textContent = this.generated.code;
        this.message(this.running ? 'Esecuzione registrata: usa i passi per seguire i blocchi.' : 'Seleziona un blocco oppure aggiungine uno. I collegamenti sono automatici.');
      } catch (error) { this.generated = null; this.source.textContent = error.message; this.message(error.message, true); }
    }
    renderFunction(fn) {
      this.functionForm.replaceChildren();
      if (fn.id === 'main') { this.functionForm.append(el('p', 'main è il punto di ingresso: int main(), senza parametri.')); return; }
      const fields = el('div', undefined, 'flow-field-grid');
      this.field(fields, 'Nome subroutine', fn.name, value => { fn.name = value; });
      this.field(fields, 'Tipo restituito', fn.returnType, value => { fn.returnType = value; }, [['void','void · procedura'],...C.types.map(t=>[t,t])]);
      this.functionForm.append(fields, el('h4','Parametri, nell’ordine della chiamata'));
      fn.params.forEach((param, index) => {
        const row = el('div', undefined, 'flow-param');
        this.field(row, `Tipo parametro ${index+1}`, param.type, value => { param.type = value; }, C.types.map(t=>[t,t]));
        this.field(row, `Nome parametro ${index+1}`, param.name, value => { param.name = value; });
        this.field(row, `Passaggio parametro ${index+1}`, param.mode, value => { param.mode = value; },
          [['value','Per valore'],['reference','Riferimento &'],['pointer','Puntatore *'],['array','Array []']]);
        const remove = this.button('Rimuovi', () => this.mutate(() => fn.params.splice(index,1)), row); remove.disabled = this.running;
        this.functionForm.append(row);
      });
      const controls = el('div', undefined, 'flow-files');
      const add = this.button('Aggiungi parametro', () => this.mutate(() => fn.params.push({name:'',type:'int',mode:'value'})), controls);
      add.disabled = this.running || fn.params.length >= 12;
      const remove = this.button('Elimina subroutine', () => {
        const used = this.document.functions.some(f => {
          const check = list => list.some(n => n.kind==='call'&&n.callee===fn.id || ['then','else','body'].some(key=>Array.isArray(n[key])&&check(n[key])));
          return check(f.body);
        });
        if (used) return this.message('Rimuovi prima i blocchi che chiamano questa subroutine.',true);
        this.mutate(() => { this.document.functions = this.document.functions.filter(f=>f.id!==fn.id); this.fnId='main'; this.selected=null; });
      }, controls); remove.disabled = this.running;
      this.functionForm.append(controls);
    }
    renderInspector(fn) {
      this.inspector.replaceChildren();
      const found = C.locate(this.document,this.selected), node = found?.node;
      const positions = [['end','Alla fine del diagramma']];
      if (node) {
        positions.unshift(['after','Dopo il blocco selezionato']);
        if (node.kind === 'if') positions.push(['then','Nel ramo Vero'],['else','Nel ramo Falso']);
        if (Array.isArray(node.body)) positions.push(['body','Nel corpo del ciclo']);
      }
      this.insertion.replaceChildren(...positions.map(([value,text])=>{const option=el('option',text);option.value=value;return option;}));
      if (!node) { this.inspector.append(el('p',this.running?'Seleziona un blocco per consultarne i campi.':'Il diagramma parte da Inizio. Aggiungi il primo blocco usando i comandi qui sotto.')); return; }
      this.inspector.append(el('h3',C.kinds[node.kind]));
      const fields = el('div',undefined,'flow-field-grid');
      const field = (caption,key,options=null,hint='') => this.field(fields,caption,node[key],value=>{node[key]=value;},options,hint);
      if(node.kind==='declare') {
        field('Tipo','type',C.types.map(t=>[t,t])); field('Nome variabile','name');
        field('Forma','mode',[['value','Variabile / array'],['pointer','Puntatore *'],['reference','Riferimento &']]);
        field('Dimensione array (facoltativa)','size',null,'Esempio: 5 oppure N costante.');
        field('Valore iniziale (facoltativo)','init',null,'Array: valori separati da virgole, senza parentesi graffe.');
        this.field(fields,'Costante',String(node.constant),value=>{node.constant=value==='true';},[['false','No'],['true','Sì · const']]);
      } else if(node.kind==='input') {
        field('Destinazione input','target',null,'Una variabile o una cella, per esempio base o v[i].'); field('Domanda nella console (facoltativa)','prompt');
      } else if(node.kind==='output') field('Espressione da mostrare','expression',null,'Esempio: "Area: " << area');
      else if(node.kind==='assign') field('Elaborazione','expression',null,'Esempio: area = base * altezza oppure i++.');
      else if(['if','while','for','do'].includes(node.kind)) {
        if(node.kind==='for') field('Inizializzazione','init',null,'Esempio: int i = 0');
        field('Condizione','condition',null,'Esempio: i < 3 oppure numero > 0');
        if(node.kind==='for') field('Aggiornamento','update',null,'Esempio: i++');
        this.inspector.append(el('p',node.kind==='if'?'Seleziona Inserisci nel ramo Vero o Falso per aggiungere i blocchi dei due percorsi.':'Seleziona Inserisci nel corpo del ciclo per aggiungere le istruzioni da ripetere.','flow-hint'));
      } else if(node.kind==='call') {
        field('Subroutine chiamata','callee',[['','Scegli una subroutine'],...this.document.functions.filter(f=>f.id!=='main').map(f=>[f.id,f.name+'()'])]);
        field('Argomenti','args',null,'Nell’ordine dei parametri; per un indirizzo usa &nome.');
        field('Destinazione risultato (facoltativa)','result',null,'Lascia vuoto per una procedura void.');
      } else if(node.kind==='return') field('Valore restituito','expression',null,'Per una procedura void lascia vuoto.');
      else this.inspector.append(el('p',node.kind==='break'?'Termina il ciclo che contiene questo blocco.':'Passa al prossimo controllo del ciclo, eseguendo prima l’aggiornamento se è un for.'));
      this.inspector.append(fields);
      const actions = el('div',undefined,'flow-files');
      for(const [text,delta] of [['Sposta su',-1],['Sposta giù',1]]) {
        const button=this.button(text,()=>this.mutate(()=>{const target=found.index+delta;[found.list[found.index],found.list[target]]=[found.list[target],found.list[found.index]];}),actions);
        button.disabled=this.running||found.index+delta<0||found.index+delta>=found.list.length;
      }
      const remove=this.button('Elimina blocco',()=>this.mutate(()=>{found.list.splice(found.index,1);this.selected=null;}),actions);remove.disabled=this.running;
      this.inspector.append(actions);
    }
    addNode() {
      this.mutate(()=>{
        const fn=this.document.functions.find(f=>f.id===this.fnId), found=C.locate(this.document,this.selected), where=this.insertion.value;
        const node=C.newNode(this.kindSelect.value);
        if(node.kind==='call') node.callee=this.document.functions.find(f=>f.id!=='main')?.id||'';
        if(where==='after'&&found) found.list.splice(found.index+1,0,node);
        else if(['then','else','body'].includes(where)&&found&&Array.isArray(found.node[where])) found.node[where].push(node);
        else fn.body.push(node);
        this.selected=node.id;
      });
      this.inspector.querySelector('input:not(:disabled),select:not(:disabled)')?.focus({preventScroll:true});
    }
    renderGraph() {
      const scroll=[this.canvas.scrollLeft,this.canvas.scrollTop]; this.canvas.replaceChildren();
      let graph;
      try { graph=C.layout(this.document,this.fnId); } catch(error) { this.canvas.append(el('p',error.message)); return; }
      const scale=document.body.classList.contains('large')?1.2:1;
      const drawing=svg('svg',{viewBox:`0 0 ${graph.width} ${graph.height}`,width:graph.width*scale,height:graph.height*scale,role:'group','aria-label':'Flowchart di '+this.document.functions.find(f=>f.id===this.fnId).name});
      const defs=svg('defs'); const marker=svg('marker',{id:'flow-arrow',viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:7,markerHeight:7,orient:'auto-start-reverse'});
      marker.append(svg('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:'#60738c'}));defs.append(marker);drawing.append(defs);
      for(const edge of graph.edges) {
        const group=svg('g',{'class':'flow-edge','data-from':edge.from,'data-to':edge.to});
        if(edge.owner)group.dataset.owner=edge.owner;if(edge.outcome)group.dataset.outcome=edge.outcome;
        const path=svg('path',{d:edge.points.map(([x,y],i)=>(i?'L':'M')+x+' '+y).join(' '),'marker-end':'url(#flow-arrow)'});group.append(path);
        if(edge.text){const [x,y]=edge.points[Math.min(1,edge.points.length-1)];const text=svg('text',{x:x+7,y:y-8});text.textContent=edge.text.length>35?edge.text.slice(0,32)+'…':edge.text;group.append(text);}
        drawing.append(group);
      }
      for(const node of graph.nodes) {
        const group=svg('g',{transform:`translate(${node.x} ${node.y})`,'class':'flow-node '+node.shape,'data-node':node.id,'data-owner':node.owner});
        const title=svg('title');title.textContent=node.text;group.append(title);
        let shape;
        if(node.shape==='decision')shape=svg('polygon',{points:'0,0 120,45 0,90 -120,45'});
        else if(node.shape==='io')shape=svg('polygon',{points:'-102,0 120,0 102,62 -120,62'});
        else if(node.shape==='join')shape=svg('circle',{cx:0,cy:6,r:6});
        else shape=svg('rect',{x:-node.width/2,y:0,width:node.width,height:node.height,rx:node.shape==='terminal'?22:3});
        group.append(shape);
        if(node.shape==='call'){group.append(svg('path',{d:'M -108 0 L -108 62 M 108 0 L 108 62','class':'call-bars'}));}
        const width=node.shape==='decision'?20:28, words=node.text.match(new RegExp('.{1,'+width+'}(?:\\s|$)|.{1,'+width+'}','g'))||[''];
        const lines=words.slice(0,3);if(words.length>3)lines[2]=lines[2].slice(0,width-1)+'…';
        if(node.shape!=='join') {
          const text=svg('text',{'text-anchor':'middle',y:node.height/2-(lines.length-1)*8+4});
          lines.forEach((line,index)=>{const span=svg('tspan',{x:0,dy:index?16:0});span.textContent=line.trim();text.append(span);});group.append(text);
        }
        if(C.locate(this.document,node.owner)) {
          group.setAttribute('role','button');group.setAttribute('tabindex','0');group.setAttribute('aria-label',C.kinds[C.locate(this.document,node.owner).node.kind]+': '+node.text);
          const select=()=>{this.selected=node.owner;this.renderInspector(this.document.functions.find(f=>f.id===this.fnId));this.renderGraph();};
          group.addEventListener('click',select);group.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();select();this.canvas.querySelector(`[data-node="${node.id}"]`)?.focus({preventScroll:true});}});
        }
        if(node.owner===this.selected)group.classList.add('flow-selected');drawing.append(group);
      }
      this.canvas.append(drawing);this.canvas.scrollLeft=scroll[0];this.canvas.scrollTop=scroll[1];this.paintTrace();
    }
    showTrace(trace,index,showConditions) {
      if(!this.generated||!trace.length)return this.clearTrace();
      const step=trace[index], current=step.frames.at(-1);let point=this.generated.lineMap[step.line];
      if(step.event==='fine')point={fn:'main',node:'main:end'};
      else if(step.event==='ritorno implicito'&&point)point={...point,node:point.fn+':end'};
      else if(step.event.startsWith('uscita da ')) {
        if(!current)point={fn:'main',node:'main:end'};
        else for(let i=index-1;i>=0;i--){const candidate=this.generated.lineMap[trace[i].line];if(trace[i].frames.at(-1)?.id===current.id&&candidate?.functionName===current.name){point=candidate;break;}}
      }
      if(!point)return this.clearTrace();
      const previous=trace[index-1];
      const condition=showConditions?(step.condition||(!step.error&&step.event==='prima'&&previous?.condition?.frame===current?.id?previous.condition:null)):null;
      this.traceState={point,condition};
      if(this.fnId!==point.fn){this.fnId=point.fn;this.selected=null;this.render();}else this.paintTrace();
      const target=this.canvas.querySelector(`[data-node="${point.node}"]`);
      if(target){const box=target.getBBox(), svg_=target.ownerSVGElement;const scale=svg_.getBoundingClientRect().width/svg_.viewBox.baseVal.width;const top=(Number(target.getAttribute('transform').split(' ')[1]?.replace(')',''))||0)*scale;
        if(top<this.canvas.scrollTop||top+box.height*scale>this.canvas.scrollTop+this.canvas.clientHeight)this.canvas.scrollTop=Math.max(0,top-this.canvas.clientHeight/3);}
    }
    paintTrace() {
      this.canvas.querySelectorAll('.flow-active,.flow-true,.flow-false,.flow-chosen').forEach(node=>node.classList.remove('flow-active','flow-true','flow-false','flow-chosen'));
      if(!this.traceState)return;
      const {point,condition}=this.traceState;
      this.canvas.querySelector(`[data-node="${point.node}"]`)?.classList.add('flow-active');
      const conditionPoint=condition&&this.generated?.lineMap[condition.line];
      if(conditionPoint?.fn===this.fnId&&condition.action==='test') {
        this.canvas.querySelector(`[data-node="${conditionPoint.node}"]`)?.classList.add(condition.result?'flow-true':'flow-false');
        this.canvas.querySelectorAll('.flow-edge').forEach(edge=>{if(edge.dataset.owner===conditionPoint.node&&edge.dataset.outcome===String(condition.result))edge.classList.add('flow-chosen',condition.result?'flow-true':'flow-false');});
      }
    }
  };
})();

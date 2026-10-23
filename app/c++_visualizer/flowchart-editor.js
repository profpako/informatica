'use strict';
const FlowchartEditor = (() => {
  const C = FlowchartCore;
  const menuLabels = {...C.kinds, for:'Ciclo FOR', while:'Ciclo WHILE', do:'Ciclo DO-WHILE'};
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
  function contour(shape, width, height) {
    const half = width / 2;
    if (shape === 'decision') return svg('polygon', {points:`0,0 ${half},${height/2} 0,${height} ${-half},${height/2}`});
    if (shape === 'for') {
      const bevel = Math.min(28, width / 7);
      return svg('polygon', {points:`${-half+bevel},0 ${half-bevel},0 ${half},${height/2} ${half-bevel},${height} ${-half+bevel},${height} ${-half},${height/2}`});
    }
    if (shape === 'io') return svg('polygon',{points:`${-half+width*.075},0 ${half},0 ${half-width*.075},${height} ${-half},${height}`});
    if (shape === 'join') return svg('path',{d:`M 0 0 V ${height}`,class:'flow-join-line'});
    return svg('rect',{x:-half,y:0,width,height,rx:shape==='terminal'?height/2:3});
  }
  function blockIcon(kind) {
    const shape = C.shapeFor(kind);
    const drawing = svg('svg', {viewBox:'-32 -2 64 36',width:44,height:26,'aria-hidden':'true',class:'flow-icon '+shape});
    drawing.append(contour(shape,56,30));
    if (shape === 'call') drawing.append(svg('path',{d:'M -23 0 V 30 M 23 0 V 30'}));
    const label = svg('text', shape === 'io' ? {x:23,y:10,'text-anchor':'end',class:'flow-io-tag'} : {x:0,y:19,'text-anchor':'middle'});
    label.textContent = ({declare:'x',input:'I',output:'O',assign:'=',if:'?',while:'↻',for:'i',do:'↻',call:'f()',return:'↵',break:'↗',continue:'↶'})[kind];
    drawing.append(label); return drawing;
  }
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
      toolbar.setAttribute('role', 'group'); toolbar.setAttribute('aria-label', 'Comandi della subroutine');
      this.fnSelect = this.select([], 'Diagramma della subroutine');
      this.fnSelect.addEventListener('change', () => { this.fnId = this.fnSelect.value; this.selected = null; this.render(); });
      const diagramLabel = el('label', 'Subroutine '); diagramLabel.append(this.fnSelect); toolbar.append(diagramLabel);
      this.addFunction = this.button('Nuova subroutine', () => this.mutate(() => {
        let index = 1; while (this.document.functions.some(fn => fn.name === 'procedura' + index)) index++;
        const fn = { id: C.id(), name: 'procedura' + index, returnType: 'void', params: [], body: [] };
        this.document.functions.push(fn); this.fnId = fn.id; this.selected = null;
      }, true), toolbar, 'flow-new-function');
      this.edit = this.button('Modifica diagramma', () => this.options.onEdit(), toolbar, 'flow-edit-diagram'); this.edit.hidden = true;
      this.propertiesButton = this.button('Parametri e risultato', () => { this.functionProps.open = !this.functionProps.open; }, toolbar, 'flow-properties');
      this.propertiesButton.setAttribute('aria-expanded', 'false');
      this.undoButton = this.button('Annulla', () => this.undo(), toolbar, 'flow-undo');
      this.root.append(toolbar);
      const files = this.options.fileRoot;
      this.fileMenu = el('div', undefined, 'flow-file-menu'); this.fileMenu.id = C.id();
      this.fileMenu.setAttribute('popover', 'auto'); this.fileMenu.setAttribute('role', 'group'); this.fileMenu.setAttribute('aria-label', 'Altre azioni del programma');
      this.file = el('input'); this.file.type = 'file'; this.file.accept = '.json,application/json'; this.file.hidden = true;
      this.file.addEventListener('change', async () => {
        const file = this.file.files[0]; if (!file) return;
        try {
          if (file.size > 250000) throw new Error('File troppo grande: massimo 250 KB.');
          const doc = C.validate(JSON.parse(await file.text()));
          if (!doc.title) doc.title = ProgramFiles.baseName(file.name);
          this.replace(doc);
        } catch (error) { this.message('Apertura non riuscita: ' + error.message, true); }
        this.file.value = '';
      });
      this.openButton = this.button('Apri', () => this.file.click(), files); this.openButton.setAttribute('aria-label', 'Apri diagramma');
      const save = this.button('Salva', () => {
        const name = ProgramFiles.filename(this.document.title || '', '.flow.json');
        ProgramFiles.download(JSON.stringify(this.document, null, 2), name, 'application/json');
        this.message('File preparato: ' + name + '. Lo trovi nei download del browser.');
      }, files, 'flow-save'); save.setAttribute('aria-label', 'Salva diagramma');
      const more = el('button', 'Altro ▾'); more.type = 'button'; more.setAttribute('popovertarget', this.fileMenu.id); more.setAttribute('aria-label', 'Altre azioni del programma');
      more.setAttribute('aria-expanded', 'false'); more.setAttribute('aria-controls', this.fileMenu.id);
      files.append(more, this.fileMenu, this.file);
      this.newButton = this.button('Nuovo diagramma', () => this.replace(C.blank()), this.fileMenu); this.newButton.autofocus = true;
      this.exampleButton = this.button('Esempio area', () => this.replace({...C.example(), title: 'Area del rettangolo'}), this.fileMenu);
      this.pngButton = this.button('Esporta PNG', () => this.exportPng(), this.fileMenu);
      this.fileMenu.addEventListener('toggle', event => {
        more.setAttribute('aria-expanded', String(event.newState === 'open'));
        if (event.newState !== 'open') return;
        const anchor = more.getBoundingClientRect(), box = this.fileMenu.getBoundingClientRect();
        this.fileMenu.style.left = Math.max(8, Math.min(anchor.right - box.width, window.innerWidth - box.width - 8)) + 'px';
        this.fileMenu.style.top = Math.max(8, Math.min(anchor.bottom + 6, window.innerHeight - box.height - 8)) + 'px';
      });
      this.fileMenu.addEventListener('click', event => { if (event.target.closest('button')) this.fileMenu.hidePopover(); });
      this.functionProps = el('details', undefined, 'flow-function-props'); this.functionProps.id = C.id();
      const summary = el('summary', 'Parametri e risultato della subroutine'); summary.hidden = true; this.functionProps.append(summary);
      this.functionProps.setAttribute('aria-label', 'Parametri e risultato della subroutine'); this.propertiesButton.setAttribute('aria-controls', this.functionProps.id);
      this.functionProps.setAttribute('aria-hidden', 'true');
      this.functionProps.addEventListener('toggle', () => {
        this.propertiesButton.setAttribute('aria-expanded', String(this.functionProps.open));
        this.functionProps.setAttribute('aria-hidden', String(!this.functionProps.open));
      });
      this.functionForm = el('div'); this.functionProps.append(this.functionForm); this.root.append(this.functionProps);
      this.status = el('p', '', 'flow-status'); this.status.hidden = true; this.status.setAttribute('role', 'status'); this.root.append(this.status);
      this.scopeNote=el('p','Importato da C++: dichiarazioni e durata delle variabili seguono gli ambiti C++, compreso il contatore locale al FOR.','flow-status');this.scopeNote.hidden=true;
      this.canvas = el('div', undefined, 'flow-canvas'); this.canvas.tabIndex = 0;
      this.canvas.addEventListener('scroll',()=>this.hideForTooltip());
      this.canvas.setAttribute('aria-label', 'Diagramma di flusso: seleziona un blocco per modificarlo'); this.root.append(this.canvas);
      this.inspector = el('div', undefined, 'flow-inspector'); this.root.append(this.inspector);
      const palette = el('div', undefined, 'flow-palette');
      this.kindSelect = el('button',undefined,'flow-kind-select'); this.kindSelect.type = 'button';
      this.kindSelect.setAttribute('aria-label','Tipo di blocco da aggiungere');
      this.kindSelect.setAttribute('aria-haspopup','menu'); this.kindSelect.setAttribute('aria-expanded','false');
      this.chooseKind('declare');
      this.kindSelect.addEventListener('click',()=>this.openKindMenu(this.kindSelect,kind=>this.chooseKind(kind)));
      this.insertion = this.select([], 'Posizione del nuovo blocco');
      const typeLabel = el('label', 'Nuovo blocco '); typeLabel.append(this.kindSelect);
      const whereLabel = el('label', 'Posizione '); whereLabel.append(this.insertion);
      palette.append(typeLabel, whereLabel);
      this.addButton = this.button('Aggiungi blocco', () => this.addNode(), palette, 'flow-add'); this.root.append(palette);
      this.kindMenu = el('div',undefined,'flow-kind-menu'); this.kindMenu.id = C.id();
      this.kindMenu.setAttribute('popover','auto'); this.kindMenu.setAttribute('role','menu');
      this.kindMenu.setAttribute('aria-label','Scegli il tipo di blocco'); this.kindSelect.setAttribute('aria-controls',this.kindMenu.id);
      this.kindMenu.addEventListener('toggle',event=>{if(event.newState==='closed')this.menuAnchor?.setAttribute('aria-expanded','false');});
      this.kindMenu.addEventListener('keydown',event=>{
        const items=[...this.kindMenu.querySelectorAll('[role="menuitem"]')], index=items.indexOf(document.activeElement);
        let next;
        if(event.key==='ArrowDown')next=(index+1)%items.length;
        else if(event.key==='ArrowUp')next=(index-1+items.length)%items.length;
        else if(event.key==='Home')next=0;else if(event.key==='End')next=items.length-1;
        if(next!==undefined){event.preventDefault();items[next]?.focus();}
      });
      this.root.append(this.kindMenu);
      this.forTooltip = el('div',undefined,'flow-for-tooltip'); this.forTooltip.id = C.id();
      this.forTooltip.setAttribute('popover','manual'); this.forTooltip.setAttribute('role','tooltip'); this.root.append(this.forTooltip);
      const preview = el('section', undefined, 'flow-preview'); preview.setAttribute('aria-label', 'C++ generato'); preview.append(el('h3', 'C++ generato'));
      preview.append(this.scopeNote);
      this.source = el('pre'); this.source.tabIndex = 0; this.source.setAttribute('aria-label', 'Sorgente C++ generato dal diagramma'); preview.append(this.source);
      this.button('Scarica C++ generato', async () => { try { const source = await this.getSource(); ProgramFiles.download(source.code, ProgramFiles.filename(this.document.title || '', '.cpp'), 'text/plain'); } catch {} }, preview);
      this.options.sourceRoot.append(preview);
    }
    chooseKind(kind) {
      this.kindSelect.value=kind;
      this.kindSelect.replaceChildren(blockIcon(kind),el('span',menuLabels[kind]),el('span','▾','flow-kind-chevron'));
      this.kindSelect.title = menuLabels[kind];
    }
    hideForTooltip() {
      if(this.forTooltip?.matches(':popover-open'))this.forTooltip.hidePopover();
    }
    showForTooltip(anchor,label) {
      this.forTooltip.textContent=label;
      if(!this.forTooltip.matches(':popover-open'))this.forTooltip.showPopover();
      const box=anchor.getBoundingClientRect(), tip=this.forTooltip.getBoundingClientRect();
      this.forTooltip.style.left=Math.max(8,Math.min(box.left+(box.width-tip.width)/2,window.innerWidth-tip.width-8))+'px';
      this.forTooltip.style.top=(box.top>tip.height+10?box.top-tip.height-8:box.bottom+8)+'px';
    }
    closeKindMenu() {
      if(this.kindMenu?.matches(':popover-open'))this.kindMenu.hidePopover();
      this.menuAnchor?.setAttribute('aria-expanded','false');
    }
    openKindMenu(anchor, select, point = null, caption = 'Nuovo blocco') {
      if(this.running)return;
      this.closeKindMenu(); this.menuAnchor=anchor;
      this.kindMenu.replaceChildren(el('p',caption,'flow-kind-caption'));
      for(const [kind,label] of Object.entries(menuLabels)) {
        const button=this.button('',()=>{this.closeKindMenu();select(kind);if(anchor===this.kindSelect)anchor.focus();},this.kindMenu,'flow-kind-option');
        button.setAttribute('role','menuitem');button.append(blockIcon(kind),el('span',label));
      }
      anchor.setAttribute('aria-expanded','true');anchor.setAttribute('aria-controls',this.kindMenu.id);
      this.kindMenu.showPopover();
      const box=anchor.getBoundingClientRect(), menu=this.kindMenu.getBoundingClientRect();
      const left=point?.x??box.left, below=point?.y??box.bottom;
      const top=below+8+menu.height<=window.innerHeight?below+8:Math.max(8,(point?.y??box.top)-menu.height-8);
      this.kindMenu.style.left=Math.max(8,Math.min(left,window.innerWidth-menu.width-8))+'px';
      this.kindMenu.style.top=top+'px';
      this.kindMenu.querySelector('[role="menuitem"]')?.focus({preventScroll:true});
    }
    setTitle(title) {
      this.document.title = title;
      this.options.onChange(JSON.stringify(this.document), true);
    }
    async exportPng() {
      this.pngButton.disabled=true;
      let url;
      try {
        const original=this.canvas.querySelector('svg');
        if(!original)throw new Error('Nessun diagramma da esportare.');
        const fn=this.document.functions.find(fn=>fn.id===this.fnId);
        const drawing=original.cloneNode(true), originals=[original,...original.querySelectorAll('*')], copies=[drawing,...drawing.querySelectorAll('*')];
        const properties=['fill','stroke','stroke-width','stroke-dasharray','stroke-linejoin','stroke-linecap','font-family','font-size','font-weight','text-anchor','paint-order','text-decoration'];
        originals.forEach((node,index)=>{const style=getComputedStyle(node);for(const property of properties)copies[index].style.setProperty(property,style.getPropertyValue(property));});
        drawing.querySelectorAll('.flow-edge-hit,.flow-insert-handle,.flow-insert-disc,.flow-insert-plus,title').forEach(node=>node.remove());
        drawing.querySelectorAll('[tabindex]').forEach(node=>node.removeAttribute('tabindex'));
        const {width,height}=original.viewBox.baseVal;
        const scale=Math.min(2,8192/width,8192/height,Math.sqrt(32000000/(width*height)));
        if(!Number.isFinite(scale)||scale<0.2)throw new Error('Diagramma troppo grande per un PNG leggibile: riduci i blocchi.');
        drawing.setAttribute('width',width);drawing.setAttribute('height',height);drawing.setAttribute('xmlns','http://www.w3.org/2000/svg');
        url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(drawing)],{type:'image/svg+xml;charset=utf-8'}));
        const image=new Image();image.src=url;await image.decode();
        const canvas=el('canvas');canvas.width=Math.ceil(width*scale);canvas.height=Math.ceil(height*scale);
        const context=canvas.getContext('2d');if(!context)throw new Error('Esportazione PNG non disponibile nel browser.');
        context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.scale(scale,scale);context.drawImage(image,0,0,width,height);
        const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
        if(!blob)throw new Error('Impossibile creare il PNG.');
        const name=fn.name.replace(/[^A-Za-z0-9_-]/g,'_').slice(0,60)||'diagramma';
        ProgramFiles.download(blob,'flowchart-'+name+'.png','image/png');this.message('PNG esportato: intero diagramma di '+fn.name+'().');
      } catch(error) { this.message('Esportazione non riuscita: '+error.message,true); }
      finally {if(url)URL.revokeObjectURL(url);this.pngButton.disabled=false;}
    }
    message(text, error = false) { this.status.textContent = text; this.status.hidden = !text; this.status.classList.toggle('flow-error', error); }
    mutate(action, openProperties = false) {
      if (this.running) return;
      const previous = JSON.stringify(this.document);
      try { action(); C.validate(this.document); }
      catch (error) { this.document = JSON.parse(previous); this.render(); this.message(error.message, true); return; }
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
    async getSource() {
      try {
        C.generate(this.document);
        this.preview();
        const key = this.sourceKey, revision = this.sourceRevision, generated = await this.sourceReady;
        if (key !== this.sourceKey || revision !== this.sourceRevision) throw new Error('Il diagramma è cambiato: ripeti l’operazione.');
        if (generated instanceof Error) throw generated;
        return generated;
      }
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
    field(parent, caption, value, apply, options = null, hint = '', multiline = false) {
      const label = el('label', caption, 'flow-field');
      const input = options ? this.select(options, caption) : el(multiline ? 'textarea' : 'input');
      input.setAttribute('aria-label', caption);
      if (multiline) { input.rows = 4; input.spellcheck = false; }
      else if (!options) input.type = 'text';
      input.value = value ?? ''; input.disabled = this.running;
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
      this.scopeNote.hidden=this.document.scope!=='cpp';
      this.root.classList.toggle('flow-running', this.running);
      this.edit.hidden = !this.running;
      this.addFunction.hidden = this.running;
      for (const control of [this.newButton,this.exampleButton,this.openButton,this.addFunction,this.kindSelect,this.insertion,this.addButton]) control.disabled = this.running;
      this.undoButton.disabled = this.running || !this.history.length;
      this.renderFunction(fn); this.renderInspector(fn); this.renderGraph(); this.preview();
    }
    preview() {
      try {
        const candidate = C.generate(this.document), key = JSON.stringify(candidate);
        if (key === this.sourceKey && !this.sourceFailure) {
          this.paintSource();
          this.message(this.running ? 'Esecuzione registrata: usa i passi per seguire i blocchi.' : '');
          return;
        }
        this.sourceKey = key; this.generated = candidate; this.sourceFailure = false;
        const revision = this.sourceRevision = (this.sourceRevision || 0) + 1;
        this.source.textContent = 'Genero il C++…';
        this.sourceReady = this.options.resolveSource(candidate).then(generated => {
          if (this.sourceKey === key && this.sourceRevision === revision) {
            this.generated = generated;
            this.source.replaceChildren(...generated.code.split('\n').map((line, index) => {
              const row = el('span', line || ' ', 'generated-line'); row.dataset.line = index + 1; return row;
            }));
            this.paintSource(!!this.selected);
            this.message(this.running ? 'Esecuzione registrata: usa i passi per seguire i blocchi.' : '');
          }
          return generated;
        }).catch(error => {
          if (this.sourceKey === key && this.sourceRevision === revision) { this.sourceFailure = true; this.source.textContent = error.message; this.message(error.message, true); }
          return error;
        });
      } catch (error) { this.sourceKey = null; this.generated = null; this.sourceReady = Promise.resolve(error); this.source.textContent = error.message; this.message(error.message, true); }
    }
    paintSource(scroll = false) {
      this.source.querySelectorAll('.generated-line').forEach(row => {
        const point = this.generated?.lineMap[Number(row.dataset.line)];
        row.classList.toggle('generated-selected', !!this.selected && point?.fn === this.fnId &&
          (point.node === this.selected || point.node === this.selected + ':entry'));
      });
      if (scroll) {
        const row = this.source.querySelector('.generated-selected');
        if (row) {
          this.source.scrollTop = Math.max(0, row.offsetTop - this.source.offsetTop - this.source.clientHeight / 3);
          this.source.scrollLeft = 0;
        }
      }
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
        this.field(row, `Tipo parametro ${index+1}`, (param.constant?'const ':'')+param.type, value => { param.constant=value.startsWith('const ');param.type=value.replace(/^const /,''); }, C.types.flatMap(t=>[[t,t],['const '+t,'const '+t]]));
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
      this.inspector.classList.toggle('flow-inspector-empty', !node);
      const positions = [['end','Alla fine del diagramma']];
      if (node) {
        positions.unshift(['after','Dopo il blocco selezionato']);
        if (node.kind === 'if') positions.push(['then','Nel ramo Vero'],['else','Nel ramo Falso']);
        if (Array.isArray(node.body)) positions.push(['body','Nel corpo del ciclo']);
      }
      this.insertion.replaceChildren(...positions.map(([value,text])=>{const option=el('option',text);option.value=value;return option;}));
      if (!node) { this.inspector.append(el('p',this.running?'Seleziona un blocco per consultarne i campi.':'Clicca su una freccia (+) oppure aggiungi un blocco qui sotto.')); return; }
      this.inspector.append(el('h3',C.kinds[node.kind]));
      const fields = el('div',undefined,'flow-field-grid');
      const field = (caption,key,options=null,hint='',multiline=false) => this.field(fields,caption,node[key],value=>{node[key]=value;},options,hint,multiline);
      if(node.kind==='declare') {
        field('Tipo','type',C.types.map(t=>[t,t])); field('Nome variabile','name');
        field('Forma','mode',[['value','Variabile / array'],['pointer','Puntatore *'],['reference','Riferimento &']]);
        field('Dimensione array (facoltativa)','size',null,'Esempio: 5 oppure N costante.');
        field('Valore iniziale (facoltativo)','init',null,'Array: valori separati da virgole, senza parentesi graffe.');
        this.field(fields,'Costante',String(node.constant),value=>{node.constant=value==='true';},[['false','No'],['true','Sì · const']]);
      } else if(node.kind==='input') {
        if(node.grouping==='chain')this.inspector.append(el('p','Lettura C++ concatenata: la console mostra un’unica risposta per le variabili del blocco.','flow-hint'));
        field('Variabili da leggere','target',null,this.document.scope==='cpp'?'Una variabile o una cella per riga, già dichiarata nel suo ambito C++.':node.mode==='line'?'Una variabile string per riga. Una nuova variabile senza tipo nasce string.':'Una per riga: base, int altezza, string nome oppure v[i]. Una nuova variabile senza tipo nasce double.',true);
        this.field(fields,'Tipo lettura',node.mode||'token',value=>{node.mode=value;},[['token','Parola o numero · cin'],['line','Riga completa · getline']]);
        field('Domanda nella console (facoltativa)','prompt');
      } else if(node.kind==='output') {
        field('Espressioni da mostrare','expression',null,'Una per riga, per esempio "Area: " e, nella riga successiva, area.',true);
        field('Fine output','ending',[['OUTLN','OUTLN · vai a capo alla fine'],['OUT','OUT · continua sulla stessa riga']]);
      } else if(node.kind==='assign') field('Assegnamenti','expression',null,'Uno per riga: area = base * altezza oppure i = i + 1. Una nuova variabile ricava il tipo dal primo assegnamento.',true);
      else if(['if','while','for','do'].includes(node.kind)) {
        if(node.kind==='for') field('Inizializzazione','init',null,'Esempio: i = 0');
        field('Condizione','condition',null,'Esempio: i < 3 oppure numero > 0');
        if(node.kind==='for') field('Aggiornamento','update',null,'Esempio: i = i + 1');
        this.inspector.append(el('p',node.kind==='if'?'Seleziona Inserisci nel ramo Vero o Falso per aggiungere i blocchi dei due percorsi.':'Seleziona Inserisci nel corpo del ciclo per aggiungere le istruzioni da ripetere.','flow-hint'));
      } else if(node.kind==='call') {
        if(node.declareType)field('Tipo del risultato dichiarato','declareType',C.types.map(t=>[t,t]));
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
      const fn=this.document.functions.find(f=>f.id===this.fnId), found=C.locate(this.document,this.selected), where=this.insertion.value;
      let position={fn:fn.id,parent:null,branch:'body',index:fn.body.length};
      if(where==='after'&&found)position={fn:fn.id,parent:found.parent?.id||null,branch:found.branch,index:found.index+1};
      else if(['then','else','body'].includes(where)&&found&&Array.isArray(found.node[where]))position={fn:fn.id,parent:found.node.id,branch:where,index:found.node[where].length};
      this.insertNode(position,this.kindSelect.value);
    }
    insertNode(position,kind) {
      this.mutate(()=>{this.selected=C.insertAt(this.document,position,kind).id;});
      this.inspector.querySelector('input:not(:disabled),textarea:not(:disabled),select:not(:disabled)')?.focus({preventScroll:true});
      this.canvas.querySelector(`[data-node="${this.selected}"]`)?.scrollIntoView({block:'nearest',inline:'nearest'});
    }
    renderGraph() {
      this.closeKindMenu(); this.hideForTooltip();
      const scroll=[this.canvas.scrollLeft,this.canvas.scrollTop]; this.canvas.replaceChildren();
      let graph;
      try { graph=C.layout(this.document,this.fnId); } catch(error) { this.canvas.append(el('p',error.message)); return; }
      this.graph=graph;
      const visible=C.drawingGraph(graph);
      const scale=document.body.classList.contains('large')?1.2:1;
      const drawing=svg('svg',{viewBox:`0 0 ${graph.width} ${graph.height}`,width:graph.width*scale,height:graph.height*scale,role:'group','aria-label':'Flowchart di '+this.document.functions.find(f=>f.id===this.fnId).name});
      const defs=svg('defs'); const marker=svg('marker',{id:'flow-arrow',viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:7,markerHeight:7,orient:'auto-start-reverse'});
      marker.append(svg('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:'context-stroke'}));defs.append(marker);drawing.append(defs);
      for(const edge of visible.edges) {
        const group=svg('g',{'class':'flow-edge','data-from':edge.from,'data-to':edge.to});
        group.dataset.edges=edge.indices.join(' ');
        if(edge.owner)group.dataset.owner=edge.owner;if(edge.outcome)group.dataset.outcome=edge.outcome;
        const d=edge.points.map(([x,y],i)=>(i?'L':'M')+x+' '+y).join(' ');
        const path=svg('path',{d,class:'flow-edge-line'});
        if(edge.endArrow)path.setAttribute('marker-end','url(#flow-arrow)');
        if(edge.heads.length)group.dataset.arrow=edge.arrow;
        group.append(path);
        if(edge.insertion&&!this.running) {
          const position=edge.insertion;
          group.dataset.insertable='true';group.dataset.branch=position.branch;group.dataset.parent=position.parent||'';group.dataset.index=position.index;
          const caption=position.parent?(position.branch==='body'?'Nel corpo del ciclo':position.branch==='then'?'Nel ramo Vero':'Nel ramo Falso'):`In ${this.document.functions.find(fn=>fn.id===position.fn).name}()`;
          const description=`Inserisci un blocco · ${caption} · posizione ${position.index+1}`;
          const segments=edge.points.slice(1).map((end,i)=>({start:edge.points[i],end,length:Math.hypot(end[0]-edge.points[i][0],end[1]-edge.points[i][1])}));
          const segment=segments.reduce((best,item)=>item.length>best.length?item:best);
          const cx=(segment.start[0]+segment.end[0])/2,cy=(segment.start[1]+segment.end[1])/2;
          const handle=svg('circle',{cx,cy,r:12,class:'flow-insert-handle',role:'button',tabindex:0,'aria-label':description,'aria-haspopup':'menu','aria-expanded':'false'});
          const title=svg('title');title.textContent=description;group.append(title,svg('path',{d,class:'flow-edge-hit'}));
          const disc=svg('circle',{cx,cy,r:7,class:'flow-insert-disc','aria-hidden':'true'});
          const plus=svg('text',{x:cx,y:cy+4,class:'flow-insert-plus','text-anchor':'middle','aria-hidden':'true'});plus.textContent='+';group.append(handle,disc,plus);
          group.addEventListener('click',event=>{event.stopPropagation();this.openKindMenu(handle,kind=>this.insertNode(position,kind),{x:event.clientX,y:event.clientY},caption);});
          group.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();this.openKindMenu(handle,kind=>this.insertNode(position,kind),null,caption);}});
        }
        if(edge.text){const [x,y]=edge.points[Math.min(1,edge.points.length-1)];const text=svg('text',{x:x+7,y:y-8});text.textContent=edge.text.length>35?edge.text.slice(0,32)+'…':edge.text;group.append(text);}
        for(const head of edge.heads)group.append(svg('polygon',{points:head.map(point=>point.join(',')).join(' '),class:'flow-arrowhead','aria-hidden':'true'}));
        drawing.append(group);
      }
      for(const node of visible.nodes) {
        const group=svg('g',{transform:`translate(${node.x} ${node.y})`,'class':'flow-node '+node.shape,'data-node':node.id,'data-owner':node.owner});
        if(node.shape!=='for'){const title=svg('title');title.textContent=node.text;group.append(title);}
        group.append(contour(node.shape,node.width,node.height));
        if (node.badge) {
          const badge = svg('text', {x:node.badge.x,y:node.badge.y,'text-anchor':'end',class:'flow-io-tag','aria-hidden':'true'});
          badge.textContent = node.badge.text; group.append(badge);
        }
        if(node.shape==='call'){group.append(svg('path',{d:`M -108 0 L -108 ${node.height} M 108 0 L 108 ${node.height}`,'class':'call-bars'}));}
        const lines=C.visualLines(node.text,node.shape);
        if(node.shape==='for') {
          const text=svg('text',{'text-anchor':'middle',y:node.height/2+4});
          node.parts.forEach((part,index)=>{
            if(index){const separator=svg('tspan');separator.textContent='; ';text.append(separator);}
            const span=svg('tspan',{class:'flow-for-part','data-for-part':part.key,tabindex:0,role:'img','aria-label':part.label+': '+part.text,'aria-describedby':this.forTooltip.id});
            span.textContent=part.text;
            span.addEventListener('pointerenter',()=>this.showForTooltip(span,part.label));
            span.addEventListener('focus',()=>this.showForTooltip(span,part.label));
            span.addEventListener('pointerleave',()=>{if(document.activeElement!==span)this.hideForTooltip();});
            span.addEventListener('blur',()=>this.hideForTooltip());
            text.append(span);
          });group.append(text);
        } else if(node.shape!=='join') {
          const text=svg('text',{'text-anchor':'middle',y:node.height/2-(lines.length-1)*8+4+(node.badge?6:0)});
          lines.forEach((line,index)=>{const span=svg('tspan',{x:0,dy:index?16:0});span.textContent=line.trim();text.append(span);});group.append(text);
        }
        if(node.shape!=='join' && C.locate(this.document,node.owner)) {
          group.setAttribute('role','button');group.setAttribute('tabindex','0');group.setAttribute('aria-label',C.kinds[C.locate(this.document,node.owner).node.kind]+': '+node.text);
          const select=()=>{this.selected=node.owner;this.renderInspector(this.document.functions.find(f=>f.id===this.fnId));this.renderGraph();this.paintSource(true);};
          group.addEventListener('click',select);group.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();select();this.canvas.querySelector(`[data-node="${node.id}"]`)?.focus({preventScroll:true});}});
        }
        if(node.owner===this.selected)group.classList.add('flow-selected');drawing.append(group);
      }
      this.canvas.append(drawing);this.canvas.scrollLeft=scroll[0];this.canvas.scrollTop=scroll[1];this.paintTrace();
    }
    pointAt(trace,index) {
      const step=trace[index], current=step.frames.at(-1);let point=this.generated.lineMap[step.line];
      if(step.event==='fine')point={fn:'main',node:'main:end'};
      else if(step.event==='ritorno implicito'&&point)point={...point,node:point.fn+':end'};
      else if(step.event==='ritorno'&&C.locate(this.document,point?.node)?.node.kind==='return')point={...point,node:point.fn+':end'};
      else if(step.event.startsWith('uscita da ')) {
        if(!current)point={fn:'main',node:'main:end'};
        else for(let i=index-1;i>=0;i--){const candidate=this.generated.lineMap[trace[i].line];if(trace[i].frames.at(-1)?.id===current.id&&candidate?.functionName===current.name){point=candidate;break;}}
      }
      return point?{...point,frame:current?.id||0}:null;
    }
    routeAt(trace,index,point) {
      const current=trace[index];
      for(let i=index-1;i>=0;i--) {
        const previous=this.pointAt(trace,i);if(!previous)continue;
        if(previous.fn!==point.fn||previous.frame!==point.frame)return [];
        if(previous.node===point.node) {
          const condition=trace[i].condition;
          if(current.condition?.action==='test'&&condition?.action==='test'&&current.condition.number!==condition.number)
            return C.pathBetween(this.graph,point.node,point.node,condition.result);
          continue;
        }
        let outcome=null;
        for(let j=i;j>=0;j--){const source=this.pointAt(trace,j);if(source?.node!==previous.node||source.frame!==point.frame)break;
          const condition=trace[j].condition;if(condition?.action==='test'){outcome=condition.result;break;}}
        return C.pathBetween(this.graph,previous.node,point.node,outcome);
      }
      return [];
    }
    showTrace(trace,index,showConditions) {
      if(!this.generated||!trace.length)return this.clearTrace();
      const step=trace[index], current=step.frames.at(-1), point=this.pointAt(trace,index);
      if(!point)return this.clearTrace();
      const previous=trace[index-1];
      const condition=showConditions?(step.condition||(!step.error&&step.event==='prima'&&previous?.condition?.frame===current?.id?previous.condition:null)):null;
      this.traceState={point,condition,route:[]};
      if(this.fnId!==point.fn){this.fnId=point.fn;this.selected=null;this.render();}
      this.traceState.route=this.routeAt(trace,index,point);this.paintTrace();
      const target=this.canvas.querySelector(`[data-node="${point.node}"]`);
      if(target){const box=target.getBBox(), svg_=target.ownerSVGElement;const scale=svg_.getBoundingClientRect().width/svg_.viewBox.baseVal.width;
        const transform=target.transform.baseVal.consolidate().matrix, top=transform.f*scale, left=(transform.e+box.x)*scale;
        if(top<this.canvas.scrollTop||top+box.height*scale>this.canvas.scrollTop+this.canvas.clientHeight)this.canvas.scrollTop=Math.max(0,top-this.canvas.clientHeight/3);
        if(left<this.canvas.scrollLeft||left+box.width*scale>this.canvas.scrollLeft+this.canvas.clientWidth)this.canvas.scrollLeft=Math.max(0,left-(this.canvas.clientWidth-box.width*scale)/2);}
    }
    paintTrace() {
      this.canvas.querySelectorAll('.flow-active,.flow-true,.flow-false,.flow-chosen,.flow-traversed').forEach(node=>node.classList.remove('flow-active','flow-true','flow-false','flow-chosen','flow-traversed'));
      if(!this.traceState)return;
      const {point,condition}=this.traceState;
      if(point.fn===this.fnId)for(const index of this.traceState.route||[]) {
        this.canvas.querySelector(`[data-edges~="${index}"]`)?.classList.add('flow-traversed');
        const edge = this.graph.edges[index];
        for (const id of [edge.from, edge.to]) {
          const node = this.canvas.querySelector(`[data-node="${id}"]`);
          if (node?.classList.contains('join')) node.classList.add('flow-traversed');
        }
      }
      this.canvas.querySelector(`[data-node="${point.node}"]`)?.classList.add('flow-active');
      const conditionPoint=condition&&this.generated?.lineMap[condition.line];
      if(conditionPoint?.fn===this.fnId&&condition.action==='test') {
        this.canvas.querySelector(`[data-node="${conditionPoint.node}"]`)?.classList.add(condition.result?'flow-true':'flow-false');
        this.canvas.querySelectorAll('.flow-edge').forEach(edge=>{if(edge.dataset.owner===conditionPoint.node&&edge.dataset.outcome===String(condition.result))edge.classList.add('flow-chosen',condition.result?'flow-true':'flow-false');});
      }
    }
  };
})();

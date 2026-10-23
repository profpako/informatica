'use strict';
const FlowchartCore = (() => {
  const types = ['int', 'float', 'double', 'char', 'bool', 'string'];
  const kinds = { declare: 'Dichiarazione', input: 'Input', output: 'Output', assign: 'Elaborazione',
    if: 'Decisione', while: 'Ciclo while', for: 'Ciclo for', do: 'Ciclo do…while',
    call: 'Chiamata', return: 'Restituisci', break: 'Esci dal ciclo', continue: 'Continua il ciclo' };
  let serial = 0;
  const id = () => 'n' + Date.now().toString(36) + (++serial).toString(36);
  class FlowError extends Error {
    constructor(message, node = null) { super(message); this.node = node; }
  }
  const fail = (message, node) => { throw new FlowError(message, node); };
  const blank = () => ({ format: 'dentro-il-codice-flowchart', version: 1,
    functions: [{ id: 'main', name: 'main', returnType: 'int', params: [], body: [] }] });
  function newNode(kind) {
    const node = { id: id(), kind };
    if (kind === 'declare') Object.assign(node, { type: 'int', name: '', mode: 'value', size: '', init: '', constant: false });
    if (kind === 'input') Object.assign(node, { target: '', prompt: '' });
    if (kind === 'output') node.expression = '"Risultato"';
    if (kind === 'assign') node.expression = '';
    if (['if', 'while', 'for', 'do'].includes(kind)) node.condition = '';
    if (kind === 'if') Object.assign(node, { then: [], else: [] });
    if (['while', 'for', 'do'].includes(kind)) node.body = [];
    if (kind === 'for') Object.assign(node, { init: 'int i = 0', update: 'i++' });
    if (kind === 'call') Object.assign(node, { callee: '', args: '', result: '' });
    if (kind === 'return') node.expression = '';
    return node;
  }
  function text(value, field, node) {
    if (typeof value !== 'string' || value.length > 1000) fail(`${field}: testo non valido o troppo lungo.`, node);
    return value.trim();
  }
  function identifier(value, field, node) {
    const name = text(value, field, node);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || name.startsWith('__') ||
        /^(cv|if|else|for|while|do|return|break|continue|int|float|double|char|bool|string|void|const|main|cin|cout|std|true|false|nullptr)$/.test(name))
      fail(`${field}: usa un nome C++ valido, per esempio numero o calcolaArea.`, node);
    return name;
  }
  function expression(value, field, node, required = true) {
    const source = text(value, field, node);
    if (!source && required) fail(`Completa ${field.toLowerCase()}.`, node);
    let quote = '', escaped = false, outside = '';
    for (const char of source) {
      if (quote) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === quote) quote = '';
      } else if (char === '"' || char === "'") quote = char;
      else {
        if (';{}#\n\r'.includes(char)) fail(`${field}: inserisci una sola espressione, senza punti e virgola o blocchi.`, node);
        outside += char;
      }
    }
    if (quote) fail(`${field}: chiudi le virgolette.`, node);
    if (/\b(if|else|for|while|do|return|break|continue|goto)\b/.test(outside))
      fail(`${field}: usa il blocco dedicato per il controllo del programma.`, node);
    return source;
  }
  function locate(document, nodeId) {
    function search(list, fn, parent = null, branch = 'body') {
      for (let index = 0; index < list.length; index++) {
        const node = list[index];
        if (node.id === nodeId) return { node, list, index, fn, parent, branch };
        for (const key of ['then', 'else', 'body']) {
          if (Array.isArray(node[key])) { const found = search(node[key], fn, node, key); if (found) return found; }
        }
      }
      return null;
    }
    for (const fn of document.functions) { const found = search(fn.body, fn); if (found) return found; }
    return null;
  }
  function validate(document) {
    if (!document || document.format !== 'dentro-il-codice-flowchart' || document.version !== 1 ||
        !Array.isArray(document.functions) || document.functions.length < 1 || document.functions.length > 20)
      fail('File flowchart non valido: formato o versione non riconosciuti.');
    const ids = new Set(); let count = 0;
    function unique(value) {
      if (typeof value !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,60}$/.test(value) || ids.has(value))
        fail('Identificatore mancante, duplicato o non valido nel diagramma.');
      ids.add(value);
    }
    function sequence(list, depth) {
      if (!Array.isArray(list) || depth > 12) fail('Diagramma troppo annidato o sequenza non valida.');
      for (const node of list) {
        if (!node || !Object.hasOwn(kinds, node.kind) || ++count > 200) fail('Blocco non valido o limite di 200 blocchi superato.');
        unique(node.id);
        if ('constant' in node && typeof node.constant !== 'boolean') fail('Indicazione di costante non valida.', node.id);
        for (const [key, value] of Object.entries(node)) {
          if (!['then', 'else', 'body', 'constant'].includes(key)) text(value, key, node.id);
        }
        if (node.kind === 'if') { sequence(node.then, depth + 1); sequence(node.else, depth + 1); }
        if (['while', 'for', 'do'].includes(node.kind)) sequence(node.body, depth + 1);
      }
    }
    let main = 0;
    for (const fn of document.functions) {
      if (!fn || !Array.isArray(fn.params) || fn.params.length > 12 || ![...types, 'void'].includes(fn.returnType)) fail('Subroutine o parametri non validi.');
      unique(fn.id); text(fn.name, 'Nome subroutine', fn.id);
      if (fn.id === 'main') { main++; if (fn.name !== 'main' || fn.returnType !== 'int' || fn.params.length) fail('main deve essere int main() senza parametri.'); }
      for (const param of fn.params) {
        if (!param || !types.includes(param.type) || !['value', 'reference', 'pointer', 'array'].includes(param.mode)) fail('Tipo di parametro non valido.', fn.id);
        text(param.name, 'Nome parametro', fn.id);
      }
      sequence(fn.body, 0);
    }
    if (main !== 1) fail('Il documento deve contenere il diagramma main.');
    return document;
  }
  function generate(document) {
    validate(document);
    const functions = new Map(document.functions.map(fn => [fn.id, fn]));
    const names = new Set();
    for (const fn of document.functions) {
      if (fn.id !== 'main') identifier(fn.name, 'Nome subroutine', fn.id);
      if (names.has(fn.name)) fail('Ogni subroutine deve avere un nome distinto.', fn.id);
      names.add(fn.name);
    }
    function signature(fn) {
      const params = new Set();
      return `${fn.returnType} ${fn.name}(` + fn.params.map(p => {
        const name = identifier(p.name, 'Nome parametro', fn.id);
        if (params.has(name)) fail('I parametri devono avere nomi distinti.', fn.id);
        params.add(name);
        return `${p.type} ${p.mode === 'reference' ? '&' : p.mode === 'pointer' ? '*' : ''}${name}${p.mode === 'array' ? '[]' : ''}`;
      }).join(', ') + ')';
    }
    const lines = [], lineMap = [null];
    const emit = (line, fn, node, phase = 'node') => { lines.push(line); lineMap.push(fn ? { fn: fn.id, functionName: fn.name, node, phase } : null); };
    emit('#include <iostream>'); emit('#include <string>'); emit('#include <iomanip>'); emit('using namespace std;'); emit('');
    const ordered = document.functions.filter(fn => fn.id !== 'main').concat(functions.get('main'));
    for (const fn of ordered.filter(fn => fn.id !== 'main')) emit(signature(fn) + ';');
    function sequence(list, fn, depth, loops = 0) {
      const indent = '    '.repeat(depth);
      for (const node of list) {
        const expr = (key, label, required = true) => expression(node[key] ?? '', label, node.id, required);
        const out = line => emit(indent + line, fn, node.id);
        if (node.kind === 'declare') {
          if (!types.includes(node.type) || !['value', 'pointer', 'reference'].includes(node.mode)) fail('Tipo di variabile non valido.', node.id);
          const name = identifier(node.name, 'Nome variabile', node.id), size = expr('size', 'Dimensione array', false), init = expr('init', 'Valore iniziale', false);
          if (size && node.mode !== 'value') fail('Scegli variabile semplice per dichiarare un array.', node.id);
          if ((node.constant || node.mode === 'reference') && !init) fail('Costanti e riferimenti richiedono un valore iniziale.', node.id);
          if (/^\d+$/.test(size) && (Number(size) < 1 || Number(size) > 100)) fail('La dimensione deve essere tra 1 e 100.', node.id);
          out(`${node.constant ? 'const ' : ''}${node.type} ${node.mode === 'pointer' ? '*' : node.mode === 'reference' ? '&' : ''}${name}${size ? '[' + size + ']' : ''}${init ? ' = ' + (size ? '{' + init + '}' : init) : ''};`);
        } else if (node.kind === 'input') {
          const target = expr('target', 'Destinazione input');
          if (node.prompt) out(`cout << ${JSON.stringify(node.prompt)};`);
          out(`cin >> ${target};`);
        } else if (node.kind === 'output') out(`cout << ${expr('expression', 'Espressione da mostrare')} << endl;`);
        else if (node.kind === 'assign') out(expr('expression', 'Elaborazione') + ';');
        else if (node.kind === 'call') {
          const callee = functions.get(node.callee);
          if (!callee || callee.id === 'main') fail('Scegli una funzione o procedura esistente.', node.id);
          const result = expr('result', 'Destinazione risultato', false);
          if (result && callee.returnType === 'void') fail('Una procedura void non restituisce un risultato.', node.id);
          out(`${result ? result + ' = ' : ''}${callee.name}(${expr('args', 'Argomenti', false)});`);
        } else if (node.kind === 'return') {
          const value = expr('expression', 'Valore restituito', fn.returnType !== 'void');
          if (value && fn.returnType === 'void') fail('La procedura void usa Restituisci senza un valore.', node.id);
          out(`return${value ? ' ' + value : ''};`);
        } else if (['break', 'continue'].includes(node.kind)) {
          if (!loops) fail('Questo blocco deve essere dentro un ciclo.', node.id);
          out(node.kind + ';');
        } else if (node.kind === 'if') {
          out(`if (${expr('condition', 'Condizione')}) {`); sequence(node.then, fn, depth + 1, loops);
          out('} else {'); sequence(node.else, fn, depth + 1, loops); out('}');
        } else if (node.kind === 'do') {
          emit(indent + 'do {', fn, node.id + ':entry', 'entry'); sequence(node.body, fn, depth + 1, loops + 1);
          out(`} while (${expr('condition', 'Condizione')});`);
        } else {
          out(node.kind === 'for' ? `for (${expr('init', 'Inizializzazione', false)}; ${expr('condition', 'Condizione')}; ${expr('update', 'Aggiornamento', false)}) {`
            : `while (${expr('condition', 'Condizione')}) {`);
          sequence(node.body, fn, depth + 1, loops + 1); out('}');
        }
      }
    }
    function hasReturn(list) { return list.some(n => n.kind === 'return' || ['then', 'else', 'body'].some(key => Array.isArray(n[key]) && hasReturn(n[key]))); }
    for (const fn of ordered) {
      if (fn.id !== 'main' && fn.returnType !== 'void' && !hasReturn(fn.body)) fail(`Aggiungi Restituisci nella funzione ${fn.name}.`, fn.id);
      emit(signature(fn) + ' {', fn, fn.id + ':start', 'start');
      sequence(fn.body, fn, 1);
      if (fn.id === 'main') emit('    return 0;', fn, fn.id + ':end', 'end');
      emit('}', fn, fn.id + ':end', 'end'); emit('');
    }
    const code = lines.join('\n');
    if (new TextEncoder().encode(code).length > 30000) fail('Il diagramma genera più di 30.000 byte di C++: riduci i blocchi.');
    return { code, lineMap };
  }
  function label(node, document) {
    if (node.kind === 'declare') return `${node.constant ? 'const ' : ''}${node.type} ${node.mode === 'pointer' ? '*' : node.mode === 'reference' ? '&' : ''}${node.name || 'nome'}${node.size ? '[' + node.size + ']' : ''}${node.init ? ' = ' + (node.size ? '{' + node.init + '}' : node.init) : ''}`;
    if (node.kind === 'input') return 'Leggi ' + (node.target || 'variabile');
    if (node.kind === 'output') return 'Scrivi ' + node.expression;
    if (['if', 'while', 'for', 'do'].includes(node.kind)) return (node.kind === 'if' ? '' : node.kind + ': ') + (node.condition || 'condizione');
    if (node.kind === 'call') return `${node.result ? node.result + ' = ' : ''}${document.functions.find(fn => fn.id === node.callee)?.name || 'subroutine'}(${node.args || ''})`;
    if (node.kind === 'return') return 'Restituisci ' + node.expression;
    return node.expression || kinds[node.kind];
  }
  function layout(document, functionId) {
    validate(document);
    const fn = document.functions.find(f => f.id === functionId) || document.functions[0];
    const nodes = [], edges = [], gap = 38;
    const measures = new Map();
    function measure(list) {
      const result = { width: 240, height: 0 };
      for (const n of list) {
        let size = { width: 240, height: 62 };
        if (n.kind === 'if') {
          const left = measure(n.then), right = measure(n.else);
          size = { width: left.width + right.width + 80, height: 90 + gap + Math.max(left.height, right.height, 28) + 55 };
        } else if (['while', 'for', 'do'].includes(n.kind)) {
          const body = measure(n.body);
          size = { width: Math.max(360, body.width + 140), height: 90 + gap + Math.max(body.height, 28) + 65 };
        }
        measures.set(n.id, size); result.width = Math.max(result.width, size.width); result.height += size.height + gap;
      }
      return result;
    }
    const total = measure(fn.body), center = total.width / 2 + 35;
    const addNode = (nodeId, x, y, shape, text_, owner = nodeId) => {
      const n = { id: nodeId, owner, x, y, width: shape === 'join' ? 12 : shape === 'terminal' ? 180 : 240,
        height: shape === 'join' ? 12 : shape === 'decision' ? 90 : shape === 'terminal' ? 44 : 62, shape, text: text_ };
      nodes.push(n); return n;
    };
    const edge = (from, to, points, owner = null, outcome = null, text_ = '') => edges.push({ from, to, points, owner, outcome, text: text_ });
    const byId = key => nodes.find(n => n.id === key);
    const connect = (from, to) => { if (from) { const a = byId(from), b = byId(to); edge(from, to, [[a.x,a.y+a.height], [b.x,b.y]]); } };
    function sequence(list, x, y, context) {
      let first = null, tail = null;
      for (const n of list) {
        const size = measures.get(n.id); let entry, exit;
        if (n.kind === 'if') {
          entry = addNode(n.id,x,y,'decision',label(n,document));
          const leftSize = measure(n.then), rightSize = measure(n.else);
          const leftX = x - (rightSize.width + 80) / 2, rightX = x + (leftSize.width + 80) / 2;
          const left = sequence(n.then,leftX,y+90+gap,context), right = sequence(n.else,rightX,y+90+gap,context);
          const join = addNode(n.id+':merge',x,y+size.height-12,'join','',n.id);
          for (const [branch, bx, result] of [['true',leftX,left],['false',rightX,right]]) {
            const destination = result.first ? byId(result.first) : join;
            edge(n.id,destination.id,[[x+(branch==='true'?-120:120),y+45],[bx,y+45],[bx,destination.y],[destination.x,destination.y]],n.id,branch,branch==='true'?'Vero':'Falso');
            if (result.tail) { const t=byId(result.tail); edge(t.id,join.id,[[t.x,t.y+t.height],[t.x,join.y],[x,join.y]]); }
          }
          exit = left.first && !left.tail && right.first && !right.tail ? null : join.id;
        } else if (['while','for','do'].includes(n.kind)) {
          const isDo = n.kind==='do';
          entry = isDo ? addNode(n.id+':entry',x,y,'join','',n.id) : addNode(n.id,x,y,'decision',label(n,document));
          const bodyY = y+(isDo?12:90)+gap;
          const body = sequence(n.body,x,bodyY,{...context, breakId:n.id+':exit',continueId:n.id,continueLabel:n.kind==='for'?n.update:''});
          const diamond = isDo ? addNode(n.id,x,y+size.height-90-35,'decision',label(n,document)) : entry;
          const join = addNode(n.id+':exit',x,y+size.height-12,'join','',n.id);
          const rightX=x+size.width/2-15, leftX=x-size.width/2+15;
          if (body.first) {
            const b=byId(body.first);
            edge(entry.id,b.id,[[x,entry.y+entry.height],[x,b.y]],n.id,isDo?null:'true',isDo?'':'Vero');
            if(body.tail){const t=byId(body.tail); edge(t.id,diamond.id,isDo?[[x,t.y+t.height],[x,diamond.y]]:[[x,t.y+t.height],[x,t.y+t.height+18],[leftX,t.y+t.height+18],[leftX,diamond.y+45],[x-120,diamond.y+45]],n.id,null,n.kind==='for'?n.update:'');}
          } else if(isDo) connect(entry.id,diamond.id);
          else edge(diamond.id,diamond.id,[[x,y+90],[x,bodyY+20],[leftX,bodyY+20],[leftX,y+45],[x-120,y+45]],n.id,'true','Vero');
          if(isDo) edge(diamond.id,entry.id,[[x-120,diamond.y+45],[leftX,diamond.y+45],[leftX,y+6],[x,y+6]],n.id,'true','Vero');
          edge(diamond.id,join.id,isDo?[[x,diamond.y+90],[x,join.y]]:[[x+120,y+45],[rightX,y+45],[rightX,join.y],[x,join.y]],n.id,'false','Falso');
          exit=join.id;
        } else {
          entry=addNode(n.id,x,y,['input','output'].includes(n.kind)?'io':n.kind==='call'?'call':'process',label(n,document));
          exit=entry.id;
          const target=n.kind==='return'?context.returnId:n.kind==='break'?context.breakId:n.kind==='continue'?context.continueId:null;
          if(target){edge(entry.id,target,[[x,y+62],[x+size.width/2+25,y+80]],null,null,n.kind==='continue'&&context.continueLabel?'continue · '+context.continueLabel:n.kind);edges.at(-1).jump=true;exit=null;}
        }
        if(!first) first=entry.id;
        connect(tail,entry.id); tail=exit; y+=size.height+gap;
      }
      return {first,tail,y};
    }
    const start=addNode(fn.id+':start',center,20,'terminal',fn.name+'()');
    const body=sequence(fn.body,center,20+44+gap,{returnId:fn.id+':end'});
    const end=addNode(fn.id+':end',center,body.y,'terminal','Fine '+fn.name+'()');
    connect(start.id,body.first||end.id); connect(body.tail,end.id);
    for(const e of edges) {
      const destination=byId(e.to);
      if(destination && e.jump) {
        const lane=center+total.width/2+20;
        e.points=[[e.points[0][0],e.points[0][1]],[lane,e.points[0][1]+15],[lane,destination.y+destination.height/2],[destination.x+destination.width/2,destination.y+destination.height/2]];
      }
    }
    return {nodes,edges,width:total.width+100,height:end.y+end.height+30};
  }
  function example() {
    const doc = blank(), make = (kind, fields) => Object.assign(newNode(kind), fields);
    const fn = { id: id(), name: 'calcolaArea', returnType: 'int', params: [
      { name: 'b', type: 'int', mode: 'value' }, { name: 'h', type: 'int', mode: 'value' }], body: [
      make('declare', { name: 'risultato', init: 'b * h' }), make('return', { expression: 'risultato' })] };
    doc.functions.push(fn);
    doc.functions[0].body = [make('declare', { name: 'base' }), make('declare', { name: 'altezza' }),
      make('declare', { name: 'area' }), make('input', { target: 'base', prompt: 'Inserisci base: ' }),
      make('input', { target: 'altezza', prompt: 'Inserisci altezza: ' }),
      make('call', { callee: fn.id, args: 'base, altezza', result: 'area' }),
      make('output', { expression: '"Area: " << area' })];
    return doc;
  }
  return { types, kinds, blank, newNode, id, FlowError, validate, generate, label, layout, locate, example };
})();
if (typeof module !== 'undefined') module.exports = FlowchartCore;

'use strict';
const FlowchartCore = (() => {
  const types = ['int', 'float', 'double', 'char', 'bool', 'string'];
  const kinds = { declare: 'Dichiarazione', input: 'Input', output: 'Output', assign: 'Assegnamento',
    if: 'IF', while: 'WHILE', for: 'FOR', do: 'DO...WHILE',
    call: 'Chiamata', return: 'Restituisci', break: 'Esci dal ciclo', continue: 'Continua il ciclo' };
  let serial = 0;
  const id = () => 'n' + Date.now().toString(36) + (++serial).toString(36);
  class FlowError extends Error {
    constructor(message, node = null) { super(message); this.node = node; }
  }
  const fail = (message, node) => { throw new FlowError(message, node); };
  const blank = () => ({ format: 'dentro-il-codice-flowchart', version: 3,
    functions: [{ id: 'main', name: 'main', returnType: 'int', params: [], body: [] }] });
  function newNode(kind) {
    const node = { id: id(), kind };
    if (kind === 'declare') Object.assign(node, { type: 'int', name: '', mode: 'value', size: '', init: '', constant: false });
    if (kind === 'input') Object.assign(node, { target: '', prompt: '' });
    if (kind === 'output') Object.assign(node, { expression: '"Risultato"', ending: 'OUTLN' });
    if (kind === 'assign') node.expression = '';
    if (['if', 'while', 'for', 'do'].includes(kind)) node.condition = '';
    if (kind === 'if') Object.assign(node, { then: [], else: [] });
    if (['while', 'for', 'do'].includes(kind)) node.body = [];
    if (kind === 'for') Object.assign(node, { init: 'i = 0', update: 'i = i + 1' });
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
    if (!document || document.format !== 'dentro-il-codice-flowchart' || ![1, 2, 3].includes(document.version) ||
        !Array.isArray(document.functions) || document.functions.length < 1 || document.functions.length > 20)
      fail('File flowchart non valido: formato o versione non riconosciuti.');
    if(document.scope!==undefined&&!['function','cpp'].includes(document.scope))fail('Ambito delle variabili non valido.');
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
        if (node.kind === 'output' && node.ending !== undefined && !['OUT','OUTLN'].includes(node.ending)) fail('Scegli OUT oppure OUTLN.', node.id);
        if (node.kind === 'input' && node.mode !== undefined && !['token','line'].includes(node.mode)) fail('Tipo di lettura non valido.', node.id);
        if (node.kind === 'input' && node.grouping !== undefined && !['chain','separate'].includes(node.grouping)) fail('Raggruppamento input non valido.', node.id);
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
        if(param.constant!==undefined&&typeof param.constant!=='boolean')fail('Qualificatore const del parametro non valido.',fn.id);
      }
      sequence(fn.body, 0);
    }
    if (main !== 1) fail('Il documento deve contenere il diagramma main.');
    if (document.version === 1) {
      const migrate = list => list.forEach(node => {
        if (node.kind === 'output') { node.expression = splitOutside(node.expression, '<<').join('\n'); node.ending = 'OUTLN'; }
        for (const key of ['then','else','body']) if (Array.isArray(node[key])) migrate(node[key]);
      });
      document.functions.forEach(fn => migrate(fn.body)); document.version = 2;
    }
    if(document.version===2)document.version=3;
    return document;
  }
  function splitOutside(source, separator) {
    const parts = []; let start = 0, quote = '', escaped = false, nesting = 0;
    for (let i = 0; i < source.length; i++) {
      const char = source[i];
      if (quote) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === quote) quote = ''; }
      else if (char === '"' || char === "'") quote = char;
      else if ('(['.includes(char)) nesting++;
      else if (')]'.includes(char)) nesting--;
      else if (!nesting && source.startsWith(separator, i)) { parts.push(source.slice(start, i).trim()); start = i + separator.length; i = start - 1; }
    }
    parts.push(source.slice(start).trim()); return parts;
  }
  function rows(value, field, node) {
    const source = text(value ?? '', field, node);
    if (!source) fail(`Completa ${field.toLowerCase()}.`, node);
    const result = source.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    return result.map(line => expression(line, field, node));
  }
  const stringValue = source => /^"(?:\\.|[^"\\])*"$/.test(source) ? `string(${source})` : source;
  function generate(document) {
    validate(document);
    const cppScope=document.scope==='cpp';
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
        return `${p.constant?'const ':''}${p.type} ${p.mode === 'reference' ? '&' : p.mode === 'pointer' ? '*' : ''}${name}${p.mode === 'array' ? '[]' : ''}`;
      }).join(', ') + ')';
    }
    const lines = [], lineMap = [null], deferred = [];
    const emit = (line, fn, node, phase = 'node') => { lines.push(line); lineMap.push(fn ? { fn: fn.id, functionName: fn.name, node, phase } : null); return lines.length; };
    emit('#include <iostream>'); emit('#include <string>'); emit('#include <iomanip>'); emit('#include <type_traits>'); emit('using namespace std;'); emit('');
    const ordered = document.functions.filter(fn => fn.id !== 'main').concat(functions.get('main'));
    for (const fn of ordered.filter(fn => fn.id !== 'main')) emit(signature(fn) + ';');
    let symbols, plans, hoists;
    function register(name, type, node, depth, root, explicit = false) {
      identifier(name, 'Nome variabile', node.id);
      if(cppScope){if(!explicit)return null;const item={name,type,node:node.id,deferred:false};symbols.set(name,item);return item;}
      if (symbols.has(name)) {
        if (explicit) fail(`La variabile ${name} è già definita in questa subroutine.`, node.id);
        return null;
      }
      const item = { name, type, node: node.id, deferred: depth > 1 };
      symbols.set(name, item);
      if (item.deferred) { if (!hoists.has(root)) hoists.set(root, []); hoists.get(root).push(item); }
      return item;
    }
    function assignment(source, node, depth, root, allowDeclaration = false) {
      source = expression(source, 'Assegnamento', node.id);
      if(cppScope)return {source,item:null};
      if (allowDeclaration) source = source.replace(/^int\s+/, ''); // Compatibilità con i primi diagrammi salvati.
      const match = /^([A-Za-z_]\w*)\s*=(?!=)([\s\S]+)$/.exec(source);
      const item = match ? register(match[1], `std::decay_t<decltype(${stringValue(match[2].trim())})>`, node, depth, root) : null;
      return { source: match ? `${match[1]} = ${stringValue(match[2].trim())}` : source, item };
    }
    function analyze(list, depth, root) {
      for (const node of list) {
        const plan = {}; plans.set(node.id, plan);
        if (node.kind === 'declare') {
          if (!types.includes(node.type) || !['value','pointer','reference'].includes(node.mode)) fail('Tipo di variabile non valido.', node.id);
          const name = identifier(node.name, 'Nome variabile', node.id);
          plan.size = expression(node.size ?? '', 'Dimensione array', node.id, false);
          plan.init = expression(node.init ?? '', 'Valore iniziale', node.id, false);
          if (plan.size && node.mode !== 'value') fail('Scegli variabile semplice per dichiarare un array.', node.id);
          if ((node.constant || node.mode === 'reference') && !plan.init) fail('Costanti e riferimenti richiedono un valore iniziale.', node.id);
          if (/^\d+$/.test(plan.size) && (+plan.size < 1 || +plan.size > 100)) fail('La dimensione deve essere tra 1 e 100.', node.id);
          // shortcut: array, const e alias restano dichiarazioni nel corpo principale; estendere quando serviranno inizializzazioni condizionali di questi oggetti.
          if (!cppScope && depth > 1 && (plan.size || node.constant || node.mode === 'reference'))
            fail('Inserisci le dichiarazioni di array, costanti e riferimenti prima del ramo o del ciclo, nel corpo della subroutine.', node.id);
          plan.item = register(name, `${node.constant ? 'const ' : ''}${node.type} ${node.mode === 'pointer' ? '*' : node.mode === 'reference' ? '&' : ''}`.trim(), node, depth, root, true);
        } else if (node.kind === 'assign') plan.rows = rows(node.expression, 'Assegnamenti', node.id).map(row => assignment(row, node, depth, root));
        else if (node.kind === 'input') {
          plan.rows = rows(node.target, 'Variabili da leggere', node.id).map(row => {
            const typed = /^(int|float|double|char|bool|string)\s+(.+)$/.exec(row);
            const target = (typed ? typed[2] : row).trim();
            if (!/^[A-Za-z_]\w*(?:\[[^\[\]]+\])?$/.test(target)) fail('Input: scrivi una variabile o una cella per riga, per esempio base, int base oppure v[i].', node.id);
            if (target.includes('[')) {
              if (typed) fail('Dichiara prima tipo e dimensione dell’array, poi leggi le sue celle senza tipo.', node.id);
              if (!symbols.has(target.split('[')[0])) fail('Dichiara l’array prima di leggere le sue celle.', node.id);
            }
            const item = !target.includes('[') ? register(target, typed?.[1] || (node.mode==='line'?'string':'double'), node, depth, root) : null;
            const known = symbols.get(target);
            if (typed && !item && types.includes(known?.type) && typed[1] !== known.type) fail(`${target} è già di tipo ${known.type}: il tipo rimane stabile.`, node.id);
            if(node.mode==='line'&&known&&types.includes(known.type)&&known.type!=='string')fail('getline richiede una variabile di tipo string.',node.id);
            return { target, item };
          });
        } else if (node.kind === 'call') {
          const callee = functions.get(node.callee);
          if (!callee || callee.id === 'main') fail('Scegli una funzione o procedura esistente.', node.id);
          const result = expression(node.result ?? '', 'Destinazione risultato', node.id, false);
          if (result && callee.returnType === 'void') fail('Una procedura void non restituisce un risultato.', node.id);
          plan.item = /^[A-Za-z_]\w*$/.test(result) ? register(result, callee.returnType, node, depth, root) : null;
          if(node.declareType!==undefined) {
            if(!cppScope||!types.includes(node.declareType)||!result)fail('Dichiarazione del risultato non valida.',node.id);
            plan.item=register(result,(node.constant?'const ':'')+node.declareType,node,depth,root,true);
          }
        } else if (node.kind === 'for') plan.initialization = node.init.trim() ? assignment(node.init, node, depth + 1, root, true) : null;
        for (const key of ['then','else','body']) if (Array.isArray(node[key])) analyze(node[key], depth + 1, root);
      }
    }
    function sequence(list, fn, depth, loops = 0) {
      const indent = '    '.repeat(depth);
      for (const node of list) {
        const expr = (key, label, required = true) => expression(node[key] ?? '', label, node.id, required);
        const out = line => emit(indent + line, fn, node.id);
        const plan = plans.get(node.id);
        if (depth === 1) for (const item of hoists.get(node.id) || []) {
          const descriptor = { line: emit(indent + `${item.type} ${item.name};`, fn, item.node, 'prepare') };
          deferred.push(descriptor); item.descriptor = descriptor;
        }
        const assigned = row => row.item && !row.item.deferred ? `${row.item.type} ${row.source}` : row.source;
        if (node.kind === 'declare') {
          const { item, size, init } = plan;
          if (item.deferred) {
            const line = out(init ? `${item.name} = ${init};` : `(void)${item.name};`);
            if (!init) item.descriptor.activate = line;
          } else out(`${item.type} ${item.name}${size ? '[' + size + ']' : ''}${init ? ' = ' + (size ? '{' + init + '}' : init) : ''};`);
        } else if (node.kind === 'input') {
          if (node.prompt) out(`cout << ${JSON.stringify(node.prompt)};`);
          for (const row of plan.rows) {
            if (row.item && !row.item.deferred) out(`${row.item.type} ${row.item.name};`);
            if(node.grouping!=='chain'||node.mode==='line')out(node.mode==='line'?`getline(cin, ${row.target});`:`cin >> ${row.target};`);
          }
          if(node.grouping==='chain'&&node.mode!=='line')out('cin >> '+plan.rows.map(row=>row.target).join(' >> ')+';');
        } else if (node.kind === 'output') {
          const outputs = rows(node.expression, 'Espressioni da mostrare', node.id);
          out('cout' + outputs.map(row => ` << (${row})`).join('') + (node.ending === 'OUT' ? '' : ' << endl') + ';');
        } else if (node.kind === 'assign') for (const row of plan.rows) out(assigned(row) + ';');
        else if (node.kind === 'call') {
          const callee = functions.get(node.callee);
          if (!callee || callee.id === 'main') fail('Scegli una funzione o procedura esistente.', node.id);
          const result = expr('result', 'Destinazione risultato', false);
          if (result && callee.returnType === 'void') fail('Una procedura void non restituisce un risultato.', node.id);
          out(`${plan.item && !plan.item.deferred ? plan.item.type + ' ' : ''}${result ? result + ' = ' : ''}${callee.name}(${expr('args', 'Argomenti', false)});`);
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
          out(node.kind === 'for' ? `for (${plan.initialization?.source || ''}; ${expr('condition', 'Condizione')}; ${expr('update', 'Aggiornamento', false)}) {`
            : `while (${expr('condition', 'Condizione')}) {`);
          sequence(node.body, fn, depth + 1, loops + 1); out('}');
        }
      }
    }
    function hasReturn(list) { return list.some(n => n.kind === 'return' || ['then', 'else', 'body'].some(key => Array.isArray(n[key]) && hasReturn(n[key]))); }
    for (const fn of ordered) {
      if (fn.id !== 'main' && fn.returnType !== 'void' && !hasReturn(fn.body)) fail(`Aggiungi Restituisci nella funzione ${fn.name}.`, fn.id);
      symbols = new Map(fn.params.map(p => [p.name, {type:p.type}])); plans = new Map(); hoists = new Map();
      for (const node of fn.body) analyze([node], 1, node.id);
      emit(signature(fn) + ' {', fn, fn.id + ':start', 'start');
      sequence(fn.body, fn, 1);
      if (fn.id === 'main') emit('    return 0;', fn, fn.id + ':end', 'end');
      emit('}', fn, fn.id + ':end', 'end'); emit('');
    }
    const code = lines.join('\n');
    if (new TextEncoder().encode(code).length > 30000) fail('Il diagramma genera più di 30.000 byte di C++: riduci i blocchi.');
    return { code, lineMap, flow: { deferred } };
  }
  function label(node, document) {
    if (node.kind === 'declare') return `${node.constant ? 'const ' : ''}${node.type} ${node.mode === 'pointer' ? '*' : node.mode === 'reference' ? '&' : ''}${node.name || 'nome'}${node.size ? '[' + node.size + ']' : ''}${node.init ? ' = ' + (node.size ? '{' + node.init + '}' : node.init) : ''}`;
    if (node.kind === 'input') return 'INPUT\n' + (node.target || 'variabile');
    if (node.kind === 'output') return (node.ending || 'OUTLN') + '\n' + node.expression;
    if (node.kind === 'for') return forParts(node).map(part => part.text).join('; ');
    if (['if', 'while', 'do'].includes(node.kind)) return (node.kind === 'if' ? '' : kinds[node.kind] + '\n') + (node.condition || 'condizione');
    if (node.kind === 'call') return `${node.declareType ? (node.constant?'const ':'')+node.declareType+' ' : ''}${node.result ? node.result + ' = ' : ''}${document.functions.find(fn => fn.id === node.callee)?.name || 'subroutine'}(${node.args || ''})`;
    if (node.kind === 'return') return 'Restituisci ' + node.expression;
    return node.expression || kinds[node.kind];
  }
  function blockLines(text, width = 28, maximum = 6) {
    const wrapped = text.split('\n').flatMap(line => line.match(new RegExp('.{1,'+width+'}(?:\\s|$)|.{1,'+width+'}', 'g')) || ['']);
    const visible = wrapped.slice(0, maximum).map(line => line.trim());
    if (wrapped.length > maximum) visible[maximum - 1] = visible[maximum - 1].slice(0, width - 1) + '…';
    return visible;
  }
  const shapeFor = kind => kind === 'for' ? 'for' : ['if','while','do'].includes(kind) ? 'decision' : ['input','output'].includes(kind) ? 'io' : kind === 'call' ? 'call' : 'process';
  const forParts = node => [
    { key:'init', label:'Inizializzazione', text:node.init || '—' },
    { key:'condition', label:'Condizione', text:node.condition || 'condizione' },
    { key:'update', label:'Incremento', text:node.update || '—' }
  ];
  const visualLines = (text, shape) => shape === 'for'
    ? [text]
    : blockLines(text, shape === 'decision' ? 20 : 28, shape === 'decision' ? 3 : 6);
  function dimensions(shape, text) {
    return { width: shape === 'join' ? 12 : shape === 'for' ? Math.max(320, text.length * 8 + 80) : 240,
      height: shape === 'join' ? 12 : shape === 'decision' ? 90
        : Math.max(shape === 'terminal' ? 44 : 62, visualLines(text, shape).length * 16 + (shape === 'terminal' ? 20 : 28)) };
  }
  function insertAt(document, position, kind) {
    if (!Object.hasOwn(kinds, kind) || !position || !Number.isInteger(position.index)) fail('Punto di inserimento non valido.');
    const fn = document.functions.find(fn => fn.id === position.fn);
    const parent = position.parent ? locate(document, position.parent) : null;
    if (!fn || position.parent && parent?.fn.id !== fn.id || !['body','then','else'].includes(position.branch)) fail('Punto di inserimento non valido.');
    const list = position.parent ? parent.node[position.branch] : position.branch === 'body' ? fn.body : null;
    if (!Array.isArray(list) || position.index < 0 || position.index > list.length) fail('Punto di inserimento non valido.');
    const node = newNode(kind);
    if (kind === 'call') node.callee = document.functions.find(f => f.id !== 'main')?.id || '';
    list.splice(position.index, 0, node);
    try { validate(document); } catch (error) { list.splice(position.index, 1); throw error; }
    return node;
  }
  function pathBetween(graph, from, to, outcome = null) {
    const joins=new Set(graph.nodes.filter(node=>node.shape==='join').map(node=>node.id));
    const queue=[{node:from,path:[]}], seen=new Set([from]);
    for(let cursor=0;cursor<queue.length;cursor++) {
      const current=queue[cursor];
      for(const [index,edge] of graph.edges.entries()) {
        if(edge.from!==current.node || current.node===from && outcome!==null && edge.outcome && edge.outcome!==String(outcome))continue;
        const path=current.path.concat(index);
        if(edge.to===to)return path;
        if(joins.has(edge.to)&&!seen.has(edge.to)){seen.add(edge.to);queue.push({node:edge.to,path});}
      }
    }
    return [];
  }
  function layout(document, functionId) {
    validate(document);
    const fn = document.functions.find(f => f.id === functionId) || document.functions[0];
    const nodes = [], edges = [], gap = 38;
    const measures = new Map();
    function measure(list) {
      const result = { width: 240, height: 0 };
      for (const n of list) {
        const head = dimensions(shapeFor(n.kind), label(n, document));
        let size = { ...head };
        if (n.kind === 'if') {
          const left = measure(n.then), right = measure(n.else);
          size = { width: left.width + right.width + 80, height: 90 + gap + Math.max(left.height, right.height, 28) + 55 };
        } else if (['while', 'for', 'do'].includes(n.kind)) {
          const body = measure(n.body);
          size = { width: Math.max(head.width + 120, body.width + 140), height: head.height + (n.kind === 'while' ? 58 : gap) + Math.max(body.height, 28) + 65 };
        }
        measures.set(n.id, size); result.width = Math.max(result.width, size.width); result.height += size.height + gap;
      }
      return result;
    }
    const total = measure(fn.body), center = total.width / 2 + 35;
    const addNode = (nodeId, x, y, shape, text_, owner = nodeId) => {
      const n = { id: nodeId, owner, x, y, ...dimensions(shape, text_), shape, text: text_ };
      nodes.push(n); return n;
    };
    const edge = (from, to, points, owner = null, outcome = null, text_ = '', insertion = null, arrow = null) => edges.push({ from, to, points, owner, outcome, text: text_, insertion, arrow });
    const byId = key => nodes.find(n => n.id === key);
    const connect = (from, to, insertion = null, arrow = null) => { if (from) { const a = byId(from), b = byId(to); edge(from, to, [[a.x,a.y+a.height], [b.x,b.y]], null, null, '', insertion, arrow); } };
    const position = (parent, branch, index) => ({ fn: fn.id, parent, branch, index });
    function sequence(list, x, y, context, parent = null, branch = 'body') {
      let first = null, tail = null;
      for (const [index, n] of list.entries()) {
        const size = measures.get(n.id); let entry, exit;
        if (n.kind === 'if') {
          entry = addNode(n.id,x,y,'decision',label(n,document));
          const leftSize = measure(n.then), rightSize = measure(n.else);
          const leftX = x - (rightSize.width + 80) / 2, rightX = x + (leftSize.width + 80) / 2;
          const left = sequence(n.then,leftX,y+90+gap,context,n.id,'then'), right = sequence(n.else,rightX,y+90+gap,context,n.id,'else');
          const join = addNode(n.id+':merge',x,y+size.height-12,'join','',n.id);
          for (const [outcome, bx, result, key] of [['true',leftX,left,'then'],['false',rightX,right,'else']]) {
            const destination = result.first ? byId(result.first) : join;
            edge(n.id,destination.id,[[x+(outcome==='true'?-120:120),y+45],[bx,y+45],[bx,destination.y],[destination.x,destination.y]],n.id,outcome,outcome==='true'?'Vero':'Falso',position(n.id,key,0));
            if (result.tail) { const t=byId(result.tail); edge(t.id,join.id,[[t.x,t.y+t.height],[t.x,join.y],[x,join.y]],null,null,'',position(n.id,key,n[key].length)); }
          }
          exit = left.first && !left.tail && right.first && !right.tail ? null : join.id;
        } else if (['while','for','do'].includes(n.kind)) {
          const isDo = n.kind==='do';
          entry = isDo ? addNode(n.id+':entry',x,y,'join','',n.id) : addNode(n.id,x,y,shapeFor(n.kind),label(n,document));
          if(n.kind==='for')entry.parts=forParts(n);
          const bodyY = y+entry.height+(n.kind==='while'?58:gap);
          const body = sequence(n.body,x,bodyY,{...context, breakId:n.id+':exit',continueId:n.id,continueLabel:n.kind==='for'?n.update:''},n.id,'body');
          const diamond = isDo ? addNode(n.id,x,y+size.height-90-35,'decision',label(n,document)) : entry;
          const join = addNode(n.id+':exit',x,y+size.height-12,'join','',n.id);
          const rightX=x+size.width/2-15, leftX=x-size.width/2+15;
          if (body.first) {
            const b=byId(body.first);
            edge(entry.id,b.id,[[x,entry.y+entry.height],[x,b.y]],n.id,isDo?null:'true',isDo?'':'Vero',position(n.id,'body',0),n.kind==='while'?'source-down':null);
            if(body.tail){const t=byId(body.tail); edge(t.id,diamond.id,isDo?[[x,t.y+t.height],[x,diamond.y]]:[[x,t.y+t.height],[x,t.y+t.height+18],[leftX,t.y+t.height+18],[leftX,diamond.y+diamond.height/2],[x-diamond.width/2,diamond.y+diamond.height/2]],n.id,null,'',position(n.id,'body',n.body.length),isDo?'target-down':null);}
          } else if(isDo) connect(entry.id,diamond.id,position(n.id,'body',0),'target-down');
          else {
            const empty=addNode(n.id+':body',x,bodyY,'join','',n.id);
            edge(diamond.id,empty.id,[[x,y+diamond.height],[x,empty.y]],n.id,'true','Vero',position(n.id,'body',0),n.kind==='while'?'source-down':null);
            edge(empty.id,diamond.id,[[x,empty.y+empty.height],[x,empty.y+empty.height+18],[leftX,empty.y+empty.height+18],[leftX,y+diamond.height/2],[x-diamond.width/2,y+diamond.height/2]],n.id,null,'',position(n.id,'body',0));
          }
          if(isDo) edge(diamond.id,entry.id,[[x-120,diamond.y+45],[leftX,diamond.y+45],[leftX,y+6],[x,y+6]],n.id,'true','Vero',position(n.id,'body',0));
          edge(diamond.id,join.id,isDo?[[x,diamond.y+90],[x,join.y]]:[[x+diamond.width/2,y+diamond.height/2],[rightX,y+diamond.height/2],[rightX,join.y],[x,join.y]],n.id,'false','Falso',position(parent,branch,index+1));
          exit=join.id;
        } else {
          entry=addNode(n.id,x,y,shapeFor(n.kind),label(n,document));
          exit=entry.id;
          const target=n.kind==='return'?context.returnId:n.kind==='break'?context.breakId:n.kind==='continue'?context.continueId:null;
          if(target){edge(entry.id,target,[[x,y+entry.height],[x+size.width/2+25,y+entry.height+18]],null,null,n.kind==='continue'&&context.continueLabel?'continue · '+context.continueLabel:n.kind);edges.at(-1).jump=true;exit=null;}
        }
        if(!first) first=entry.id;
        connect(tail,entry.id,position(parent,branch,index)); tail=exit; y+=size.height+gap;
      }
      return {first,tail,y};
    }
    const start=addNode(fn.id+':start',center,20,'terminal','INIZIO '+fn.name+'()');
    const body=sequence(fn.body,center,start.y+start.height+gap,{returnId:fn.id+':end'});
    const end=addNode(fn.id+':end',center,body.y,'terminal','FINE '+fn.name+'()');
    connect(start.id,body.first||end.id,position(null,'body',0)); connect(body.tail,end.id,position(null,'body',fn.body.length));
    for(const e of edges) {
      const destination=byId(e.to);
      if(destination && e.jump) {
        const lane=center+total.width/2+20;
        e.points=[[e.points[0][0],e.points[0][1]],[lane,e.points[0][1]+15],[lane,destination.y+destination.height/2],[destination.x+destination.width/2,destination.y+destination.height/2]];
      }
      if(e.arrow) {
        const [x,y]=e.arrow==='source-down'?e.points[0]:e.points.at(-1);
        const tip=y+(e.arrow==='source-down'?18:0);
        e.head=[[x-7,tip-11],[x+7,tip-11],[x,tip]];
      }
    }
    return {nodes,edges,width:total.width+100,height:end.y+end.height+30};
  }
  function example() {
    const doc = blank(), make = (kind, fields) => Object.assign(newNode(kind), fields);
    const fn = { id: id(), name: 'calcolaArea', returnType: 'int', params: [
      { name: 'b', type: 'int', mode: 'value' }, { name: 'h', type: 'int', mode: 'value' }], body: [
      make('assign', { expression: 'risultato = b * h' }), make('return', { expression: 'risultato' })] };
    doc.functions.push(fn);
    doc.functions[0].body = [make('input', { target: 'int base', prompt: 'Inserisci base: ' }),
      make('input', { target: 'int altezza', prompt: 'Inserisci altezza: ' }),
      make('call', { callee: fn.id, args: 'base, altezza', result: 'area' }),
      make('output', { expression: '"Area: "\narea' })];
    return doc;
  }
  return { types, kinds, blank, newNode, id, FlowError, validate, generate, label, forParts, blockLines, shapeFor, visualLines, insertAt, pathBetween, layout, locate, example };
})();
if (typeof module !== 'undefined') module.exports = FlowchartCore;

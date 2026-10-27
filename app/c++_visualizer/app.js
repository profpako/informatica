'use strict';
import {request as requestAPI, storagePrefix, connectionError} from './transport.js';
const $ = id => document.getElementById(id);
const code = $('code'), input = $('input'), programName = $('program-name');
let token = '', examples = [], steps = [], position = 0, timer = null, version = 0, retainedMemory = null;
let selectedVariable = null, lastRenderedStep = null, retainedCalls = null;
let manualSession = null, resumeAfterInput = false;
let configurationDone;
const configurationReady = new Promise(resolve => { configurationDone = resolve; });
const roleLabels = { input: 'Input', output: 'Output', inout: 'Input/Output', work: 'Lavoro' };
const storage = {
  get(key) { try { return localStorage.getItem(storagePrefix + key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(storagePrefix + key, value); } catch { /* L'editor funziona anche senza storage. */ } }
};
let mode = 'cpp';
const flowEditor = new FlowchartEditor($('flow-pane'), {
  sourceRoot: $('flow-code-pane'),
  fileRoot: $('flow-file-actions'),
  async resolveSource(generated) {
    if (!/^\s*std::decay_t<decltype\(/m.test(generated.code)) return generated;
    await configurationReady;
    if (!token) throw new Error('Il motore non è pronto. Ricarica la pagina.');
    const response = await requestAPI('/api/flowchart-source', {method:'POST', headers:{'Content-Type':'application/json','X-Visualizer-Token':token}, body:JSON.stringify({code:generated.code, standard:$('cpp-standard').value})});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Impossibile generare il C++.');
    if (typeof result.code !== 'string' || result.code.split('\n').length !== generated.code.split('\n').length)
      throw new Error('Sorgente generato non valido: la mappa delle righe non coincide.');
    return {...generated, code:result.code};
  },
  saved: storage.get('flowchart'),
  onChange(document, metadataOnly = false) {
    storage.set('flowchart', document);
    if (mode === 'flow' && !metadataOnly) { programName.value = JSON.parse(document).title || ''; invalidate(); }
  },
  onEdit() { invalidate(); }
});
function setMode(next, initial = false) {
  if (!initial && mode === next) return;
  if (!initial) storage.set(mode === 'cpp' ? 'input' : 'flow-input', input.value);
  mode = next;
  document.body.classList.toggle('flow-mode', mode === 'flow');
  $('cpp-pane').hidden = $('cpp-examples').hidden = mode === 'flow';
  $('flow-pane').hidden = mode !== 'flow';
  $('flow-code-pane').hidden = mode !== 'flow';
  $('flow-file-actions').hidden = mode !== 'flow';
  $('mode-cpp').setAttribute('aria-pressed', String(mode === 'cpp'));
  $('mode-flow').setAttribute('aria-pressed', String(mode === 'flow'));
  $('program-language').textContent = mode === 'flow' ? 'Diagramma a blocchi' : 'C++'+$('cpp-standard').value;
  programName.value = mode === 'flow' ? flowEditor.document.title || '' : storage.get('program-name') || '';
  input.value = storage.get(mode === 'cpp' ? 'input' : 'flow-input') ?? '';
  storage.set('mode', mode);
  if (!initial) invalidate();
}
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function pause() {
  if (timer) clearInterval(timer);
  timer = null;
  $('play').textContent = '▶';
  $('play').setAttribute('aria-label', 'Riproduci automaticamente');
}
function updateLines() {
  $('gutter').replaceChildren(...code.value.split('\n').map((_, i) => element('span', i + 1)));
  $('gutter').scrollTop = code.scrollTop;
}
function setRunHint(text, visible = true) {
  $('run-hint').textContent = text; $('run-hint').hidden = !visible;
}
function controls() {
  const absent = !steps.length;
  $('first').disabled = $('prev').disabled = absent || position === 0;
  $('last').disabled = $('next').disabled = absent || position === steps.length - 1;
  $('play').disabled = absent || steps.length < 2;
  $('timeline').disabled = absent;
  $('timeline').max = Math.max(0, steps.length - 1);
  $('timeline').value = position;
  $('counter').textContent = absent ? 'Nessuna esecuzione' : `Passo ${position + 1} di ${steps.length}`;
  $('timeline').setAttribute('aria-valuetext', $('counter').textContent);
  $('timeline-number').hidden = absent;
  $('timeline-number').value = position + 1;
  const fraction = steps.length > 1 ? position / (steps.length - 1) : 0;
  $('timeline-number').style.left = `clamp(22px, calc(${fraction * 100}% + ${8 - 16 * fraction}px), calc(100% - 22px))`;
}
function invalidate() {
  cancelManual();
  version++;
  pause();
  steps = []; position = 0;
  selectedVariable = null;
  flowEditor.clearTrace(); flowEditor.setRunning(false);
  renderCondition(null, null);
  code.hidden = false; $('code-view').hidden = true; $('edit').hidden = true;
  $('source-status').textContent = 'Codice modificabile';
  setRunHint('Avvia per osservare il programma aggiornato.', false);
  renderMemory(retainedMemory || { frames: [], variables: [] }, null, !!retainedMemory, retainedCalls);
  $('output').textContent = '';
  $('input-progress').hidden = true;
  $('step-description').replaceChildren(element('p', 'Codice o input modificati. Avvia una nuova esecuzione.'));
  $('error').hidden = true; $('warnings-box').hidden = true;
  if (mode === 'cpp') storage.set('code', code.value);
  storage.set(mode === 'cpp' ? 'input' : 'flow-input', input.value);
  updateLines(); controls();
}
function displayValue(cell, variable) {
  if (!cell.initialized) return '?';
  if (typeof cell.value === 'string' && !(cell.pointer ?? variable.pointer)) return JSON.stringify(cell.value);
  if (typeof cell.value === 'object' && cell.value !== null) return JSON.stringify(cell.value);
  return String(cell.value);
}
function cellLink(label, variable, index = 0) {
  const button = element('button', label, 'cell-link');
  button.type = 'button';
  button.addEventListener('click', () => {
    pause();
    const target = $(`cell-${variable.id}-${index}`);
    document.querySelectorAll('.destination').forEach(n => n.classList.remove('destination'));
    target?.classList.add('destination');
    target?.scrollIntoView({ block: 'nearest' });
  });
  return button;
}
function qualifiedName(variable, step) {
  const frame = step.frames.find(f => f.id === variable.frame);
  return `${frame ? frame.name + '() #' + frame.id : 'Globali/statiche'} · ${variable.name}`;
}
function renderLinks(step, frozen) {
  const panel = $('call-links'); panel.replaceChildren();
  const selected = step.variables.find(v => v.id === selectedVariable);
  const related = selected ? step.variables.filter(v => v.id === selected.id && (v.origin || v.pointer || v.reference)
    || v.origin?.sourceId === selected.id) : [];
  panel.hidden = !related.length;
  if (!related.length) return;
  panel.append(element('h3', 'Collegamenti di ' + selected.name));
  if (frozen) panel.append(element('p', 'Fotografia finale: questi collegamenti descrivono lo stato prima della conclusione.', 'link-note'));
  for (const variable of related) {
    const relation = element('div', undefined, 'parameter-relation');
    const origin = variable.origin;
    if (origin) {
      const source = step.variables.find(v => v.id === origin.sourceId);
      const kind = origin.kind;
      relation.append(element('strong', kind === 'value' ? 'Copia del valore' : kind === 'address' ? "Copia dell’indirizzo" : 'Riferimento: stessa cella'));
      const flow = element('div', undefined, 'link-flow ' + (kind === 'reference' ? 'shared-flow' : 'copy-flow'));
      const label = source ? qualifiedName(source, step).replace(/ · [^·]+$/, ' · ' + origin.expression)
        : origin.expression || 'argomento';
      flow.append(source ? cellLink(label, source, origin.sourceIndex) : element('code', label),
        element('span', kind === 'reference' ? '↔' : '⇢', 'flow-arrow'), cellLink(qualifiedName(variable, step), variable));
      relation.append(flow);
      const initial = displayValue({ initialized: origin.initialized, value: origin.value }, variable);
      relation.append(element('p', kind === 'reference' ? 'Nessuna copia: il parametro è un alias dell’oggetto ricevuto.'
        : `Alla chiamata: ${initial}. ` + (kind === 'address' ? 'L’indirizzo è copiato in una cella distinta del puntatore.' : 'Il parametro occupa una cella distinta; le modifiche successive sono indipendenti.'), 'link-note'));
    }
    if (variable.pointer || variable.reference) {
      const cell = variable.cells[0], address = variable.reference ? cell.address : cell.value;
      const targets = [...step.variables].sort((a, b) => Number(a.reference) - Number(b.reference));
      const target = targets.find(v => v.id !== variable.id && v.cells.some(c => c.address === address));
      const current = element('div', undefined, 'current-target');
      current.append(element('span', variable.reference ? 'Alias attuale: ' : 'Destinazione attuale: '));
      if (target) {
        const index = target.cells.findIndex(c => c.address === address);
        current.append(element('span', variable.name + ' ──▶ '), cellLink(qualifiedName(target, step) + cellPath(target, index), target, index));
      } else current.append(element('span', !cell.initialized ? 'non inizializzata' : address === '0x0' ? 'nullptr: nessuna cella' : 'temporaneo o memoria non attiva'));
      relation.append(current);
      if (variable.pointer) relation.append(element('p', variable.reference
        ? `Questo alias condivide il puntatore del chiamante: modificare ${variable.name} modifica anche quel puntatore; *${variable.name} agisce sul dato puntato.`
        : `Modificare ${variable.name} cambia ${variable.parameter ? 'il puntatore locale' : 'l’indirizzo nel puntatore'}; modificare *${variable.name} cambia il dato puntato.`, 'link-note'));
    }
    panel.append(relation);
  }
}
function completedCalls(trace, until) {
  const calls = new Map();
  for (let index = 0; index <= until; index++) {
    const record = trace[index].lastCall;
    if (record && !calls.has(record.frame)) calls.set(record.frame, {
      ...record, endedAt: index,
      variables: trace[record.step].variables.filter(v => v.frame === record.frame)
    });
  }
  return [...calls.values()];
}
function renderCompletedCalls(records) {
  const details = $('completed-calls'), content = $('completed-calls-list');
  const calls = records || [];
  details.hidden = !calls.length;
  if (!calls.length) { details.open = false; content.replaceChildren(); return; }
  const opened = new Set([...content.querySelectorAll('details[open]')].map(node => node.dataset.frame));
  const scroll = content.scrollTop;
  $('completed-calls-title').textContent = `Chiamate concluse (${calls.length})`;
  content.replaceChildren();
  for (const record of calls) {
    const item = element('details', undefined, 'call-record');
    item.dataset.frame = record.frame;
    item.open = opened.has(String(record.frame));
    item.append(element('summary', `${record.name}() · Chiamata #${record.frame} · conclusa al passo ${record.endedAt + 1}`));
    const photo = element('div', undefined, 'call-photo');
    renderRetiredVariables(record, photo);
    item.append(photo); content.append(item);
  }
  content.scrollTop = scroll;
}
function renderRetiredVariables(record, content) {
  if (!record.variables.length) content.append(element('p', 'La chiamata non aveva variabili locali da mostrare.', 'no-vars'));
  for (const variable of record.variables) {
    const row = element('div', undefined, 'var-row retired-variable');
    const heading = element('div', undefined, 'var-header');
    heading.append(element('span', variable.name, 'var-name'), element('span', variable.type, 'type'));
    row.append(heading, element('small', variable.reference ? 'Alias concluso' : 'Variabile non più allocata', 'retired-label'));
    row.append(renderCells(variable)); content.append(row);
  }
}
function cellPath(variable, index) {
  return variable.cells[index].path ?? (variable.array ? `[${index}]` : '');
}
function renderCells(variable, previous, names) {
  const scroll = element('div', undefined, 'cells-scroll');
  const cells = element('div', undefined, 'cells');
  const matrix = variable.dimensions?.length === 2 && variable.cells.length === variable.dimensions[0] * variable.dimensions[1];
  if (matrix) {
    cells.classList.add('matrix');
    cells.style.setProperty('--columns', variable.dimensions[1]);
    scroll.setAttribute('aria-label', `${variable.name}: ${variable.dimensions[0]} righe, ${variable.dimensions[1]} colonne`);
  }
  if (matrix || variable.cells.length > 100) {
    scroll.tabIndex = 0; scroll.setAttribute('role', 'region');
    if (!matrix) scroll.setAttribute('aria-label', 'Celle di ' + variable.name);
  }
  variable.cells.forEach((cell, i) => {
    const oldCell = previous?.cells[i];
    const changed = oldCell && (cell.initialized !== oldCell.initialized || cell.value !== oldCell.value);
    const box = element('div', undefined, 'cell' + (changed ? ' changed' : ''));
    if (names) box.id = `cell-${variable.id}-${i}`;
    const path = cellPath(variable, i);
    if (path) box.append(element('span', path, 'index'));
    if (path.includes('.')) box.append(element('span', cell.type, 'type'));
    box.title = `${variable.name}${path}: ${cell.type || variable.type}`;
    box.append(element('span', displayValue(cell, variable), 'value' + (!cell.initialized ? ' uninitialized' : '')));
    if (changed) box.append(element('span', 'cambiato', 'changed-tag'));
    if ($('addresses').checked) box.append(element('span', cell.address, 'address'));
    if (names && cell.pointer && cell.path) {
      const destination = names.get(cell.value);
      if (destination) box.append(cellLink('↗ ' + destination.label, destination.variable, destination.index));
    }
    cells.append(box);
  });
  scroll.append(cells);
  return scroll;
}
function describe(step) {
  if (step.inputRequest) return `Riga ${step.line}. In attesa del valore di ${step.inputRequest.target} (${step.inputRequest.type}).`;
  const line = `Riga ${step.line}. `;
  if (step.error) return line + step.error;
  if (step.event === 'fine') return $('memory-clear').value === 'next-run'
    ? 'Esecuzione terminata. La fotografia della memoria resta visibile fino alla prossima esecuzione.'
    : 'Esecuzione terminata. La memoria visualizzata è stata svuotata.';
  if (step.event === 'prima') return line + 'Prima di eseguire questa istruzione: osserva lo stato delle variabili.';
  if (step.event === 'dichiarazione') return line + 'Dichiarazione eseguita: le nuove variabili sono visibili in memoria.';
  if (step.event === 'eseguita') return line + 'Istruzione eseguita. Le celle evidenziate hanno un valore diverso dal passo precedente.';
  if (step.event === 'ritorno') return line + `La funzione restituisce ${step.returnValue}. I suoi parametri e le variabili locali sono ancora visibili.`;
  if (step.event.startsWith('chiamata a ')) return line + 'Ingresso nella funzione ' + step.event.slice(11) + ': osserva i parametri nel nuovo frame.';
  if (step.event.startsWith('uscita da ')) return line + 'Chiamata a ' + step.event.slice(10) + ' conclusa. Le variabili locali della chiamata non sono più attive.';
  if (step.event.startsWith('condizione')) return line + (step.event.endsWith('vera') ? 'La condizione è vera.' : 'La condizione è falsa.');
  return line + step.event + '.';
}
function renderCondition(step, previous) {
  const panel = $('condition-panel'); panel.replaceChildren(); panel.hidden = true;
  document.querySelectorAll('.condition-true,.condition-false,.branch-destination').forEach(node =>
    node.classList.remove('condition-true', 'condition-false', 'branch-destination'));
  if (!$('conditions').checked || !step || step.error) return;
  const following = !step.condition && step.event === 'prima' && previous?.condition
    && step.frames.at(-1)?.id === previous.condition.frame;
  const condition = step.condition || (following ? previous.condition : null);
  if (!condition) return;
  panel.hidden = false;
  const kind = condition.kind === 'do' ? 'do…while' : condition.kind;
  const jumping = condition.action !== 'test';
  panel.className = 'condition-panel ' + (jumping ? 'jump' : condition.result ? 'pass' : 'fail');
  panel.append(element('h3', jumping ? `${kind} · ${condition.action}` : `${kind} · Controllo #${condition.number}`));
  panel.append(element('code', condition.expression, 'condition-expression'));
  if (!jumping && condition.values.length) {
    panel.append(element('p', 'Con i valori letti: ' + condition.expanded, 'condition-values'));
    panel.append(element('small', condition.values.map(v => `${v.expression} = ${v.text}`).join(' · '), 'condition-operands'));
  }
  let decision;
  if (condition.action === 'break') decision = 'Uscita tramite break: la condizione non viene rivalutata.';
  else if (condition.action === 'continue') decision = condition.kind === 'for'
    ? 'Continue → aggiornamento del contatore, poi nuovo controllo.'
    : 'Continue → vai al controllo della condizione.';
  else if (condition.kind === 'if') decision = condition.result ? `VERA → esegui il ramo if (riga ${condition.bodyLine}).`
    : condition.hasElse ? 'FALSA → esegui il ramo else.' : 'FALSA → salta il ramo if.';
  else decision = condition.result ? `VERA → ${condition.kind === 'do' ? 'ripeti' : 'esegui'} il corpo del ciclo (riga ${condition.bodyLine}).` : 'FALSA → esci dal ciclo.';
  panel.append(element('strong', decision, 'condition-decision'));
  if (condition.hasShortCircuit && !jumping) panel.append(element('small', 'Cortocircuito: sono mostrati soltanto i valori realmente letti.', 'condition-operands'));
  if (!jumping) $('code-view').children[condition.line - 1]?.classList.add(condition.result ? 'condition-true' : 'condition-false');
  if (following) {
    panel.append(element('p', `Percorso seguito → riga ${step.line}.`, 'condition-values'));
    $('code-view').children[step.line - 1]?.classList.add('branch-destination');
  }
}
function showSource(line) {
  const lines = $('code-view').children;
  for (let i = 0; i < lines.length; i++) {
    lines[i].classList.toggle('active-line', i + 1 === line);
    $('gutter').children[i]?.classList.toggle('current', i + 1 === line);
  }
  const target = lines[line - 1];
  if (target) {
    const view = $('code-view');
    if (target.offsetTop < view.scrollTop || target.offsetTop + target.offsetHeight > view.scrollTop + view.clientHeight)
      view.scrollTop = Math.max(0, target.offsetTop - view.clientHeight / 3);
    $('gutter').scrollTop = view.scrollTop;
  }
  $('source-status').textContent = `Riga ${line} · Codice dell'esecuzione`;
}
function renderMemory(step, previous, frozen = false, concluded = null) {
  renderLinks(step, frozen);
  renderCompletedCalls(concluded);
  const old = new Map((previous?.variables || []).map(v => [v.id, v]));
  $('memory-state').hidden = !frozen;
  $('stack-note').textContent = frozen ? 'Fotografia finale. Nessuna chiamata è ancora attiva.'
    : step.frames.length ? 'La chiamata attiva è in alto.' : 'Nessuna chiamata attiva.';
  $('stack').replaceChildren();
  [...step.frames].reverse().forEach((frame, i) => {
    const li = element('li', undefined, 'stack-frame' + (!frozen && i === 0 ? ' active' : ''));
    li.append(element('strong', frame.name + '()'), element('small', frozen ? 'Chiamata conclusa' : `Chiamata #${frame.id}`));
    $('stack').append(li);
  });
  if (!step.frames.length) $('stack').append(element('li', 'Nessuna chiamata attiva.', 'placeholder'));
  const names = new Map();
  // Preferire l'oggetto originale al suo alias quando condividono un indirizzo.
  [...step.variables].sort((a, b) => Number(a.reference) - Number(b.reference)).forEach(v => {
    v.cells.forEach((c, i) => { if (!names.has(c.address)) names.set(c.address, { variable: v, index: i, label: v.name + cellPath(v, i) }); });
  });
  $('memory').replaceChildren();
  const groups = [...step.frames].reverse().map(f => ({ id: f.id, name: f.name + '()', note: frozen ? 'Fotografia finale' : `Chiamata #${f.id}` }));
  if (step.variables.some(v => v.frame === 0)) groups.push({ id: 0, name: 'Globali e statiche', note: 'Durata del programma' });
  for (const group of groups) {
    const section = element('section', undefined, 'scope');
    const heading = element('h3', group.name); heading.append(element('small', group.note));
    section.append(heading);
    const variables = step.variables.filter(v => v.frame === group.id);
    if (!variables.length) section.append(element('p', 'Nessuna variabile dichiarata in questo passo.', 'no-vars'));
    for (const variable of variables) {
      const row = element('div', undefined, 'var-row' + (variable.reference ? ' alias' : ''));
      row.id = 'var-' + variable.id;
      row.dataset.declaration = variable.declaration;
      row.dataset.role = variable.role || 'work';
      row.classList.toggle('selected-variable', variable.id === selectedVariable);
      row.setAttribute('aria-label', `${variable.name}: ${roleLabels[row.dataset.role]}`);
      row.title = `${variable.parameter ? 'Parametro' : 'Variabile'} di ${roleLabels[row.dataset.role].toLowerCase()}`;
      const header = element('div', undefined, 'var-header');
      const name = element('button', variable.name, 'var-name variable-select');
      name.type = 'button'; name.setAttribute('aria-label', 'Collegamenti di ' + qualifiedName(variable, step));
      name.setAttribute('aria-pressed', String(variable.id === selectedVariable));
      name.addEventListener('click', () => {
        pause(); selectedVariable = selectedVariable === variable.id ? null : variable.id; render();
        $('var-' + variable.id)?.querySelector('.variable-select')?.focus({ preventScroll: true });
      });
      header.append(name, element('span', variable.type, 'type'));
      row.append(header);
      row.append(renderCells(variable, old.get(variable.id), names));
      if (variable.reference || variable.pointer) {
        const cell = variable.cells[0];
        const destinationAddress = variable.reference ? cell.address : cell.value;
        const destination = names.get(destinationAddress);
        const connection = element('div', undefined, 'connection');
        connection.append(document.createTextNode(variable.reference ? '↗ Riferimento: alias di ' : '↗ Punta a '));
        if (destination && destination.variable.id !== variable.id) {
          connection.append(cellLink(destination.label, destination.variable, destination.index));
        } else connection.append(document.createTextNode(!cell.initialized ? 'destinazione non inizializzata' : destinationAddress === '0x0' ? 'nullptr' : variable.reference ? 'temporaneo o costante' : 'memoria non attiva'));
        row.append(connection);
      }
      section.append(row);
    }
    $('memory').append(section);
  }
  if (!groups.length) $('memory').append(element('p', 'Nessuna variabile da mostrare.', 'no-vars'));
}
function render() {
  renderManual();
  if (!steps.length) {
    flowEditor.clearTrace();
    renderCondition(null, null);
    if (retainedMemory) renderMemory(retainedMemory, null, true, retainedCalls);
    return;
  }
  const step = steps[position], previous = steps[position - 1];
  if (step !== lastRenderedStep && step.event.startsWith('chiamata a '))
    selectedVariable = step.variables.find(v => v.parameter && v.frame === step.frames.at(-1)?.id)?.id ?? null;
  lastRenderedStep = step;
  let concluded = completedCalls(steps, position);
  let memory = step;
  const frozen = step.event === 'fine' && $('memory-clear').value === 'next-run';
  if (frozen) {
    memory = [...steps].reverse().find(s => s.frames.length && s.frames[s.frames.length - 1].name === 'main') || step;
    retainedMemory = memory;
    retainedCalls = concluded;
  } else if (step.event === 'fine') {
    retainedMemory = null; retainedCalls = null; concluded = null;
    memory = { frames: [], variables: [] };
  }
  controls(); showSource(frozen ? memory.line : step.line);
  renderCondition(step, previous);
  $('output').textContent = step.console ?? step.output;
  const consumed = Math.max(0, step.inputConsumed || 0);
  $('input-progress').hidden = $('input-mode').value === 'manual' || !input.value;
  const readInput = new TextDecoder().decode(new TextEncoder().encode(input.value).slice(0, consumed));
  $('input-progress').textContent = 'Letto finora: ' + (readInput ? readInput.slice(0, 200).replaceAll('\n', ' ↵ ') : 'nessun dato');
  $('step-description').replaceChildren(element('span', '↳', 'step-marker'), element('p', describe(step)));
  renderMemory(memory, frozen ? null : previous, frozen, concluded);
  if (mode === 'flow') flowEditor.showTrace(steps, position, $('conditions').checked);
}
function seek(index) { resumeAfterInput = false; pause(); position = Math.max(0, Math.min(steps.length - 1, index)); render(); }
function cancelSession(session) {
  return requestAPI('/api/cancel', {method:'POST', keepalive:true, headers:{'Content-Type':'application/json','X-Visualizer-Token':token}, body:JSON.stringify({session})}).catch(() => {});
}
function cancelManual() {
  if (manualSession) cancelSession(manualSession);
  manualSession = null; resumeAfterInput = false;
  $('manual-input-form').hidden = true; $('cancel-manual').hidden = true;
  $('manual-value').disabled = $('submit-manual').disabled = false;
}
function syncInputMode() {
  const manual = $('input-mode').value === 'manual';
  $('input').hidden = $('prepared-input-label').hidden = manual;
  $('prepared-inputs').hidden = manual;
  $('manual-input-hint').hidden = !manual;
  if (manual) { $('input-mode').setAttribute('aria-describedby', 'manual-input-hint'); $('input-mode').title = $('manual-input-hint').textContent; }
  else { $('input-mode').removeAttribute('aria-describedby'); $('input-mode').removeAttribute('title'); }
}
function renderManual() {
  const request = manualSession && position === steps.length - 1 ? steps[position]?.inputRequest : null;
  $('manual-input-form').hidden = !request; $('cancel-manual').hidden = !manualSession;
  if (!request) return;
  if (timer) { resumeAfterInput = true; pause(); }
  $('manual-input-label').textContent = `Valore per ${request.target} (${request.type})`;
  $('manual-input-error').textContent = request.error;
  $('manual-input-error').hidden = !request.error;
  if ($('manual-input-form').dataset.request !== manualSession + ':' + request.number) {
    $('manual-input-form').dataset.request = manualSession + ':' + request.number;
    $('manual-value').value = ''; $('manual-value').focus({preventScroll:true});
    $('manual-input-form').scrollIntoView({block:'nearest'});
  }
}
$('input-mode').addEventListener('change', () => { storage.set('input-mode', $('input-mode').value); syncInputMode(); invalidate(); });
$('cancel-manual').addEventListener('click', invalidate);
window.addEventListener('pagehide', cancelManual);
$('manual-input-form').addEventListener('submit', async event => {
  event.preventDefault();
  const request = steps.at(-1)?.inputRequest;
  if (!manualSession || !request || $('submit-manual').disabled) return;
  const requestVersion = version, priorLength = steps.length;
  $('manual-value').disabled = $('submit-manual').disabled = true;
  try {
    const response = await requestAPI('/api/input', {method:'POST', headers:{'Content-Type':'application/json','X-Visualizer-Token':token}, body:JSON.stringify({standard:$("cpp-standard").value, session:manualSession, request:request.number, value:$('manual-value').value})});
    const data = await response.json();
    if (requestVersion !== version) {if(data.session)cancelSession(data.session);return;}
    if (!response.ok) throw new Error(data.error || 'Impossibile inviare il valore.');
    steps = data.steps; manualSession = data.session || null; position = Math.min(priorLength, steps.length - 1);
    setRunHint(manualSession ? 'Continua con i passi fino alla prossima lettura.' : `${steps.length} passi pronti da esplorare.`);
    if (data.error) { $('error').textContent = data.error; $('error').hidden = false; }
    render();
    if (resumeAfterInput && !steps[position]?.inputRequest) {resumeAfterInput = false;startPlayback();}
  } catch (error) {
    if (requestVersion === version) { $('manual-input-error').textContent = error.message; $('manual-input-error').hidden = false; }
  } finally {
    if (requestVersion === version) {$('manual-value').disabled = $('submit-manual').disabled = false;if(!$('manual-input-form').hidden)$('manual-value').focus({preventScroll:true});}
  }
});
code.addEventListener('input', () => { $('examples').value = ''; invalidate(); }); input.addEventListener('input', invalidate);
code.addEventListener('scroll', () => { $('gutter').scrollTop = code.scrollTop; });
$('code-view').addEventListener('scroll', () => { $('gutter').scrollTop = $('code-view').scrollTop; });
code.addEventListener('keydown', event => {
  if (event.key === 'Tab') {
    event.preventDefault(); const start = code.selectionStart;
    code.setRangeText('    ', start, code.selectionEnd, 'end'); $('examples').value = ''; invalidate();
  }
});
$('edit').addEventListener('click', () => { invalidate(); code.focus(); });
$('new').addEventListener('click', () => {
  $('examples').value = ''; code.value = ''; input.value = ''; programName.value = ''; storage.set('program-name', ''); invalidate(); code.focus();
});
$('examples').addEventListener('change', () => {
  const example = $('examples').value === '' ? null : examples[Number($('examples').value)];
  code.value = example?.code ?? ''; input.value = example?.input ?? ''; programName.value = example?.title ?? ''; storage.set('program-name', programName.value); invalidate(); code.focus();
});
$('run').addEventListener('click', async () => {
  cancelManual();
  pause(); const requestVersion = version;
  retainedMemory = null; retainedCalls = null; selectedVariable = null; lastRenderedStep = null; steps = []; position = 0; controls();
  renderMemory({ frames: [], variables: [] }, null);
  renderCondition(null, null);
  flowEditor.clearTrace();
  $('output').textContent = ''; $('input-progress').hidden = true;
  $('step-description').replaceChildren(element('p', 'Preparazione della nuova esecuzione…'));
  $('run').disabled = true; $('run').textContent = 'Preparazione in corso…';
  setRunHint('Compilo il programma e registro i passi.');
  $('error').hidden = true;
  try {
    const generated = mode === 'flow' ? await flowEditor.getSource() : null;
    const source = generated ? generated.code : code.value;
    if (mode === 'flow') flowEditor.setRunning(true);
    const manual = $('input-mode').value === 'manual';
    const response = await requestAPI('/api/run', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Visualizer-Token': token }, body: JSON.stringify({ standard: $("cpp-standard").value, code: source, input: manual ? '' : input.value, ...(manual ? {manual:true} : {}), ...(generated ? {flow: generated.flow} : {}) }) }).catch(() => {
      throw new Error(connectionError);
    });
    const data = await response.json();
    if (requestVersion !== version) { if(data.session)cancelSession(data.session); setRunHint('Il codice è cambiato: avvia la nuova versione.'); return; }
    if (!response.ok) throw new Error(data.error || 'Impossibile generare la traccia.');
    steps = data.steps; position = 0; manualSession = data.session || null;
    code.hidden = true; $('code-view').hidden = false; $('edit').hidden = false;
    $('code-view').replaceChildren(...source.split('\n').map(line => element('span', line || ' ', 'code-line')));
    $('warnings-box').hidden = !data.warnings; $('warnings').textContent = data.warnings || '';
    setRunHint(data.error ? 'Traccia disponibile fino al punto di errore.' : manualSession ? 'Segui i passi: alla lettura inserisci il valore nella console.' : `${steps.length} passi pronti da esplorare.`);
    if (data.error) { $('error').textContent = data.error; $('error').hidden = false; }
    render();
  } catch (error) {
    if (requestVersion !== version) return;
    steps = []; position = 0; controls();
    code.hidden = false; $('code-view').hidden = true; $('edit').hidden = true;
    $('source-status').textContent = 'Codice modificabile'; updateLines();
    $('input-progress').hidden = true; $('warnings-box').hidden = true;
    $('step-description').replaceChildren(element('p', 'Nessuna traccia disponibile. Consulta il messaggio di errore e riprova.'));
    $('memory').replaceChildren(element('p', 'Nessuna traccia disponibile.', 'no-vars'));
    $('stack').replaceChildren(element('li', 'Nessuna chiamata attiva.', 'placeholder'));
    $('output').textContent = '';
    $('error').textContent = error.message; $('error').hidden = false;
    setRunHint('Controlla il messaggio di errore.');
  } finally { if (!steps.length) flowEditor.setRunning(false); $('run').disabled = !token; $('run').textContent = '▶ Visualizza esecuzione'; }
});
$('mode-cpp').addEventListener('click', () => setMode('cpp'));
$('mode-flow').addEventListener('click', () => setMode('flow'));
$('cpp-to-flow').addEventListener('click', async () => {
  const requestVersion=version, source=code.value, sourceInput=input.value;
  $('cpp-to-flow').disabled=true; $('cpp-to-flow').textContent='Conversione…'; $('error').hidden=true;
  try {
    const response=await requestAPI('/api/import-flowchart',{method:'POST',headers:{'Content-Type':'application/json','X-Visualizer-Token':token},body:JSON.stringify({code:source, standard:$("cpp-standard").value})});
    const result=await response.json();
    if(requestVersion!==version)return;
    if(!response.ok)throw new Error(result.error||'Conversione non riuscita.');
    const document=FlowchartCore.validate(result.document);
    document.title = programName.value;
    FlowchartCore.generate(document);
    storage.set('flow-input',sourceInput);setMode('flow');flowEditor.replace(document);
    flowEditor.message('C++ importato: il sorgente originale è conservato. Annulla ripristina il diagramma precedente.');
  } catch(error) {if(requestVersion===version){$('error').textContent=error.message;$('error').hidden=false;}}
  finally {$('cpp-to-flow').disabled=!token;$('cpp-to-flow').textContent='C++ → Flowchart';}
});
$('first').addEventListener('click', () => seek(0)); $('last').addEventListener('click', () => seek(steps.length - 1));
$('prev').addEventListener('click', () => seek(position - 1)); $('next').addEventListener('click', () => seek(position + 1));
$('timeline').addEventListener('input', () => seek(Number($('timeline').value)));
$('addresses').addEventListener('change', render);
$('conditions').addEventListener('change', () => { storage.set('conditions', String($('conditions').checked)); render(); });
$('completed-calls').addEventListener('click', event => { if (event.target.closest('summary')) pause(); });
$('memory-clear').addEventListener('change', () => {
  storage.set('memory-clear', $('memory-clear').value);
  if ($('memory-clear').value === 'finish') { retainedMemory = null; retainedCalls = null; }
  if (steps.length) render();
  else renderMemory(retainedMemory || { frames: [], variables: [] }, null, !!retainedMemory, retainedCalls);
});
function startPlayback() {
  $('play').textContent = 'Ⅱ'; $('play').setAttribute('aria-label', 'Pausa');
  timer = setInterval(() => { if (position >= steps.length - 1) return pause(); position++; render(); }, 1000 / Number($('speed').value));
}
$('play').addEventListener('click', () => {
  if (timer) return pause();
  if (position === steps.length - 1) { position = 0; render(); }
  startPlayback();
});
$('speed').addEventListener('change', () => {
  storage.set('speed', $('speed').value);
  if (timer) { pause(); startPlayback(); }
});
$('projection').addEventListener('click', () => {
  const enabled = document.body.classList.toggle('large');
  $('projection').setAttribute('aria-pressed', String(enabled)); storage.set('large', String(enabled));
  flowEditor.renderGraph();
});
$('help-toggle').addEventListener('click', () => {
  $('help').hidden = !$('help').hidden; $('help-toggle').setAttribute('aria-expanded', String(!$('help').hidden));
});
$('download').addEventListener('click', () => {
  const name = ProgramFiles.filename(programName.value, '.cpp');
  ProgramFiles.download(code.value, name, 'text/plain');
  $('source-status').textContent = 'File preparato: ' + name + '. Lo trovi nei download del browser.';
});
programName.addEventListener('input', () => {
  programName.value = programName.value.replace(/[\u0000-\u001f\u007f]/g, '');
  if (mode === 'flow') flowEditor.setTitle(programName.value);
  else storage.set('program-name', programName.value);
});
$('open-cpp').addEventListener('click', () => $('cpp-file').click());
$('cpp-file').addEventListener('change', async () => {
  const file = $('cpp-file').files[0]; if (!file) return;
  const requestVersion = version;
  try {
    const source = await ProgramFiles.readCpp(file);
    if (requestVersion !== version) throw new Error('Il programma è cambiato durante l’apertura. Ripeti Apri .cpp.');
    code.value = source; programName.value = ProgramFiles.baseName(file.name); input.value = ''; $('examples').value = '';
    storage.set('program-name', programName.value); invalidate();
    $('source-status').textContent = 'Aperto: ' + file.name;
  } catch (error) { $('error').textContent = 'Apertura non riuscita: ' + error.message; $('error').hidden = false; }
  finally { $('cpp-file').value = ''; }
});
async function initialize() {
  $('run').disabled = true;
  try {
    const response = await requestAPI('/api/config'); if (!response.ok) throw new Error('Configurazione non disponibile.');
    const config = await response.json(); token = config.token; examples = config.examples; configurationDone();
    const standards = config.standards || ['17'];
    const savedStandard = storage.get('standard');
    $('cpp-standard').value = standards.includes(savedStandard) ? savedStandard : '17';
    $('cpp-standard').disabled = !config.standards;
    if (!config.standards) $('cpp-standard').title = 'Riavvia il server locale per abilitare la scelta dello standard.';
    examples.forEach((example, i) => { const option = element('option', example.title); option.value = String(i); $('examples').append(option); });
    code.value = storage.get('code') ?? ''; input.value = storage.get('input') ?? '';
    const matching = examples.findIndex(example => example.code === code.value);
    $('examples').value = matching < 0 ? '' : String(matching);
    $('memory-clear').value = storage.get('memory-clear') === 'finish' ? 'finish' : 'next-run';
    $('conditions').checked = storage.get('conditions') === 'true';
    $('input-mode').value = storage.get('input-mode') === 'manual' ? 'manual' : 'prepared'; syncInputMode();
    const speed = storage.get('speed'); $('speed').value = ['0.25','0.5','1','2','4'].includes(speed) ? speed : '1';
    if (storage.get('large') === 'true') { document.body.classList.add('large'); $('projection').setAttribute('aria-pressed', 'true'); }
    setMode(storage.get('mode') === 'flow' ? 'flow' : 'cpp', true);
    updateLines(); $('run').disabled = false; $('cpp-to-flow').disabled = false;
  } catch (error) { configurationDone(); $('error').textContent = error.message + ' ' + connectionError; $('error').hidden = false; }
}
$('cpp-standard').addEventListener('change', () => {
  storage.set('standard', $('cpp-standard').value);
  invalidate();
  $('program-language').textContent = mode === 'flow' ? 'Diagramma a blocchi' : 'C++'+$('cpp-standard').value;
  flowEditor.sourceKey = null;
  flowEditor.preview();
});
initialize();

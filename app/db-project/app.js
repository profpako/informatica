'use strict';
const $ = id => document.getElementById(id);
const icon = id => `<svg class="icon" aria-hidden="true"><use href="#i-${id}"/></svg>`;
const storageKey = 'trama-er-v1';
const history = [], future = [];
let model = ER.example(), selected = '', editing = null, formDirty = false, textDirty = false;
let derived = null, stage = 'initial';
let relationalView = 'compact';
let view = { x: 0, y: 0, w: 1000, h: 700 }, drag = null, toastTimer, storageAvailable = true;
let draftText = '', firstResize = true, lastCanvasSize = { w: 0, h: 0 };
try {
  const stored = localStorage.getItem(storageKey);
  if (stored) {
    const record = JSON.parse(stored);
    model = ER.validate(record.model);
    derived = readDerived(record.derived);
    stage = record.stage === 'relational' && derived?.relational ? 'relational' : record.stage === 'restructured' && derived ? 'restructured' : 'initial';
    relationalView = record.relationalView === 'tables' ? 'tables' : 'compact';
    draftText = typeof record.draft === 'string' && record.draft.length <= 1000000 ? record.draft : '';
    textDirty = !!draftText && draftText !== ER.serialize(model);
  }
} catch (error) {
  storageAvailable = false;
  // Preserve the original record: a failed read must never silently overwrite an existing project.
  setTimeout(() => notify('Il progetto salvato non è leggibile o la memoria è bloccata. Esporta il JSON per conservare il lavoro.'), 200);
}
$('diagram-style').textContent = ER.svgStyle;
$('schema-text').value = draftText || ER.serialize(model);

function readDerived(raw) {
  if (!raw) return null;
  if (typeof raw.signature !== 'string' || raw.signature.length > 1000000 || !Array.isArray(raw.report) || raw.report.length > 1000 || raw.report.some(s => typeof s !== 'string' || s.length > 2000)) throw Error('La ristrutturazione salvata non è valida.');
  const loaded = { model: ER.validate(raw.model), signature: raw.signature, report: [...raw.report] };
  if (raw.relational) loaded.relational = ER.relational(loaded.model);
  return loaded;
}
const shownModel = () => stage !== 'initial' && derived ? derived.model : model;
function diagramModel() {
  const active = shownModel();
  if (!editing?.preview || !editing.id) return active;
  const preview = ER.copy(active), node = [...preview.entities, ...preview.relationships].find(n => n.id === editing.id);
  if (node) Object.assign(node, { side: editing.side, attributes: editing.previewAttributes, attributeSides: editing.attributeSides, attributePositions: editing.attributePositions });
  return preview;
}
const snapshot = () => ER.copy({ model, derived, stage });
function remember() { history.push(snapshot()); if (history.length > 60) history.shift(); future.length = 0; }

function notify(message) {
  $('toast').textContent = message; $('toast').hidden = false;
  $('announcement').textContent = message;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 5500);
}
function persist() {
  if (storageAvailable) {
    try { localStorage.setItem(storageKey, JSON.stringify({ model, derived, stage, relationalView, draft: $('schema-text').value })); }
    catch { storageAvailable = false; notify('Memoria locale non disponibile. Esporta il JSON per salvare il progetto.'); }
  }
  $('save-status').textContent = storageAvailable ? textDirty ? 'Bozza di testo salvata · da generare' : 'Salvato in questo browser' : 'Esporta il JSON per salvare';
  $('save-status').classList.toggle('warning', !storageAvailable);
}
function boundsView() {
  if (stage === 'relational') return;
  const b = ER.render(diagramModel()).bounds, rect = $('canvas').getBoundingClientRect();
  const scale = Math.max(b.w / Math.max(1, rect.width - 60), b.h / Math.max(1, rect.height - 75));
  view = { x: b.x + b.w / 2 - rect.width * scale / 2, y: b.y + b.h / 2 - rect.height * scale / 2, w: rect.width * scale, h: rect.height * scale };
  lastCanvasSize = { w: rect.width, h: rect.height };
  updateView();
}
function updateView() {
  $('diagram').setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`);
  const zoom = $('canvas').clientWidth / view.w;
  $('zoom-reset').textContent = `${Math.round(zoom * 100)}%`;
  $('zoom-in').disabled = zoom >= 3;
  $('zoom-out').disabled = zoom <= .08;
}
function draw() {
  const active = shownModel();
  $('diagram-content').innerHTML = ER.render(diagramModel(), selected).markup;
  $('diagram-title').textContent = model.title + (stage === 'initial' ? ' · ER iniziale' : ' · ER ristrutturato');
  $('project-title').value = model.title;
  document.title = `${model.title} · Trama ER`;
  $('empty-state').hidden = !!model.entities.length;
  $('canvas-instruction').hidden = !model.entities.length;
  $('schema-counts').textContent = `${active.entities.length} entità · ${active.relationships.length} associazioni${active.hierarchies?.length ? ` · ${active.hierarchies.length} gerarchie` : ''}`;
  document.querySelector('.canvas-title span:nth-child(2)').textContent = stage === 'relational' ? 'Schema relazionale' : 'Schema concettuale';
  document.querySelector('.notation').hidden = stage === 'relational'; document.querySelector('.legend').hidden = stage === 'relational';
  document.querySelector('.drawing-area').setAttribute('aria-label', stage === 'relational' ? 'Schema relazionale' : 'Schema ER');
  if (stage === 'relational') $('schema-counts').textContent = `${derived.relational.tables.length} relazioni`;
  $('auto-layout').disabled = !active.entities.length;
  $('diagram').toggleAttribute('hidden', stage === 'relational'); $('relational-panel').hidden = stage !== 'relational';
  $('canvas-instruction').hidden = stage !== 'initial' || !active.entities.length;
  document.querySelector('.zoom-controls').hidden = stage === 'relational';
  $('auto-layout').disabled = stage === 'relational' || !active.entities.length; $('fit').disabled = stage === 'relational';
  $('relational-generate').disabled = !model.entities.length;
  if (stage === 'relational') renderRelational();
  $('restructure').disabled = !model.entities.length;
  $('schema-stage').value = stage;
  $('schema-stage').querySelector('[value="restructured"]').disabled = !derived;
  $('schema-stage').querySelector('[value="relational"]').disabled = !derived?.relational;
  document.querySelectorAll('[data-export="svg"],[data-export="png"]').forEach(b => { b.disabled = stage === 'relational'; });
  document.querySelector('[data-export="relational"]').disabled = !derived?.relational;
  const stale = derived && derived.signature !== ER.serialize(model);
  $('derived-status').textContent = derived ? stale ? 'Da rigenerare' : 'Ristrutturazione aggiornata' : 'Da generare';
  $('derived-status').classList.toggle('warning', !!stale);
  $('restructure-report').hidden = !derived;
  $('report-content').innerHTML = derived ? `<h3>Trasformazioni applicate</h3><ul>${derived.report.map(s => `<li>${ER.escape(s)}</li>`).join('') || '<li>Lo schema contiene già solo costrutti semplici.</li>'}</ul><h3>Vincoli da conservare</h3><ul>${(derived.model.constraints || []).map(s => `<li>${ER.escape(s)}</li>`).join('') || '<li>Nessun vincolo aggiuntivo.</li>'}</ul>` : '';
  $('undo').disabled = !history.length; $('redo').disabled = !future.length;
  renderList(); updateView();
}
function renderList() {
  const section = (heading, list, kind) => `<section class="list-section"><div class="list-section-heading"><h2>${heading}<span class="item-count">${list.length}</span></h2><button class="icon-button" data-add="${kind}" title="Aggiungi ${kind === 'entity' ? 'entità' : 'associazione'}" aria-label="Aggiungi ${kind === 'entity' ? 'entità' : 'associazione'}" ${kind === 'relationship' && !model.entities.length ? 'disabled' : ''}>${icon('plus')}</button></div>${list.map(node => {
    const detail = node.ends ? node.ends.map(end => ER.escape(model.entities.find(e => e.id === end.entity).name)).join(' ↔ ') : `${node.attributes.length} attribut${node.attributes.length === 1 ? 'o' : 'i'}${node.attributes.some(a => a.key) ? ' · identificatore definito' : ' · senza identificatore'}`;
    return `<button class="schema-item ${kind === 'relationship' ? 'relationship-item' : ''}${selected === node.id ? ' selected' : ''}" data-edit="${node.id}">${icon(kind === 'entity' ? 'entity' : 'relation')}<span class="item-description"><span class="item-name">${ER.escape(node.name)}</span><span class="item-detail">${detail}</span></span><svg class="icon item-arrow"><use href="#i-arrow"/></svg></button>`;
  }).join('')}${!list.length ? `<p class="empty-list">${kind === 'entity' ? 'Le entità sono gli oggetti di cui vuoi conservare i dati.' : 'Collega due entità e specifica come partecipano all’associazione.'}</p>` : ''}${kind === 'entity' ? `<button class="button add-wide" data-add="entity">${icon('plus')}Aggiungi entità</button>` : ''}</section>`;
  const h = model.hierarchies || [], entityName = id => model.entities.find(e => e.id === id)?.name || '';
  $('structure-list').innerHTML = section('Entità', model.entities, 'entity') + section('Associazioni', model.relationships, 'relationship') + `<section class="list-section"><div class="list-section-heading"><h2>Gerarchie<span class="item-count">${h.length}</span></h2><button class="icon-button" data-add="hierarchy" aria-label="Aggiungi gerarchia" ${model.entities.length < 2 ? 'disabled' : ''}>${icon('plus')}</button></div>${h.map(g => `<button class="schema-item" data-hierarchy="${g.id}">${icon('relation')}<span class="item-description"><span class="item-name">${ER.escape(entityName(g.parent))}</span><span class="item-detail">${g.total ? 'Totale' : 'Parziale'} · ${g.disjoint ? 'esclusiva' : 'sovrapposta'} · ${g.children.map(entityName).map(ER.escape).join(', ')}</span></span></button>`).join('')}${!h.length ? '<p class="empty-list">Specifica padre, figlie e regole di appartenenza.</p>' : ''}</section>`;
}
function commit(next, fit = false, toDerived = false) {
  next = ER.validate(next);
  if (JSON.stringify(next) === JSON.stringify(toDerived ? derived.model : model)) return;
  remember();
  if (toDerived) { derived.model = next; }
  else { model = next; stage = 'initial'; }
  if (!textDirty) $('schema-text').value = ER.serialize(model);
  draw(); persist(); if (fit) boundsView();
}
function formCanClose() {
  return !formDirty || confirm('Le modifiche nel modulo non sono state applicate. Vuoi scartarle?');
}
function closeEditor(check = true) {
  if (check && !formCanClose()) return false;
  const preview = editing?.preview;
  editing = null; formDirty = false; $('node-form').hidden = true; $('hierarchy-form').hidden = true; $('structure-list').hidden = false;
  if (preview) draw();
  return true;
}
function tab(mode, check = true) {
  if (mode === 'text' && check && !closeEditor()) return false;
  const isText = mode === 'text';
  ['structure', 'text'].forEach(t => {
    const active = (t === 'text') === isText;
    $(`${t}-tab`).setAttribute('aria-selected', active); $(`${t}-tab`).tabIndex = active ? 0 : -1; $(`${t}-tab`).classList.toggle('active', active);
    $(`${t}-panel`).hidden = !active;
  });
  return true;
}
function showEditor(kind, id = null, fromDerived = false) {
  if (kind === 'hierarchy') { showHierarchy(id); return; }
  if (!formCanClose()) return;
  const isDerived = fromDerived && !!derived;
  stage = isDerived ? 'restructured' : 'initial';
  const active = isDerived ? derived.model : model;
  if (kind === 'relationship' && !model.entities.length) { notify('Aggiungi prima almeno un’entità.'); return; }
  tab('structure', false);
  const node = id ? [...active.entities, ...active.relationships].find(n => n.id === id) : null;
  if (id && !node) return;
  editing = { kind, id, derived: isDerived, side: node?.side || 'top', attributeSides: ER.copy(node?.attributeSides || {}), attributePositions: ER.copy(node?.attributePositions || {}) }; selected = id || ''; formDirty = false;
  $('node-form').hidden = false; $('hierarchy-form').hidden = true; $('structure-list').hidden = true;
  $('form-heading').textContent = isDerived ? `Disposizione di ${node.name}` : `${id ? 'Modifica' : 'Nuova'} ${kind === 'entity' ? 'entità' : 'associazione'}`;
  $('node-name').readOnly = isDerived; $('node-attributes').readOnly = isDerived;
  $('relationship-fields').querySelectorAll('input,select').forEach(e => { e.disabled = isDerived; });
  $('node-form').querySelector('[type="submit"]').innerHTML = icon('check') + (isDerived ? 'Applica disposizione' : 'Applica allo schema');
  $('node-name').value = node?.name || ''; $('node-attributes').value = node ? ER.attributeText(node.attributes) : '';
  $('form-error').hidden = true;
  $('attribute-selection').innerHTML = '';
  renderAttributeSelection();
  $('relationship-fields').hidden = kind !== 'relationship'; $('delete-node').hidden = !id || isDerived;
  ['a', 'b'].forEach((letter, index) => {
    $(`end-${letter}`).innerHTML = active.entities.map(e => `<option value="${e.id}">${ER.escape(e.name)}</option>`).join('');
    $(`card-${letter}`).innerHTML = ER.cards.map(c => `<option value="${c}">(${c})</option>`).join('');
    $(`end-${letter}`).value = node?.ends?.[index]?.entity || active.entities[Math.min(index, active.entities.length - 1)]?.id || '';
    $(`card-${letter}`).value = node?.ends?.[index]?.cardinality || (index === 0 ? '0,N' : '1,1');
    $(`role-${letter}`).value = node?.ends?.[index]?.role || '';
  });
  $('structure-panel').scrollTop = 0; draw(); $('node-name').focus({ preventScroll: true });
  if (window.innerWidth <= 760) $('node-form').scrollIntoView({ behavior: 'auto', block: 'start' });
}
function errorIn(id, message) { $(id).textContent = message; $(id).hidden = false; }
$('node-form').addEventListener('input', event => { if (!event.target.closest('#attribute-selection')) formDirty = true; });
$('node-form').addEventListener('change', event => { if (!event.target.closest('#attribute-selection')) formDirty = true; });
function renderAttributeSelection() {
  if (!editing || editing.kind === 'hierarchy') return;
  const text = $('node-attributes').value;
  const changed = editing.layoutText != null && editing.layoutText !== text;
  if (changed) { editing.attributeSides = {}; editing.attributePositions = {}; editing.preview = false; draw(); }
  editing.layoutText = text;
  try {
    const checked = changed ? [] : [...$('attribute-selection').querySelectorAll('input:checked')].map(e => e.value), entries = ER.attributeEntries(ER.attributes(text));
    $('attribute-selection').innerHTML = entries.map(e => `<label style="padding-inline-start:${e.depth * 12}px"><input type="checkbox" value="${e.path}" ${checked.includes(e.path) ? 'checked' : ''}>${ER.escape(e.attr.name)}${e.attr.children ? ' (composto)' : ''}</label>`).join('') || '<p class="field-hint">Aggiungi gli attributi nel campo sopra.</p>';
  } catch { $('attribute-selection').innerHTML = '<p class="field-hint">Correggi la descrizione degli attributi per poterli selezionare.</p>'; }
  updateAttributeSelection();
}
$('node-attributes').addEventListener('input', renderAttributeSelection);
function attributePreviewMessage() {
  return `${editing.id ? 'Anteprima visibile nel diagramma.' : 'Posizione impostata.'} Premi ${editing.derived ? 'Applica disposizione' : 'Applica allo schema'} per salvarla.`;
}
function updateAttributeSelection() {
  const inputs = [...$('attribute-selection').querySelectorAll('input')], count = inputs.filter(e => e.checked).length;
  $('attribute-target-side').disabled = !count; $('attribute-target-side').value = '';
  $('select-all-attributes').disabled = !inputs.length;
  $('select-all-attributes').textContent = inputs.length && count === inputs.length ? 'Deseleziona tutti' : 'Seleziona tutti';
  const instruction = count ? `${count} ${count === 1 ? 'attributo selezionato' : 'attributi selezionati'}. Scegli il lato per vedere l’anteprima.` : 'Seleziona almeno un attributo per scegliere il lato.';
  $('attribute-move-status').textContent = `${editing?.preview ? attributePreviewMessage() + ' ' : ''}${instruction}`;
}
$('attribute-selection').addEventListener('change', updateAttributeSelection);
$('select-all-attributes').addEventListener('click', () => {
  const inputs = [...$('attribute-selection').querySelectorAll('input')], select = !inputs.every(e => e.checked);
  inputs.forEach(e => { e.checked = select; }); updateAttributeSelection();
});
$('attribute-target-side').addEventListener('change', () => {
  const selected = [...$('attribute-selection').querySelectorAll('input:checked')].map(e => e.value), side = $('attribute-target-side').value;
  if (!selected.length || !side) return;
  try {
    const attributes = ER.attributes($('node-attributes').value), entries = ER.attributeEntries(attributes);
    if (selected.length === entries.length) { editing.side = side; editing.attributeSides = {}; editing.attributePositions = {}; }
    else entries.forEach(e => {
      if (selected.some(path => e.path === path || e.path.startsWith(path + '.'))) { editing.attributeSides[e.path] = side; delete editing.attributePositions[e.path]; }
    });
    editing.preview = true; editing.previewAttributes = attributes; formDirty = true; draw(); boundsView();
    $('attribute-move-status').textContent = attributePreviewMessage();
  } catch (error) { errorIn('form-error', error.message); }
});
$('node-form').addEventListener('submit', event => {
  event.preventDefault(); if (!editing) return;
  try {
    const toDerived = editing.derived, next = ER.copy(toDerived ? derived.model : model), list = editing.kind === 'entity' ? next.entities : next.relationships;
    const original = list.find(n => n.id === editing.id);
    renderAttributeSelection();
    const node = { ...original, id: original?.id || ER.uid(), name: $('node-name').value.trim(), attributes: ER.attributes($('node-attributes').value), side: editing.side, x: original?.x ?? view.x + view.w / 2, y: original?.y ?? view.y + view.h / 2, attributePositions: ER.copy(editing.attributePositions), attributeSides: ER.copy(editing.attributeSides) };
    if (!original && editing.kind === 'entity') {
      let slot = 0;
      do { node.x = 280 + (slot % 3) * 650; node.y = 260 + Math.floor(slot / 3) * 600; slot++; }
      while (next.entities.some(e => Math.hypot(e.x - node.x, e.y - node.y) < 350));
    }
    if (editing.kind === 'relationship') {
      node.ends = ['a', 'b'].map(letter => ({ entity: $(`end-${letter}`).value, cardinality: $(`card-${letter}`).value, role: $(`role-${letter}`).value.trim() }));
      if (!original) {
        const [a, b] = node.ends.map(end => next.entities.find(e => e.id === end.entity));
        const siblings = next.relationships.filter(r => r.ends.map(e => e.entity).sort().join() === node.ends.map(e => e.entity).sort().join()).length;
        node.x = a.id === b.id ? a.x + 240 : (a.x + b.x) / 2;
        node.y = a.id === b.id ? a.y + 140 + siblings * 140 : (a.y + b.y) / 2 + siblings * 150;
      }
    }
    if (original) list[list.indexOf(original)] = node; else list.push(node);
    ER.validate(next); selected = node.id; closeEditor(false); commit(next, !original, toDerived); notify(`${node.name}: ${original ? 'modifiche applicate' : 'aggiunto allo schema'}.`);
  } catch (error) { errorIn('form-error', error.message); }
});
$('delete-node').addEventListener('click', () => {
  if (!editing?.id) return;
  const node = [...model.entities, ...model.relationships].find(n => n.id === editing.id);
  const linked = model.relationships.filter(r => r.ends.some(end => end.entity === node.id)).length;
  if (!confirm(`Eliminare ${node.name}${linked ? ` e ${linked} associazioni collegate` : ''}? Puoi annullare questa operazione.`)) return;
  const next = ER.copy(model);
  next.entities = next.entities.filter(n => n.id !== node.id);
  next.relationships = next.relationships.filter(r => r.id !== node.id && !r.ends.some(end => end.entity === node.id));
  if (next.hierarchies) next.hierarchies = next.hierarchies.filter(h => h.parent !== node.id).map(h => ({ ...h, children: h.children.filter(id => id !== node.id) })).filter(h => h.children.length);
  next.entities.forEach(e => { if (e.externalKey?.owners.some(o => o.entity === node.id || !next.relationships.some(r => r.id === o.relationship))) delete e.externalKey; });
  selected = ''; closeEditor(false); commit(next); notify(`${node.name} eliminato.`);
});
$('form-back').addEventListener('click', () => closeEditor());
$('structure-list').addEventListener('click', event => {
  const add = event.target.closest('[data-add]');
  if (add) showEditor(add.dataset.add);
  const edit = event.target.closest('[data-edit]');
  if (edit) showEditor(model.entities.some(n => n.id === edit.dataset.edit) ? 'entity' : 'relationship', edit.dataset.edit);
  const hierarchy = event.target.closest('[data-hierarchy]'); if (hierarchy) showHierarchy(hierarchy.dataset.hierarchy);
});
$('first-entity').addEventListener('click', () => showEditor('entity'));
function hierarchyChildren(selected = []) {
  $('hierarchy-children').innerHTML = model.entities.filter(e => e.id !== $('hierarchy-parent').value).map(e => `<label><input type="checkbox" value="${e.id}" ${selected.includes(e.id) ? 'checked' : ''}>${ER.escape(e.name)}</label>`).join('');
}
function showHierarchy(id = null) {
  if (!formCanClose()) return;
  stage = 'initial'; tab('structure', false);
  const h = (model.hierarchies || []).find(h => h.id === id);
  editing = { kind: 'hierarchy', id }; formDirty = false;
  $('node-form').hidden = true; $('hierarchy-form').hidden = false; $('structure-list').hidden = true;
  $('hierarchy-heading').textContent = id ? 'Modifica gerarchia' : 'Nuova gerarchia';
  $('hierarchy-parent').innerHTML = model.entities.map(e => `<option value="${e.id}">${ER.escape(e.name)}</option>`).join('');
  $('hierarchy-parent').value = h?.parent || model.entities[0]?.id;
  hierarchyChildren(h?.children);
  $('hierarchy-total').value = String(h?.total ?? false); $('hierarchy-disjoint').value = String(h?.disjoint ?? true);
  $('hierarchy-strategy').value = h?.strategy || 'keep'; $('hierarchy-error').hidden = true; $('delete-hierarchy').hidden = !id;
  $('hierarchy-strategy').querySelector('[value="down"]').disabled = $('hierarchy-total').value !== 'true';
  draw(); $('hierarchy-parent').focus();
  if (innerWidth <= 760) $('hierarchy-form').scrollIntoView({ block: 'start' });
}
$('hierarchy-parent').addEventListener('change', () => { hierarchyChildren(); formDirty = true; });
['input', 'change'].forEach(type => $('hierarchy-form').addEventListener(type, () => { formDirty = true; }));
$('hierarchy-total').addEventListener('change', () => {
  const partial = $('hierarchy-total').value !== 'true'; $('hierarchy-strategy').querySelector('[value="down"]').disabled = partial;
  if (partial && $('hierarchy-strategy').value === 'down') $('hierarchy-strategy').value = 'keep';
});
$('hierarchy-form').addEventListener('submit', event => {
  event.preventDefault();
  try {
    const next = ER.copy(model), h = { id: editing.id || ER.uid(), parent: $('hierarchy-parent').value, children: [...$('hierarchy-children').querySelectorAll('input:checked')].map(e => e.value), total: $('hierarchy-total').value === 'true', disjoint: $('hierarchy-disjoint').value === 'true', strategy: $('hierarchy-strategy').value };
    next.hierarchies ||= []; const index = next.hierarchies.findIndex(g => g.id === h.id);
    if (index < 0) next.hierarchies.push(h); else next.hierarchies[index] = h;
    ER.validate(next); closeEditor(false); commit(next, true); notify('Gerarchia applicata allo schema iniziale.');
  } catch (error) { errorIn('hierarchy-error', error.message); }
});
$('hierarchy-back').addEventListener('click', () => closeEditor());
$('delete-hierarchy').addEventListener('click', () => {
  if (!confirm('Eliminare la gerarchia? Le entità restano nello schema.')) return;
  const next = ER.copy(model); next.hierarchies = next.hierarchies.filter(h => h.id !== editing.id); closeEditor(false); commit(next, true);
});
$('schema-stage').addEventListener('change', () => {
  if (!closeEditor()) { $('schema-stage').value = stage; return; }
  stage = $('schema-stage').value; selected = ''; draw(); boundsView(); persist();
});
$('restructure').addEventListener('click', () => {
  if (!closeEditor()) return;
  try {
    const result = ER.restructure(model); remember(); derived = { ...result, signature: ER.serialize(model) }; stage = 'restructured'; selected = ''; draw(); boundsView(); persist();
    notify('ER ristrutturato generato. Lo schema iniziale è conservato.');
  } catch (error) { notify(`Ristrutturazione non riuscita: ${error.message}`); }
});
function renderRelational() {
  const result = derived.relational, referenceName = id => result.tables.find(t => t.id === id).name;
  const references = t => t.foreignKeys.map(f => `<p><strong>FK:</strong> ${f.columns.map(ER.escape).join(' + ')} → ${ER.escape(referenceName(f.target))}(${f.references.map(ER.escape).join(', ')})</p>`).join('') + t.unique.map(u => `<p><strong>UNIQUE:</strong> ${u.map(ER.escape).join(' + ')}</p>`).join('');
  const compact = `<p class="compact-legend"><span class="relational-pk">PK: una sottolineatura</span> · <span class="relational-fk">FK: doppia sottolineatura</span> · <strong>*</strong> campo opzionale. Una PK composta ha un’unica linea sull’intero gruppo, anche quando i suoi attributi sono FK.</p><div class="compact-schema">${result.tables.map(ER.relationalNotation).join('')}</div><details class="compact-references"><summary>Riferimenti delle FK e vincoli UNIQUE</summary>${result.tables.filter(t => t.foreignKeys.length || t.unique.length).map(t => `<section><h3>${ER.escape(t.name)}</h3>${references(t)}</section>`).join('') || '<p>Nessuna FK o unicità aggiuntiva.</p>'}</details>`;
  const tables = result.tables.map(t => `<section class="relation-table"><h3>${ER.escape(t.name)}</h3><table><thead><tr><th scope="col">Attributo</th><th scope="col">Chiavi</th><th scope="col">Null</th></tr></thead><tbody>${t.columns.map(c => `<tr><td>${ER.escape(c.name)}</td><td>${[t.primaryKey.includes(c.name) ? 'PK' : '', t.foreignKeys.some(f => f.columns.includes(c.name)) ? 'FK' : ''].filter(Boolean).join(' · ') || '—'}</td><td>${c.nullable ? 'Ammesso' : 'No'}</td></tr>`).join('')}</tbody></table><p><strong>PK:</strong> ${t.primaryKey.map(ER.escape).join(' + ')}</p>${references(t)}</section>`).join('');
  $('relational-panel').innerHTML = `<h2>Schema relazionale</h2><p>Derivato dall’ER ristrutturato. PK identifica le righe; FK riferisce la chiave di un’altra relazione.</p><div class="relational-view-control"><label for="relational-view">Rappresentazione</label><select id="relational-view"><option value="compact" ${relationalView === 'compact' ? 'selected' : ''}>Notazione compatta (PDF TikTok)</option><option value="tables" ${relationalView === 'tables' ? 'selected' : ''}>Dettaglio delle tabelle</option></select></div><div id="relational-compact" ${relationalView !== 'compact' ? 'hidden' : ''}>${compact}</div><div id="relational-tables" ${relationalView !== 'tables' ? 'hidden' : ''}>${tables}</div><section class="relation-constraints"><h3>Vincoli residui</h3><p>Questi vincoli richiedono verifiche ulteriori nella futura implementazione fisica.</p><ul>${result.constraints.map(s => `<li>${ER.escape(s)}</li>`).join('') || '<li>Nessun vincolo residuo aggiuntivo.</li>'}</ul><details><summary>Regole di traduzione applicate</summary><ul>${result.report.map(s => `<li>${ER.escape(s)}</li>`).join('')}</ul></details></section>`;
}
$('relational-panel').addEventListener('change', event => {
  if (event.target.id !== 'relational-view') return;
  relationalView = event.target.value;
  $('relational-compact').hidden = relationalView !== 'compact'; $('relational-tables').hidden = relationalView !== 'tables'; persist();
});
$('relational-generate').addEventListener('click', () => {
  if (!closeEditor()) return;
  try {
    const signature = ER.serialize(model), candidate = !derived || derived.signature !== signature ? { ...ER.restructure(model), signature } : ER.copy(derived);
    candidate.relational = ER.relational(candidate.model);
    remember(); derived = candidate; stage = 'relational'; selected = ''; draw(); persist(); notify('Schema relazionale generato con PK, FK e vincoli residui.');
  } catch (error) { notify(`Traduzione non riuscita: ${error.message}`); }
});
['structure', 'text'].forEach(mode => {
  $(`${mode}-tab`).addEventListener('click', () => tab(mode));
  $(`${mode}-tab`).addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); const other = event.key === 'Home' ? 'structure' : event.key === 'End' ? 'text' : mode === 'text' ? 'structure' : 'text';
    if (tab(other)) $(`${other}-tab`).focus();
  });
});
$('schema-text').addEventListener('input', () => { textDirty = $('schema-text').value !== ER.serialize(model); $('text-error').hidden = true; persist(); });
$('generate-text').addEventListener('click', () => {
  try {
    const next = ER.parse($('schema-text').value);
    textDirty = false; selected = ''; closeEditor(false); commit(next, true);
    $('schema-text').value = ER.serialize(model); $('text-error').hidden = true; persist(); notify('Schema generato dalla descrizione.');
  } catch (error) { errorIn('text-error', error.message); }
});
$('project-title').addEventListener('change', () => {
  try { commit({ ...ER.copy(model), title: $('project-title').value.trim() }); }
  catch (error) { $('project-title').value = model.title; notify(error.message); }
});
function replaceProject(next, importedDerived = null) {
  if (!formCanClose()) return false;
  if ((model.entities.length || textDirty) && !confirm('Vuoi sostituire lo schema corrente? La bozza di testo verrà sostituita. Esporta il JSON se vuoi conservarne una copia; lo schema attuale resta disponibile con Annulla.')) return false;
  closeEditor(false); textDirty = false; selected = '';
  if (JSON.stringify(next) === JSON.stringify(model)) remember();
  commit(next, true);
  derived = importedDerived; stage = 'initial'; draw(); boundsView();
  $('schema-text').value = ER.serialize(model); persist(); tab('structure', false); return true;
}
$('new-project').addEventListener('click', () => { if (replaceProject({ version: 1, title: 'Nuovo schema', entities: [], relationships: [] })) notify('Nuovo progetto. Aggiungi la prima entità.'); });
$('example-select').addEventListener('change', event => {
  const chosen = event.target.value; event.target.value = ''; if (!chosen) return;
  const next = chosen === 'extended' ? ER.parse(`TITOLO: Persone e corsi\nENTITA: Persona\n- codice [PK]\n- nome\n- indirizzo [0,1]\n  - via\n  - civico\n  - città\n- telefoni [0,N]\nENTITA: Studente\n- matricola\nENTITA: Docente\n- stipendio\nENTITA: Corso\n- codice [PK]\n- titolo\nASSOCIAZIONE: frequenta: Studente [1,N] -> Corso [0,N]\nASSOCIAZIONE: insegna: Docente [0,N] -> Corso [1,1]\nGERARCHIA: Persona [PARZIALE, ESCLUSIVA, PADRE] -> Studente, Docente`) : chosen === 'school' ? ER.parse(`TITOLO: Studenti e corsi\nENTITA: Studente\n- matricola [ID]\n- nome\n- email [0,1]\nENTITA: Corso\n- codice [ID]\n- titolo\nASSOCIAZIONE: frequenta: Studente [0,N] -> Corso [0,N]\n- data_iscrizione`) : ER.example(chosen === 'restructured');
  if (replaceProject(next)) notify('Esempio caricato. Puoi modificarlo liberamente.');
});
function travel(redo) {
  if (!closeEditor()) return;
  const from = redo ? future : history, to = redo ? history : future;
  if (!from.length) return;
  to.push(snapshot()); const previous = from.pop(); model = previous.model; derived = previous.derived; stage = previous.stage; selected = '';
  if (!textDirty) $('schema-text').value = ER.serialize(model);
  draw(); persist(); boundsView(); notify(redo ? 'Operazione ripristinata.' : 'Operazione annullata.');
}
$('undo').addEventListener('click', () => travel(false)); $('redo').addEventListener('click', () => travel(true));
$('auto-layout').addEventListener('click', () => { if (formCanClose()) { closeEditor(false); commit(ER.layout(ER.copy(shownModel())), true, stage === 'restructured'); notify('Schema bilanciato, compresi i lati degli attributi. Puoi annullare o correggere le posizioni.'); } });
$('fit').addEventListener('click', boundsView);
function zoom(factor, point) {
  const rect = $('canvas').getBoundingClientRect();
  const current = rect.width / view.w, next = Math.max(.08, Math.min(3, current * factor));
  const ratio = current / next, anchor = point || { x: view.x + view.w / 2, y: view.y + view.h / 2 };
  view = { x: anchor.x - (anchor.x - view.x) * ratio, y: anchor.y - (anchor.y - view.y) * ratio, w: view.w * ratio, h: view.h * ratio }; updateView();
}
$('zoom-in').addEventListener('click', () => zoom(1.25)); $('zoom-out').addEventListener('click', () => zoom(.8));
$('zoom-reset').addEventListener('click', () => zoom(view.w / $('canvas').clientWidth));
function point(event) {
  const rect = $('diagram').getBoundingClientRect();
  return { x: view.x + (event.clientX - rect.left) * view.w / rect.width, y: view.y + (event.clientY - rect.top) * view.h / rect.height };
}
$('diagram').addEventListener('pointerdown', event => {
  if (event.button !== 0 || drag) return;
  const target = event.target.closest('[data-node]'), p = point(event);
  if (target && editing?.preview) { notify('Applica la disposizione o torna allo schema prima di trascinare gli elementi.'); return; }
  const active = shownModel();
  const node = target ? [...active.entities, ...active.relationships].find(n => n.id === target.dataset.node) : null;
  if (node) { selected = node.id; draw(); }
  else { selected = ''; draw(); }
  const attribute = target?.dataset.attribute;
  const originalAttribute = attribute != null ? ER.attributePosition(node, attribute) : null;
  drag = { pointer: event.pointerId, node: node?.id, attribute, derived: stage === 'restructured', start: p, client: { x: event.clientX, y: event.clientY }, original: ER.copy(active), view: { ...view }, origin: originalAttribute || (node ? { x: node.x, y: node.y } : null), moved: false };
  $('diagram').setPointerCapture(event.pointerId);
});
$('diagram').addEventListener('pointermove', event => {
  if (!drag || drag.pointer !== event.pointerId) return;
  const deltaX = event.clientX - drag.client.x, deltaY = event.clientY - drag.client.y;
  if (!drag.moved && Math.hypot(deltaX, deltaY) < 4) return;
  drag.moved = true;
  const dx = deltaX * drag.view.w / $('diagram').clientWidth, dy = deltaY * drag.view.h / $('diagram').clientHeight;
  if (drag.node) {
    const active = shownModel(), node = [...active.entities, ...active.relationships].find(n => n.id === drag.node);
    const x = drag.origin.x + dx, y = drag.origin.y + dy;
    if (drag.attribute != null) node.attributePositions[drag.attribute] = { x: Math.max(-5000, Math.min(5000, x - node.x)), y: Math.max(-5000, Math.min(5000, y - node.y)) };
    else { node.x = Math.max(-50000, Math.min(50000, x)); node.y = Math.max(-50000, Math.min(50000, y)); }
    $('diagram-content').innerHTML = ER.render(active, selected).markup;
  } else { view.x = drag.view.x - dx; view.y = drag.view.y - dy; updateView(); }
});
function finishDrag(event) {
  if (!drag || event.pointerId !== drag.pointer) return;
  const current = drag; drag = null;
  if ($('diagram').hasPointerCapture(event.pointerId)) $('diagram').releasePointerCapture(event.pointerId);
  if (current.node && current.moved) {
    const next = ER.copy(shownModel()); if (current.derived) derived.model = current.original; else model = current.original; commit(next, false, current.derived);
    $('announcement').textContent = 'Posizione aggiornata.';
  }
}
$('diagram').addEventListener('pointerup', finishDrag);
$('diagram').addEventListener('pointercancel', event => {
  if (!drag) return;
  if (drag.node) { if (drag.derived) derived.model = drag.original; else model = drag.original; } else view = drag.view;
  drag = null; draw();
});
$('diagram').addEventListener('dblclick', event => {
  const h = event.target.closest('[data-hierarchy]'); if (h) { showHierarchy(h.dataset.hierarchy); return; }
  const target = event.target.closest('[data-node]'); if (!target) return;
  showEditor(shownModel().entities.some(n => n.id === target.dataset.node) ? 'entity' : 'relationship', target.dataset.node, stage === 'restructured');
});
$('diagram').addEventListener('wheel', event => {
  event.preventDefault();
  if (event.ctrlKey || event.metaKey) zoom(Math.exp(-event.deltaY * .004), point(event));
  else { view.x += event.deltaX * view.w / $('canvas').clientWidth; view.y += event.deltaY * view.h / $('canvas').clientHeight; updateView(); }
}, { passive: false });
$('diagram').addEventListener('keydown', event => {
  const hierarchy = event.target.closest('[data-hierarchy]');
  if (hierarchy && event.key === 'Enter') { event.preventDefault(); showHierarchy(hierarchy.dataset.hierarchy); return; }
  const target = event.target.closest('[data-node]'); if (!target) return;
  if (event.key === 'Enter') { event.preventDefault(); showEditor(shownModel().entities.some(n => n.id === target.dataset.node) ? 'entity' : 'relationship', target.dataset.node, stage === 'restructured'); return; }
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  if (editing?.preview) { event.preventDefault(); notify('Applica la disposizione o torna allo schema prima di spostare gli elementi.'); return; }
  event.preventDefault(); const next = ER.copy(shownModel()), node = [...next.entities, ...next.relationships].find(n => n.id === target.dataset.node);
  const amount = event.shiftKey ? 25 : 5, dx = event.key === 'ArrowRight' ? amount : event.key === 'ArrowLeft' ? -amount : 0, dy = event.key === 'ArrowDown' ? amount : event.key === 'ArrowUp' ? -amount : 0;
  if (target.dataset.attribute != null) {
    const i = target.dataset.attribute, p = ER.attributePosition(node, i);
    node.attributePositions[i] = { x: p.x - node.x + dx, y: p.y - node.y + dy };
  } else { node.x += dx; node.y += dy; }
  try {
    selected = node.id; commit(next, false, stage === 'restructured');
    const match = [...$('diagram-content').querySelectorAll('[data-node]')].find(el => el.dataset.node === node.id && el.dataset.attribute === target.dataset.attribute);
    match?.focus({ preventScroll: true });
  } catch (error) { notify(error.message); }
});
document.addEventListener('keydown', event => {
  if (event.target.closest('input,textarea,select') || $('help-dialog').open) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); travel(event.shiftKey); }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); travel(true); }
});
new ResizeObserver(entries => {
  const rect = entries[0].contentRect;
  if (!rect.width || !rect.height) return;
  if (firstResize) { boundsView(); firstResize = false; }
  else {
    const scale = lastCanvasSize.w / view.w;
    const center = { x: view.x + view.w / 2, y: view.y + view.h / 2 };
    view.w = rect.width / scale; view.h = rect.height / scale; view.x = center.x - view.w / 2; view.y = center.y - view.h / 2; updateView();
  }
  lastCanvasSize = { w: rect.width, h: rect.height };
}).observe($('canvas'));

$('open-project').addEventListener('click', () => $('file-input').click());
$('file-input').addEventListener('change', async event => {
  const file = event.target.files[0]; event.target.value = ''; if (!file) return;
  try {
    if (file.size > 1000000) throw Error('Il file supera il limite di 1 MB.');
    const raw = JSON.parse(await file.text()), next = ER.validate(raw.model || raw), importedDerived = readDerived(raw.derived);
    if (replaceProject(next, importedDerived)) notify('Progetto aperto. Schema iniziale e ristrutturazione sono conservati.');
  } catch (error) { notify(`Impossibile aprire il progetto: ${error.message}`); }
});
const filename = () => model.title.replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-|-$/g, '') || 'schema-er';
function download(content, type, extension) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = `${filename()}.${extension}`; document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
async function exportPNG() {
  const svg = ER.svg(shownModel()), url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image(); image.src = url; await image.decode();
    const b = ER.render(shownModel()).bounds, scale = Math.min(2, 8192 / Math.max(b.w, b.h), Math.sqrt(16000000 / (b.w * b.h)));
    const canvas = document.createElement('canvas'); canvas.width = Math.ceil(b.w * scale); canvas.height = Math.ceil(b.h * scale);
    const ctx = canvas.getContext('2d'); if (!ctx) throw Error('Il browser non supporta l’esportazione PNG.');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw Error('Immagine troppo grande. Usa l’esportazione SVG.');
    download(blob, 'image/png', 'png');
  } finally { URL.revokeObjectURL(url); }
}
$('export-menu').addEventListener('click', async event => {
  const action = event.target.closest('[data-export]')?.dataset.export; if (!action) return;
  $('export-menu').open = false;
  if (formDirty || textDirty) notify('Esporto l’ultimo schema applicato. Applica o genera le modifiche in bozza per includerle.');
  try {
    if (action === 'json') download(JSON.stringify({ ...model, derived }, null, 2), 'application/json', 'json');
    else if (action === 'svg') download(ER.svg(shownModel()), 'image/svg+xml', 'svg');
    else if (action === 'relational') download(ER.relationalText(derived.relational), 'text/plain;charset=utf-8', 'txt');
    else if (action === 'png') {
      const summary = $('export-menu').querySelector('summary'); summary.style.pointerEvents = 'none'; summary.setAttribute('aria-busy', 'true');
      try { await exportPNG(); } finally { summary.style.pointerEvents = ''; summary.removeAttribute('aria-busy'); }
    } else if (action === 'print') { window.print(); }
  } catch (error) { notify(`Esportazione non riuscita: ${error.message}`); }
});
document.addEventListener('click', event => { if (!event.target.closest('#export-menu')) $('export-menu').open = false; });
let beforePrintView;
window.addEventListener('beforeprint', () => {
  if (stage === 'relational') return;
  beforePrintView = { ...view }; const b = ER.render(shownModel()).bounds;
  $('diagram').setAttribute('viewBox', `${b.x} ${b.y} ${b.w} ${b.h}`); $('diagram').style.aspectRatio = `${b.w} / ${b.h}`;
});
window.addEventListener('afterprint', () => { if (beforePrintView) view = beforePrintView; $('diagram').style.aspectRatio = ''; updateView(); });
$('help-button').addEventListener('click', () => $('help-dialog').showModal()); $('close-help').addEventListener('click', () => $('help-dialog').close());
$('help-dialog').addEventListener('click', event => { if (event.target === $('help-dialog')) { const r = $('help-dialog').getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) $('help-dialog').close(); } });
window.addEventListener('beforeunload', event => { if (formDirty || (!storageAvailable && (history.length || textDirty))) { event.preventDefault(); event.returnValue = ''; } });
draw(); persist();

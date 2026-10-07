(function (root) {
  'use strict';
  const escape = value => root.ER.escape(String(value));
  const recommended = 'qwen3.5:2b-q4_K_M';
  async function readGenerationStream(body, onProgress) {
    const reader = body.getReader(), decoder = new TextDecoder();
    let buffer = '', proposal;
    function consume(line) {
      if (!line.trim()) return;
      const item = JSON.parse(line);
      if (item.event === 'error') throw Error(item.error || 'Generazione non riuscita.');
      if (item.event === 'progress') onProgress(item.data);
      if (item.event === 'done') proposal = item.data;
    }
    try {
      while (true) {
        const { value, done } = await reader.read();
        buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
        let newline;
        while ((newline = buffer.indexOf('\n')) !== -1) { consume(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1); }
        if (done) break;
      }
      if (buffer.trim()) consume(buffer);
      if (!proposal) throw Error('La generazione si è interrotta prima di produrre la proposta. Riprova.');
      return proposal;
    } catch (error) { await reader.cancel().catch(() => {}); throw error; }
    finally { reader.releaseLock(); }
  }
  function dataTable(data, { columnRoles = {}, rowStates = [] } = {}) {
    const cell = value => value === null ? '<span class="lab-null">NULL</span>' : escape(value);
    return `<div class="lab-table-scroll"><table><thead><tr>${data.columns.map(c => `<th scope="col">${escape(c)}${Array.isArray(columnRoles[c]) && columnRoles[c].length ? `<span class="lab-column-roles">${columnRoles[c].map(escape).join(' · ')}</span>` : ''}</th>`).join('')}</tr></thead><tbody>${data.rows.map((row, i) => `<tr${rowStates[i] === 1 ? ' class="lab-row-kept"' : rowStates[i] !== undefined ? ' class="lab-row-discarded"' : ''}>${row.map(value => `<td>${cell(value)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${Math.max(1, data.columns.length)}">Nessuna riga.</td></tr>`}</tbody></table></div><p class="field-hint">${data.rows.length} righe mostrate${data.truncated ? ' · anteprima limitata: ci sono altre righe' : ''}.</p>`;
  }
  function workingRoles(result) {
    const roles = {};
    result.sources.forEach(s => s.columns.forEach(c => {
      const labels = [];
      if (c.key === 'PRI') labels.push('PK');
      if (s.foreignKeys?.some(f => f.columns.includes(c.name))) labels.push('FK');
      for (const [phase, title] of Object.entries({ select: 'SELECT', join: 'JOIN', where: 'WHERE', group: 'GROUP BY', having: 'HAVING', order: 'ORDER BY' })) {
        if (result.usage[phase]?.some(r => r.alias === s.alias && r.column === c.name)) labels.push(title);
      }
      roles[s.alias + '.' + c.name] = labels;
    }));
    return roles;
  }
  function conditionView(step, columnRoles) {
    const checks = step.checks, operands = checks.conditions.slice(0, -1);
    const states = checks.rows.map(row => Number(row[row.length - 1]));
    const truth = value => Number(value) === 1 ? 'VERO' : Number(value) === 0 ? 'FALSO' : 'NULL';
    const data = { ...step.input, columns: ['Esito ' + step.phase.toUpperCase(), ...operands.map((_, i) => 'C' + (i + 1)), ...step.input.columns],
      rows: step.input.rows.map((row, i) => [`${states[i] === 1 ? 'Mantieni' : 'Scarta'} (${truth(states[i])})`, ...checks.rows[i].slice(0, -1).map(truth), ...row]) };
    return `<h4>${step.phase === 'having' ? 'Gruppi' : 'Righe'} prima del filtro</h4><p><code>${escape(step.phase.toUpperCase() + ' ' + step.condition)}</code></p>${operands.length ? `<ol class="lab-condition-list">${operands.map((c, i) => `<li><strong>C${i + 1}</strong> · <code>${escape(c)}</code></li>`).join('')}</ol>` : ''}${checks.omitted ? `<p class="field-hint">Sono mostrate le prime otto condizioni; l’esito valuta sempre l’intera espressione.</p>` : ''}${dataTable(data, { columnRoles, rowStates: states })}<p class="field-hint">Verde: mantenuta. Grigio: scartata. NULL indica una condizione dal valore sconosciuto; WHERE e HAVING conservano solo VERO.</p>`;
  }
  function groupView(step, columnRoles) {
    const groups = new Map();
    step.input.rows.forEach(row => { const id = row[0]; if (!groups.has(id)) groups.set(id, []); groups.get(id).push(row.slice(1)); });
    return `<h4>Righe che formano ciascun gruppo</h4><p class="field-hint">${step.input.truncated ? 'Anteprima limitata delle righe di partenza. ' : ''}Le aggregazioni della tabella sotto considerano tutte le righe del database, anche oltre l’anteprima.</p><div class="lab-group-list">${[...groups].map(([id, rows]) => {
      const summary = step.data.rows.find(row => row[0] === id);
      const keys = (step.keys || []).map((key, i) => `${key} = ${summary ? summary[i + 1] === null ? 'NULL' : summary[i + 1] : 'vedi riepilogo'}`).join(' · ');
      return `<details class="lab-source lab-group" open><summary>Gruppo ${escape(id)}${keys ? ' · ' + escape(keys) : ''} · ${rows.length} ${rows.length === 1 ? 'riga mostrata' : 'righe mostrate'}</summary>${dataTable({ columns: step.input.columns.slice(1), rows }, { columnRoles })}</details>`;
    }).join('') || '<p>Nessuna riga di partenza.</p>'}</div>`;
  }
  function stepLabel(step, index) {
    if (step.phase === 'join') return 'JOIN ' + index;
    if (step.phase === 'group') return step.keys?.length === 0 ? 'AGGREGAZIONE' : 'GROUP BY';
    return { from: 'FROM', where: 'WHERE', having: 'HAVING', select: 'SELECT', order: 'ORDER BY', limit: 'LIMIT / OFFSET' }[step.phase] || step.phase.toUpperCase();
  }
  function distributionOptions(tables, physical) {
    return tables.flatMap(table => {
      if (table.foreignKeys?.length !== 1) return [];
      const fk = table.foreignKeys[0];
      if (fk.target === table.name || !tables.some(t => t.name === fk.target)) return [];
      const mapped = physical?.result.tables?.find(t => t.name === table.name);
      const mappedFK = mapped?.foreignKeys.find(f => JSON.stringify(f.columns) === JSON.stringify(fk.columns)
        && physical.result.tables.find(t => t.id === f.target)?.name === fk.target
        && JSON.stringify(f.references) === JSON.stringify(fk.references));
      const rule = mappedFK && physical.relational?.participation?.find(p => p.table === mapped.id && JSON.stringify(p.columns) === JSON.stringify(fk.columns));
      const unique = table.unique?.some(key => key.every(c => fk.columns.includes(c)));
      return [{ table: table.name, fk, min: rule?.min || 0, max: unique ? 1 : rule?.max || 3, er: !!rule }];
    });
  }
  function graph(result, phase, activeAliases = result.sources.map(s => s.alias)) {
    const width = Math.max(520, result.sources.length * 260), tallest = Math.max(...result.sources.map(s => s.columns.length));
    const height = 75 + tallest * 29 + result.links.length * 14 + 55;
    const usage = (phase === 'from' ? [] : result.usage[phase] || []).filter(r => activeAliases.includes(r.alias));
    const position = ref => {
      const index = result.sources.findIndex(s => s.alias === ref.alias), source = result.sources[index];
      return { x: index * 260 + 242, y: 76 + source.columns.findIndex(c => c.name === ref.column) * 29 };
    };
    const lines = result.links.map((link, i) => {
      const a = position(link.left), b = position(link.right), bottom = 95 + tallest * 29 + i * 14;
      const active = link.clause === phase && [link.left.alias, link.right.alias].every(a => activeAliases.includes(a));
      if (![link.left.alias, link.right.alias].every(a => activeAliases.includes(a))) return '';
      return `<path class="lab-link${active ? ' active' : ''}" d="M${a.x} ${a.y} V${bottom} H${b.x} V${b.y}"><title>${escape(`${link.left.alias}.${link.left.column} = ${link.right.alias}.${link.right.column}`)}</title></path><circle cx="${a.x}" cy="${a.y}" r="4" class="lab-link-dot"/><circle cx="${b.x}" cy="${b.y}" r="4" class="lab-link-dot"/>`;
    }).join('');
    const cards = result.sources.map((source, i) => {
      const x = i * 260 + 12, h = 48 + source.columns.length * 29;
      return `<g${activeAliases.includes(source.alias) ? '' : ' class="lab-graph-pending"'}><clipPath id="lab-clip-${i}"><rect x="${x + 8}" y="16" width="175" height="${h}"/></clipPath><rect class="lab-graph-card" x="${x}" y="16" width="230" height="${h}" rx="5"/><text class="lab-graph-title" x="${x + 12}" y="42" clip-path="url(#lab-clip-${i})">${escape(source.alias === source.name ? source.name : source.name + ' · ' + source.alias)}</text>${source.columns.map((c, j) => {
        const active = usage.some(r => r.alias === source.alias && r.column === c.name), y = 59 + j * 29;
        const key = [c.key === 'PRI' ? 'PK' : c.key === 'UNI' ? 'UK' : '', source.foreignKeys?.some(f => f.columns.includes(c.name)) ? 'FK' : ''].filter(Boolean).join('/');
        return `<rect class="lab-graph-column${active ? ' active' : ''}" x="${x + 5}" y="${y}" width="220" height="27"/><text x="${x + 12}" y="${y + 18}" clip-path="url(#lab-clip-${i})">${escape(c.name)}<title>${escape(c.name)}</title></text><text class="lab-graph-key" x="${x + 214}" y="${y + 18}" text-anchor="end">${key}</text>`;
      }).join('')}</g>`;
    }).join('');
    // Lines start at highlighted column rows and run beneath the cards.
    return `<div class="lab-graph-scroll"><svg class="lab-graph" viewBox="0 0 ${width} ${height}" style="min-width:${width}px" role="img" aria-label="Tabelle, colonne coinvolte e condizioni di giunzione">${cards}${lines}</svg></div>`;
  }
  function mount({ panel, notify, getPhysical, onConnection }) {
    let session = '', connection = null, tables = [], result = null, activeStep = 0, busy = false, loaded = false;
    let prefs = {}, loadedModel = '', draftConnection = '';
    let suggested = recommended, advice = [], hardware = {}, installedModels = [], adviceChosen = false, pendingModel = '';
    const rowCounts = new Map(), linkSettings = new Map();
    let options = [], planConnection = '';
    const connectionKey = config => JSON.stringify([config.host, config.port, config.database]);
    try { prefs = JSON.parse(localStorage.getItem('trama-lab-v1') || '{}'); } catch { /* Existing editor storage remains independent. */ }
    const safePref = (key, fallback) => typeof prefs[key] === 'string' ? prefs[key] : fallback;
    let physicalDatabase = safePref('physicalDatabase', '');
    panel.innerHTML = `<h2>Laboratorio delle query</h2><p>Collega un database locale, prepara dati di esempio e osserva come una SELECT combina e filtra le righe.</p>
      <p id="lab-message" class="field-hint" role="status" aria-live="polite"></p><p id="lab-error" class="error" role="alert" hidden></p>
      <details id="lab-connection" class="lab-section" open><summary>1. Connessione MySQL locale</summary>
        <form id="lab-connect-form"><div class="lab-fields"><div><label for="lab-host">Indirizzo</label><select id="lab-host"><option>127.0.0.1</option></select></div><div><label for="lab-port">Porta</label><input id="lab-port" type="number" min="1" max="65535" value="${Number.isInteger(prefs.port) ? prefs.port : 3306}" required></div><div><label for="lab-database">Database</label><input id="lab-database" maxlength="64" value="${escape(safePref('database', ''))}" placeholder="farmacia" required></div><div><label for="lab-user">Utente</label><input id="lab-user" maxlength="128" value="${escape(safePref('user', 'root'))}" autocomplete="username" required></div><div><label for="lab-password">Password</label><input id="lab-password" type="password" maxlength="1024" autocomplete="current-password"></div></div>
        <p class="field-hint">Indirizzo e porta scelgono il server, il nome sceglie il database. L’app ricorda questi parametri; la password resta nella sessione e non entra nel progetto JSON. Dopo un riavvio occorre ricollegarsi.</p><div class="lab-actions"><button class="button primary" type="submit">Collega</button><button id="lab-disconnect" class="button subtle" type="button" disabled>Scollega</button></div></form>
        <p id="lab-database-hint" class="field-hint" role="status" hidden></p><p id="lab-connected" class="lab-connected" hidden></p><div class="lab-actions"><button id="lab-prepare" class="button subtle" type="button" disabled>Crea le tabelle dallo schema fisico</button><button id="lab-refresh" class="button subtle" type="button" disabled>Aggiorna tabelle</button></div><p class="field-hint">La creazione usa lo schema SQL applicato e il database scelto qui. È disponibile solo per un database vuoto; non modifica o elimina tabelle esistenti.</p>
      </details>
      <details id="lab-population" class="lab-section" open><summary>2. Popola con l’AI locale</summary>
        <p id="lab-hardware" class="field-hint" role="status">Verifica della RAM e del processore del computer…</p><label for="lab-model-advice">Modello da installare · suggerimento per questo computer</label><select id="lab-model-advice"><option value="${recommended}">Qwen3.5 2B · Q4_K_M · scelta leggera</option></select><p id="lab-advice-details" class="field-hint"></p><pre id="lab-model-command">ollama pull ${recommended}</pre><p class="field-hint">Q4_K_M riduce i pesi a circa 4 bit, con un compromesso tra qualità e memoria. Il contesto resta limitato a 4096 token; la RAM effettiva supera il download. L’AI genera valori; MySQL verifica i vincoli.</p>
        <details id="lab-ai-setup" class="lab-setup" open><summary>Installa e avvia l’AI locale sul tuo computer</summary>
          <p>Servono due componenti: <strong>Ollama</strong>, il programma che esegue l’AI, e <strong>Qwen</strong>, il modello da scaricare. Questa preparazione va fatta su ogni computer; il download richiede Internet.</p>
          <ol><li><strong>Installa Ollama per il tuo sistema.</strong><ul>
            <li><strong>Mac:</strong> scarica <a href="https://ollama.com/download/mac" target="_blank" rel="noopener">Ollama per macOS</a>, sposta l’app in Applicazioni e aprila. Consenti l’installazione del comando <code>ollama</code> se richiesta. Serve macOS 14 o successivo.</li>
            <li><strong>Windows:</strong> scarica ed esegui <a href="https://ollama.com/download/windows" target="_blank" rel="noopener">l’installer per Windows</a>, poi apri Ollama dal menu Start. Serve Windows 10 22H2 o successivo.</li>
            <li><strong>Linux:</strong> segui la <a href="https://docs.ollama.com/linux" target="_blank" rel="noopener">guida ufficiale di installazione</a>, poi avvia il servizio con <code>sudo systemctl start ollama</code>. Se non usi systemd, esegui <code>ollama serve</code> e lascia aperto quel Terminale.</li>
          </ul></li><li><strong>Scarica il modello.</strong> Apri un nuovo Terminale su Mac/Linux oppure PowerShell su Windows e incolla il comando indicato sopra, poi premi Invio:
          <p>Attendi la conferma <code>success</code>. La dimensione del download è indicata nel suggerimento; installazione e memoria richiedono spazio aggiuntivo. In caso di download interrotto, esegui di nuovo lo stesso comando.</p></li>
          <li><strong>Verifica in Trama.</strong> Lascia Ollama attivo, torna qui e premi <strong>Verifica Ollama</strong>. Quando compare il modello nel menu, collega MySQL e scegli le tabelle per generare i dati.</li></ol>
          <p>Se il comando non viene trovato, chiudi e riapri Terminale/PowerShell dopo l’installazione. Se Ollama non risponde, apri l’app su Mac/Windows; su Mac con Homebrew usa <code>brew services start ollama</code>, oppure <code>ollama serve</code> in un Terminale da lasciare aperto. Con <code>ollama list</code> puoi controllare i modelli scaricati.</p>
          <p>Dopo il download il laboratorio funziona offline e usa l’AI su questo computer. Inizia con tre righe per tabella; il modello viene rilasciato dalla memoria dopo ogni richiesta. L’editor e le query MySQL si possono usare anche senza Ollama.</p>
        </details>
        <p class="field-hint"><strong>Puoi aggiungere dati anche a un database già popolato.</strong> Le righe esistenti vengono conservate. Scegli le <strong>nuove righe per ciascuna tabella</strong> e, per i collegamenti guidati, il minimo e il massimo per ogni riga referenziata.</p>
        <details class="lab-setup"><summary>Come vengono gestiti i dati già presenti?</summary>
          <ul><li><strong>Identificatori:</strong> per le colonne AUTO_INCREMENT Trama propone nuovi ID successivi al massimo già presente.</li>
          <li><strong>Collegamenti:</strong> le chiavi esterne (FK) possono riferirsi a righe esistenti o a nuove righe della stessa proposta. Se scegli tutte le tabelle, la generazione segue le dipendenze fra di esse. Nelle tabelle con una sola FK non ricorsiva puoi attivare una distribuzione controllata da Trama, considerando anche le righe esistenti. Il minimo dello schema ER viene proposto automaticamente; per un database esterno puoi indicarlo tu.</li>
          <li><strong>Vincoli:</strong> l’AI riceve un campione delle chiavi esterne e dei valori che devono essere unici. MySQL verifica la proposta su tutti i dati presenti, controllando tipi, chiavi e CHECK. Un duplicato o un altro valore non valido può richiedere una correzione o una nuova generazione.</li>
          <li><strong>Inserimento:</strong> Genera proposta prepara soltanto un’anteprima. Inserisci queste righe aggiunge i dati dopo il tuo controllo; se un inserimento fallisce, l’intero gruppo di nuove righe viene annullato (tabelle InnoDB).</li></ul>
          <p>Esempio di prompt: «Aggiungi medicinali realistici collegati alle ditte già presenti». Scegli medicinali e imposta il numero di nuove righe nel campo qui sotto.</p>
        </details>
        <form id="lab-generate-form"><div class="lab-fields"><div><label for="lab-model">Modello installato</label><select id="lab-model"><option value="${recommended}">${recommended} · consigliato per 8 GB</option></select></div><div><label for="lab-target">Tabelle da popolare</label><select id="lab-target" disabled><option value="*">Tutte, seguendo le FK</option></select></div><div><label for="lab-count">Quantità iniziale per tabella</label><input id="lab-count" type="number" value="3" min="1" max="20" required></div></div><div id="lab-generation-plan"></div><label for="lab-prompt">Che dati vuoi?</label><textarea id="lab-prompt" rows="3" maxlength="2000" required placeholder="Dati realistici per una farmacia italiana, con medicinali a prezzi diversi e articoli venduti e non venduti.">${escape(safePref('prompt', ''))}</textarea><div class="lab-actions"><button id="lab-generate" class="button primary" type="submit" disabled>Genera proposta</button><button id="lab-ai-refresh" class="button subtle" type="button">Verifica Ollama</button></div></form>
        <p id="lab-ai-status" class="field-hint" role="status"></p><p class="field-hint">Premi <strong>Genera proposta</strong>, controlla i dati, poi premi <strong>Inserisci queste righe</strong> per aggiungerli al database. I dati generati sono esempi sintetici e realistici.</p><progress id="lab-generation-progress" value="0" max="1" aria-label="Tabelle elaborate" hidden></progress><p id="lab-generation-status" class="field-hint" role="status" aria-live="polite"></p><section id="lab-draft-section" hidden><h3>Dati proposti</h3><p class="field-hint">Controlla le nuove righe; puoi modificare valori e NULL nel JSON. La proposta è già stata verificata da MySQL senza conservare righe. Questa verifica può lasciare salti nella numerazione AUTO_INCREMENT. L’inserimento aggiunge dati e conserva quelli esistenti; se fallisce, l’intero gruppo di nuove righe viene annullato (tabelle InnoDB).</p><div id="lab-draft-preview"></div><label for="lab-draft">Proposta modificabile · JSON</label><textarea id="lab-draft" rows="12" spellcheck="false"></textarea><div class="lab-actions"><button id="lab-preview" class="button subtle" type="button">Aggiorna anteprima</button><button id="lab-insert" class="button primary" type="button">Inserisci queste righe</button></div></section><p id="lab-insert-status" class="field-hint" role="status" aria-live="polite"></p>
      </details>
      <section class="lab-section"><h3>3. Esegui e comprendi la query</h3><form id="lab-query-form"><label for="lab-sql">Query MySQL</label><textarea id="lab-sql" aria-describedby="lab-query-status" rows="5" spellcheck="false" placeholder="SELECT m.nome, d.nome FROM medicinali AS m JOIN ditte AS d ON m.id_ditta = d.id WHERE m.prezzo_con_prescrizione &gt; 5;">${escape(safePref('sql', ''))}</textarea><p class="field-hint">Una SELECT alla volta, con JOIN ON oppure giunzioni nel WHERE, filtri, GROUP BY, HAVING e ORDER BY. Per la spiegazione usa query senza sottoquery, CTE, UNION, USING o NATURAL JOIN.</p><div class="lab-actions"><button id="lab-query" class="button primary" type="submit" disabled>Esegui e spiega</button><button id="lab-example" class="button subtle" type="button" disabled>Proponi una giunzione</button></div><p id="lab-query-status" class="field-hint" role="status" aria-live="polite"></p></form><div id="lab-result" hidden></div></section>`;
    const $ = id => panel.querySelector('#' + id);
    function savePrefs() {
      prefs = { port: Number($('lab-port').value), database: $('lab-database').value, physicalDatabase, user: $('lab-user').value, model: loadedModel || prefs.model || $('lab-model').value, prompt: $('lab-prompt').value, sql: $('lab-sql').value };
      try { localStorage.setItem('trama-lab-v1', JSON.stringify(prefs)); } catch { /* Connection still works without browser storage. */ }
    }
    function syncDatabase() {
      if (busy) return;
      const name = getPhysical(false)?.result.database;
      if (session && name === connection.database && name !== physicalDatabase) { physicalDatabase = name; savePrefs(); }
      const pending = !!name && name !== physicalDatabase;
      $('lab-database-hint').hidden = !(session && pending);
      if (session && pending) {
        $('lab-database-hint').textContent = `Lo schema fisico ora usa ${name}. La connessione resta su ${connection.database}; premi Scollega per proporre il nuovo nome.`;
      } else if (!session && name && (pending || !$('lab-database').value)) {
        $('lab-database').value = name; physicalDatabase = name; savePrefs();
      }
    }
    async function api(path, data, onProgress) {
      let response;
      try { response = await fetch('/api/' + path, data ? { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Trama-Client': 'local', ...(onProgress ? { Accept: 'application/x-ndjson' } : {}) }, body: JSON.stringify({ session, ...data }) } : {}); }
      catch { throw Error('Avvia Trama con ./start_app.sh e apri http://127.0.0.1:4173 per usare il laboratorio.'); }
      if (response.ok && onProgress && response.headers.get('Content-Type')?.startsWith('application/x-ndjson')) return readGenerationStream(response.body, onProgress);
      const text = await response.text(); let value;
      try { value = JSON.parse(text); } catch { throw Error('Il laboratorio richiede il nuovo server locale: riavvia Trama con ./start_app.sh.'); }
      if (!response.ok) {
        if (value.code === 'session_expired' || value.error?.startsWith('Connessione scaduta.')) {
          session = ''; connection = null; connected([]); $('lab-connection').open = true;
        }
        throw Error(value.error || 'Operazione non riuscita.');
      }
      return value;
    }
    function controls() {
      $('lab-connect-form').querySelectorAll('input,select').forEach(e => { e.disabled = !!session || busy; });
      $('lab-connect-form').querySelector('[type="submit"]').disabled = !!session || busy;
      ['lab-disconnect', 'lab-refresh'].forEach(id => { $(id).disabled = !session || busy; });
      $('lab-prepare').disabled = !session || busy || !!tables.length;
      ['lab-target', 'lab-generate', 'lab-query', 'lab-example'].forEach(id => { $(id).disabled = !session || !tables.length || busy; });
      ['lab-preview', 'lab-ai-refresh'].forEach(id => { $(id).disabled = busy; });
      $('lab-model-advice').disabled = busy;
      $('lab-generate-form').querySelectorAll('input,textarea,select').forEach(e => { e.disabled = busy || e.dataset.planDisabled === 'true' || e.id === 'lab-target' && !tables.length; });
      $('lab-insert').disabled = !session || busy;
      $('lab-sql').disabled = busy; $('lab-draft').disabled = busy;
      panel.setAttribute('aria-busy', busy ? 'true' : 'false');
    }
    async function work(message, action, localStatus = null) {
      if (busy) return;
      busy = true; $('lab-error').hidden = true; $('lab-message').textContent = message; controls();
      if (localStatus) { $(localStatus).className = 'field-hint'; $(localStatus).textContent = message; }
      try { await action(); }
      catch (error) { $('lab-error').textContent = error.message; $('lab-error').hidden = false; $('lab-message').textContent = 'Operazione non completata.'; if (localStatus) { $(localStatus).className = 'error'; $(localStatus).textContent = error.message; if (!panel.hidden) $(localStatus).scrollIntoView({ behavior: 'auto', block: 'nearest' }); } }
      finally { busy = false; syncDatabase(); controls(); }
    }
    function connected(next) {
      tables = next;
      if (connection && planConnection !== connectionKey(connection)) { rowCounts.clear(); linkSettings.clear(); planConnection = connectionKey(connection); }
      $('lab-target').innerHTML = '<option value="*">Tutte, seguendo le FK</option>' + tables.map(t => `<option value="${escape(t.name)}">${escape(t.name)}</option>`).join('');
      $('lab-connected').hidden = !session;
      $('lab-connected').textContent = session ? `${connection.host}:${connection.port} / ${connection.database} · ${connection.version} · ${tables.length} tabelle` : '';
      renderPopulation(); onConnection(tables.length); controls();
    }
    function readPopulation() {
      tables.forEach((t, i) => {
        const value = $('lab-count-' + i)?.value;
        if (value !== undefined && value !== '') rowCounts.set(t.name, Number(value));
      });
      options.forEach((o, i) => {
        const setting = linkSettings.get(o.table);
        if (!setting) return;
        for (const key of ['min', 'max']) {
          const value = $('lab-link-' + key + '-' + i)?.value;
          if (value !== undefined && value !== '') setting[key] = Number(value);
        }
      });
    }
    function renderPopulation() {
      const selected = $('lab-target').value || '*', initial = Number($('lab-count').value) || 3;
      const chosen = t => selected === '*' || selected === t;
      options = distributionOptions(tables, getPhysical(false));
      $('lab-generation-plan').innerHTML = tables.length ? `<h3>Nuove righe per tabella</h3><p class="field-hint">Personalizza le quantità: ad esempio 5 ditte e 8 telefoni. Zero esclude una tabella dalla generazione.</p><div class="lab-fields">${tables.map((t, i) => {
        if (!rowCounts.has(t.name)) rowCounts.set(t.name, initial);
        return `<div${chosen(t.name) ? '' : ' hidden'}><label for="lab-count-${i}">${escape(t.name)}</label><input id="lab-count-${i}" type="number" min="0" max="20" value="${rowCounts.get(t.name)}"${chosen(t.name) ? ' required' : ' disabled data-plan-disabled="true"'}></div>`;
      }).join('')}</div>${options.length ? '<h3>Distribuzione dei collegamenti</h3><p class="field-hint">I limiti valgono per il totale di righe esistenti e nuove, per ogni riga della tabella referenziata. Trama copre prima il minimo, poi distribuisce le righe aggiuntive. Il massimo limita i dati di esempio; non modifica lo schema ER.</p>' : ''}${options.map((o, i) => {
        let setting = linkSettings.get(o.table);
        if (!setting) { setting = { enabled: o.er, min: o.min, max: o.max }; linkSettings.set(o.table, setting); }
        setting.min = Math.max(o.min, setting.min); if (o.max === 1) setting.max = 1;
        if (o.er && o.min > 0) setting.enabled = true;
        const relevant = chosen(o.table) || chosen(o.fk.target);
        return `<fieldset class="lab-source"${relevant ? '' : ' hidden'}><legend>${escape(o.table)} → ${escape(o.fk.target)}</legend><label><input id="lab-link-enabled-${i}" type="checkbox"${setting.enabled ? ' checked' : ''}${o.er && o.min > 0 ? ' disabled data-plan-disabled="true"' : ''}> Distribuzione guidata${o.er && o.min > 0 ? ' · richiesta dal minimo ER' : ''}</label><div class="lab-fields"><div><label for="lab-link-min-${i}">Minimo per ogni riga di ${escape(o.fk.target)}</label><input id="lab-link-min-${i}" type="number" min="${o.min}" max="20" value="${setting.min}"${setting.enabled && relevant ? ' required' : ' disabled data-plan-disabled="true"'}></div><div><label for="lab-link-max-${i}">Massimo per ogni riga di ${escape(o.fk.target)}</label><input id="lab-link-max-${i}" type="number" min="${Math.max(1, setting.min)}" max="${o.max === 1 ? 1 : 100000}" value="${setting.max}"${o.max === 1 ? ' readonly' : ''}${setting.enabled && relevant ? ' required' : ' disabled data-plan-disabled="true"'}></div></div><p class="field-hint">${o.er ? `Minimo ${o.min} ricavato dallo schema ER.` : 'Minimo ER non disponibile nel database: scegli i limiti per questo popolamento.'} Le quantità incompatibili vengono segnalate prima di generare i valori.</p></fieldset>`;
      }).join('')}` : '';
    }
    function populationRequest() {
      readPopulation();
      const selected = $('lab-target').value || '*';
      const chosen = name => selected === '*' || selected === name;
      return { table: selected, count: Object.fromEntries(tables.filter(t => chosen(t.name)).map(t => [t.name, rowCounts.get(t.name)])),
        distributions: options.filter(o => (chosen(o.table) || chosen(o.fk.target)) && linkSettings.get(o.table).enabled)
          .map(o => ({ table: o.table, columns: o.fk.columns, min: linkSettings.get(o.table).min, max: linkSettings.get(o.table).max })) };
    }
    function showAdvice() {
      const item = advice.find(a => a.model === suggested);
      $('lab-model-command').textContent = 'ollama pull ' + suggested;
      if (!item) return;
      const notes = item.ramGb === 24 ? 'Con 16 GB Apple Silicon puoi provarlo con altre app chiuse, ma il 4B lascia più margine e il 9B può essere più lento.'
        : item.ramGb === 16 ? 'Scelta equilibrata per 16 GB; più capacità del 2B, con tempi e consumo da verificare sul tuo computer.'
          : 'Scelta leggera per 8 GB; inizia con poche righe per tabella.';
      $('lab-advice-details').innerHTML = `<strong>${escape(item.label)}</strong> · download Ollama circa ${escape(item.downloadGb)} GB · ${escape(item.ramGb)} GB di RAM consigliati. ${notes} ${hardware.ramGb && hardware.ramGb < item.ramGb ? '<strong>La RAM rilevata è inferiore a quella consigliata.</strong> ' : ''}<a href="${escape(item.source)}" target="_blank" rel="noopener">Scheda su Hugging Face</a> · <a href="https://ollama.com/library/qwen3.5/tags" target="_blank" rel="noopener">Quantizzazioni e download</a>. ${installedModels.includes(suggested) ? 'Questo modello è già installato.' : 'Per usarlo, esegui il comando, poi premi Verifica Ollama: il modello comparirà nel menu dei modelli installati.'}`;
    }
    async function status() {
      const state = await api('status');
      hardware = state.hardware || {}; advice = state.modelAdvice || []; installedModels = state.models;
      if (!adviceChosen) suggested = state.defaultModel || recommended;
      if (advice.length) {
        $('lab-model-advice').innerHTML = advice.map(a => `<option value="${escape(a.model)}">${escape(a.label)} · ${escape(a.ramGb)} GB RAM consigliati${a.model === state.defaultModel ? ' · suggerito' : ''}</option>`).join('');
        $('lab-model-advice').value = suggested;
      }
      $('lab-hardware').textContent = hardware.ramGb
        ? `${hardware.appleSilicon ? 'Mac Apple Silicon' : [hardware.system, hardware.machine].filter(Boolean).join(' · ')} · ${hardware.ramGb} GB di RAM totale. ${hardware.appleSilicon ? 'Memoria condivisa tra CPU e GPU.' : 'GPU e VRAM non rilevate: il suggerimento è prudente; con la sola CPU la generazione può essere lenta.'} Il suggerimento non misura la memoria libera o la velocità e puoi cambiarlo.`
        : 'RAM non rilevabile: scegli il modello in base alla memoria del computer. Il 2B è la proposta prudente.';
      showAdvice();
      const choice = pendingModel && state.models.includes(pendingModel) ? pendingModel : loadedModel || prefs.model || suggested;
      $('lab-model').innerHTML = state.models.map(m => `<option value="${escape(m)}">${escape(m)}${m === suggested ? ' · suggerito' : ''}</option>`).join('') || `<option value="${escape(suggested)}">${escape(suggested)} · da installare</option>`;
      $('lab-model').value = state.models.includes(choice) ? choice : state.models.includes(suggested) ? suggested : state.models[0] || suggested;
      loadedModel = $('lab-model').value;
      if (loadedModel === pendingModel) pendingModel = '';
      $('lab-ai-setup').open = !!state.aiError || !state.models.length;
      $('lab-ai-status').textContent = state.aiError
        ? state.aiError + ' Segui la guida «Installa e avvia l’AI locale sul tuo computer» qui sopra, poi premi Verifica Ollama.'
        : state.models.length ? 'AI locale disponibile · scegli un modello installato.'
          : `Ollama è attivo, ma non ci sono modelli locali disponibili. Esegui ollama pull ${suggested} nel Terminale o in PowerShell, attendi la fine e premi Verifica Ollama.`;
      if (!state.dependencies) throw Error(state.dependencyError || 'Il server non ha caricato le dipendenze del laboratorio. Se le hai già installate, arresta il server con Ctrl+C, riavvia Trama con ./start_app.sh e ricarica la pagina. Altrimenti segui la sezione Avvio del README.');
    }
    $('lab-connect-form').addEventListener('submit', event => {
      event.preventDefault(); work('Connessione al server scelto…', async () => {
        const config = { host: $('lab-host').value, port: Number($('lab-port').value), database: $('lab-database').value.trim(), user: $('lab-user').value, password: $('lab-password').value };
        const value = await api('connect', config); session = value.session; connection = { ...config, password: undefined, version: value.version };
        $('lab-password').value = ''; savePrefs(); connected(value.tables); result = null; $('lab-result').hidden = true; $('lab-draft-section').hidden = !$('lab-draft').value || draftConnection !== connectionKey(connection);
        if (!$('lab-draft-section').hidden) { $('lab-insert-status').className = 'field-hint'; $('lab-insert-status').textContent = 'Ricollegato: puoi inserire la proposta conservata.'; }
        $('lab-message').textContent = value.exists ? 'Connesso al database scelto.' : 'Server collegato. Il database non esiste ancora: puoi crearlo dallo schema fisico.';
      });
    });
    $('lab-disconnect').addEventListener('click', () => work('Chiusura della connessione…', async () => {
      try { await api('disconnect', {}); } finally { session = ''; connection = null; connected([]); result = null; $('lab-result').hidden = true; $('lab-draft-section').hidden = true; }
      $('lab-message').textContent = 'Scollegato. I dati rimangono nel database.';
    }));
    $('lab-prepare').addEventListener('click', () => work('Creazione delle tabelle nel database selezionato…', async () => {
      const physical = getPhysical();
      const proposal = root.ER.copy(physical.result); proposal.database = connection.database;
      const value = await api('prepare', { sql: root.ER.physicalSQL(proposal, physical.relational) });
      connected(value.tables); $('lab-message').textContent = 'Tabelle create. Puoi generare i dati.';
    }));
    $('lab-refresh').addEventListener('click', () => work('Lettura delle tabelle…', async () => {
      const value = await api('schema', {}); connected(value.tables); result = null; $('lab-result').hidden = true; $('lab-message').textContent = 'Elenco delle tabelle aggiornato.';
    }));
    $('lab-ai-refresh').addEventListener('click', () => work('Verifica di Ollama…', async () => { await status(); $('lab-message').textContent = 'Verifica completata.'; }));
    $('lab-model-advice').addEventListener('change', () => {
      suggested = $('lab-model-advice').value; adviceChosen = true; showAdvice();
      pendingModel = installedModels.includes(suggested) ? '' : suggested;
      if (!pendingModel) { $('lab-model').value = suggested; loadedModel = suggested; savePrefs(); }
    });
    function draftPreview() {
      const draft = JSON.parse($('lab-draft').value);
      if (!Array.isArray(draft.tables) || draft.tables.length > 60) throw Error('Proposta JSON non valida.');
      $('lab-draft-preview').innerHTML = draft.tables.map(t => {
        if (!Array.isArray(t.rows) || t.rows.length > 20 || !t.rows.every(r => r && typeof r === 'object' && !Array.isArray(r))) throw Error('Righe della proposta non valide.');
        const columns = Object.keys(t.rows[0] || {});
        return `<details class="lab-source"><summary>${escape(t.name)} · ${t.rows.length} righe</summary>${dataTable({ columns, rows: t.rows.map(r => columns.map(c => r[c] ?? null)), truncated: false })}</details>`;
      }).join('');
      return draft;
    }
    $('lab-generate-form').addEventListener('submit', event => {
      event.preventDefault(); if (busy) return;
      work('Avvio della generazione locale…', async () => {
        savePrefs();
        $('lab-generation-progress').hidden = false; $('lab-generation-progress').value = 0; $('lab-generation-progress').max = 1;
        $('lab-generate').textContent = 'Generazione in corso…';
        let value;
        try {
          value = await api('generate', { model: $('lab-model').value, ...populationRequest(), prompt: $('lab-prompt').value }, progress => {
            const phases = { generating: 'Generazione dei valori', validating: 'Verifica dei vincoli MySQL', retrying: 'Correzione dei valori', completed: 'Tabella verificata' };
            const message = progress.phase === 'starting' ? 'Verifica di MySQL e del modello locale…' : `${progress.index}/${progress.total} · ${progress.table} · ${phases[progress.phase] || 'Elaborazione'}`;
            $('lab-generation-status').textContent = message; $('lab-message').textContent = message;
            if (progress.total) { $('lab-generation-progress').max = progress.total; $('lab-generation-progress').value = progress.phase === 'completed' ? progress.index : progress.index - 1; }
          });
        } finally { $('lab-generate').textContent = 'Genera proposta'; $('lab-generation-progress').hidden = true; }
        draftConnection = connectionKey(connection); $('lab-insert-status').textContent = '';
        $('lab-draft').value = JSON.stringify(value, null, 2); draftPreview(); $('lab-draft-section').hidden = false;
        $('lab-message').textContent = 'Proposta pronta: controlla i dati e premi Inserisci queste righe per popolare il database.';
        $('lab-generation-status').textContent = $('lab-message').textContent;
        if (!panel.hidden) $('lab-draft-section').scrollIntoView({ behavior: 'auto', block: 'start' });
      }, 'lab-generation-status');
    });
    $('lab-preview').addEventListener('click', () => work('Aggiornamento dell’anteprima…', async () => { draftPreview(); $('lab-message').textContent = 'Anteprima aggiornata.'; }));
    $('lab-insert').addEventListener('click', () => work('Inserimento dei dati controllati da MySQL…', async () => {
      $('lab-insert').textContent = 'Inserimento in corso…';
      try {
        const value = await api('insert', { draft: draftPreview() });
        $('lab-draft-section').hidden = true; $('lab-draft').value = ''; draftConnection = ''; result = null; $('lab-result').hidden = true;
        $('lab-message').textContent = `${value.inserted} righe inserite. Ora puoi eseguire le query.`;
        $('lab-insert-status').textContent = $('lab-message').textContent; notify(`${value.inserted} righe inserite in ${connection.database}.`);
        $('lab-generation-status').textContent = '';
      } finally { $('lab-insert').textContent = 'Inserisci queste righe'; }
    }, 'lab-insert-status'));
    function showStep(index) {
      activeStep = index; const step = result.steps[index], columnRoles = workingRoles(result);
      $('lab-visual').innerHTML = graph(result, step.phase, step.activeAliases);
      $('lab-step-title').textContent = step.label;
      const illustration = step.checks ? conditionView(step, columnRoles) : step.phase === 'group' && step.input ? groupView(step, columnRoles) : '';
      $('lab-step-data').innerHTML = `${step.description ? `<p>${escape(step.description)}</p>` : ''}${step.criteria ? `<p><code>${escape(step.criteria)}</code></p>` : ''}${illustration}${illustration ? `<h4>${step.phase === 'group' ? 'Riepilogo dei gruppi e aggregati' : 'Dopo il filtro · ' + (step.phase === 'having' ? 'gruppi mantenuti' : 'righe mantenute')}</h4>` : ''}${dataTable(step.data, { columnRoles })}`;
      $('lab-step-sql').textContent = step.sql;
      $('lab-input-sql').hidden = !step.inputSql;
      $('lab-input-sql-text').textContent = step.inputSql || '';
      $('lab-result').querySelectorAll('[data-step]').forEach(button => { const active = Number(button.dataset.step) === activeStep; button.setAttribute('aria-pressed', String(active)); button.classList.toggle('active', active); });
    }
    function showResult() {
      $('lab-result').hidden = false;
      const roles = workingRoles(result);
      const overview = result.working && result.final ? `<div class="lab-result-overview"><section><h3>${escape(result.working.label)}</h3><p class="field-hint">Tutte le colonne delle tabelle combinate, con PK, FK e clausole che le usano. ${result.steps.some(s => s.phase === 'where') ? 'WHERE ha già scelto le righe. ' : ''}GROUP BY, se presente, le raggruppa prima della proiezione SELECT.</p>${dataTable(result.working.data, { columnRoles: roles })}</section><section><h3>Tabella finale</h3><p class="field-hint">Le colonne richieste da SELECT, gli aggregati e l’eventuale ordinamento e limite.</p>${dataTable(result.final.data)}</section></div>` : '';
      $('lab-result').innerHTML = `${overview}<h3>Tabelle e colonne coinvolte</h3><p class="field-hint">Scegli un passaggio: il verde evidenzia le colonne usate in quella fase. Le linee collegano le colonne confrontate nelle giunzioni.</p><div class="lab-steps" role="group" aria-label="Passaggi logici della query">${result.steps.map((s, i) => `<button class="button subtle" type="button" data-step="${i}" aria-pressed="false">${escape(stepLabel(s, i))}</button>`).join('')}</div><div id="lab-visual"></div><ul class="lab-join-notes">${result.links.map(l => `<li><code>${escape(l.left.alias + '.' + l.left.column)} = ${escape(l.right.alias + '.' + l.right.column)}</code> · ${l.clause.toUpperCase()}</li>`).join('')}</ul><h3 id="lab-step-title"></h3><div id="lab-step-data"></div><details><summary>SQL eseguita per questo passaggio</summary><pre id="lab-step-sql"></pre></details><details id="lab-input-sql" hidden><summary>SQL della vista prima del filtro o delle righe dei gruppi</summary><pre id="lab-input-sql-text"></pre></details><p class="field-hint">${escape(result.note)}</p><details><summary>Dati delle tabelle di partenza</summary>${result.sources.map(s => `<details class="lab-source"><summary>${escape(s.name + (s.name === s.alias ? '' : ' · ' + s.alias))}</summary>${dataTable(s.sample)}</details>`).join('')}</details>`;
      showStep(result.steps.length - 1);
    }
    $('lab-result').addEventListener('click', event => { const button = event.target.closest('[data-step]'); if (button) showStep(Number(button.dataset.step)); });
    $('lab-query-form').addEventListener('submit', event => {
      event.preventDefault(); work('Esecuzione della query e dei passaggi didattici…', async () => {
        $('lab-query').textContent = 'Esecuzione in corso…';
        try {
          result = null; $('lab-result').hidden = true; savePrefs(); result = await api('query', { sql: $('lab-sql').value }); showResult();
          $('lab-query-status').textContent = $('lab-message').textContent = 'Query eseguita. Esplora i passaggi logici.';
        } finally { $('lab-query').textContent = 'Esegui e spiega'; }
      }, 'lab-query-status');
    });
    $('lab-sql').addEventListener('input', () => { result = null; $('lab-result').hidden = true; $('lab-query-status').textContent = ''; $('lab-query-status').className = 'field-hint'; });
    $('lab-example').addEventListener('click', () => {
      const table = tables.find(t => t.foreignKeys.some(f => tables.some(s => s.name === f.target))), fk = table?.foreignKeys.find(f => tables.some(t => t.name === f.target));
      const q = value => '`' + value.replace(/`/g, '``') + '`';
      $('lab-sql').value = table ? `SELECT a.*, b.*\nFROM ${q(table.name)} AS a\nJOIN ${q(fk.target)} AS b\n  ON ${fk.columns.map((c, i) => `a.${q(c)} = b.${q(fk.references[i])}`).join(' AND ')};` : `SELECT * FROM ${q(tables[0].name)};`;
      result = null; $('lab-result').hidden = true; $('lab-query-status').textContent = ''; $('lab-query-status').className = 'field-hint'; savePrefs();
    });
    panel.addEventListener('change', event => {
      if (event.target.id === 'lab-model') { loadedModel = event.target.value; pendingModel = ''; }
      if (event.target.id === 'lab-count') { tables.forEach(t => rowCounts.set(t.name, Number(event.target.value))); renderPopulation(); controls(); }
      else if (event.target.id.startsWith('lab-count-')) readPopulation();
      else if (event.target.id === 'lab-target' || event.target.id.startsWith('lab-link-')) {
        readPopulation();
        const enabled = /^lab-link-enabled-(\d+)$/.exec(event.target.id);
        if (enabled) linkSettings.get(options[Number(enabled[1])].table).enabled = event.target.checked;
        renderPopulation(); controls();
      }
      if (!event.target.closest('#lab-draft-section')) savePrefs();
    });
    controls();
    return { async activate() {
      syncDatabase();
      if (!busy && tables.length) { readPopulation(); renderPopulation(); controls(); }
      if (!loaded) { loaded = true; await work('Verifica del laboratorio locale…', async () => { await status(); $('lab-message').textContent = 'Scegli la connessione al tuo server MySQL.'; }); }
    } };
  }
  root.TramaLab = { mount, graph, dataTable, readGenerationStream, distributionOptions, workingRoles, conditionView, groupView, stepLabel };
})(typeof window !== 'undefined' ? window : globalThis);

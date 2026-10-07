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
  function dataTable(data) {
    return `<div class="lab-table-scroll"><table><thead><tr>${data.columns.map(c => `<th scope="col">${escape(c)}</th>`).join('')}</tr></thead><tbody>${data.rows.map(row => `<tr>${row.map(value => `<td>${value === null ? '<span class="lab-null">NULL</span>' : escape(value)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${Math.max(1, data.columns.length)}">Nessuna riga.</td></tr>`}</tbody></table></div><p class="field-hint">${data.rows.length} righe mostrate${data.truncated ? ' · anteprima limitata: ci sono altre righe' : ''}.</p>`;
  }
  function graph(result, phase, activeAliases = result.sources.map(s => s.alias)) {
    const width = Math.max(520, result.sources.length * 260), tallest = Math.max(...result.sources.map(s => s.columns.length));
    const height = 75 + tallest * 29 + result.links.length * 14 + 55;
    const usage = (phase === 'from' ? [] : phase === 'group' ? [...result.usage.group, ...result.usage.having] : result.usage[phase] || []).filter(r => activeAliases.includes(r.alias));
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
    const connectionKey = config => JSON.stringify([config.host, config.port, config.database]);
    try { prefs = JSON.parse(localStorage.getItem('trama-lab-v1') || '{}'); } catch { /* Existing editor storage remains independent. */ }
    const safePref = (key, fallback) => typeof prefs[key] === 'string' ? prefs[key] : fallback;
    panel.innerHTML = `<h2>Laboratorio delle query</h2><p>Collega un database locale, prepara dati di esempio e osserva come una SELECT combina e filtra le righe.</p>
      <p id="lab-message" class="field-hint" role="status" aria-live="polite"></p><p id="lab-error" class="error" role="alert" hidden></p>
      <details id="lab-connection" class="lab-section" open><summary>1. Connessione MySQL locale</summary>
        <form id="lab-connect-form"><div class="lab-fields"><div><label for="lab-host">Indirizzo</label><select id="lab-host"><option>127.0.0.1</option></select></div><div><label for="lab-port">Porta</label><input id="lab-port" type="number" min="1" max="65535" value="${Number.isInteger(prefs.port) ? prefs.port : 3306}" required></div><div><label for="lab-database">Database</label><input id="lab-database" maxlength="64" value="${escape(safePref('database', ''))}" placeholder="farmacia" required></div><div><label for="lab-user">Utente</label><input id="lab-user" maxlength="128" value="${escape(safePref('user', 'root'))}" autocomplete="username" required></div><div><label for="lab-password">Password</label><input id="lab-password" type="password" maxlength="1024" autocomplete="current-password"></div></div>
        <p class="field-hint">Indirizzo e porta scelgono il server, il nome sceglie il database. L’app ricorda questi parametri; la password resta nella sessione e non entra nel progetto JSON. Dopo un riavvio occorre ricollegarsi.</p><div class="lab-actions"><button class="button primary" type="submit">Collega</button><button id="lab-disconnect" class="button subtle" type="button" disabled>Scollega</button></div></form>
        <p id="lab-connected" class="lab-connected" hidden></p><div class="lab-actions"><button id="lab-prepare" class="button subtle" type="button" disabled>Crea le tabelle dallo schema fisico</button><button id="lab-refresh" class="button subtle" type="button" disabled>Aggiorna tabelle</button></div><p class="field-hint">La creazione usa lo schema SQL applicato e il database scelto qui. È disponibile solo per un database vuoto; non modifica o elimina tabelle esistenti.</p>
      </details>
      <details id="lab-population" class="lab-section" open><summary>2. Popola con l’AI locale</summary>
        <p class="field-hint">Su Apple Silicon con 8 GB: Qwen3.5 2B quantizzato, contesto limitato e poche righe per richiesta. L’AI genera valori; MySQL verifica i vincoli quando li inserisci.</p>
        <details id="lab-ai-setup" class="lab-setup" open><summary>Installa e avvia l’AI locale sul tuo computer</summary>
          <p>Servono due componenti: <strong>Ollama</strong>, il programma che esegue l’AI, e <strong>Qwen</strong>, il modello da scaricare. Questa preparazione va fatta su ogni computer; il download richiede Internet.</p>
          <ol><li><strong>Installa Ollama per il tuo sistema.</strong><ul>
            <li><strong>Mac:</strong> scarica <a href="https://ollama.com/download/mac" target="_blank" rel="noopener">Ollama per macOS</a>, sposta l’app in Applicazioni e aprila. Consenti l’installazione del comando <code>ollama</code> se richiesta. Serve macOS 14 o successivo.</li>
            <li><strong>Windows:</strong> scarica ed esegui <a href="https://ollama.com/download/windows" target="_blank" rel="noopener">l’installer per Windows</a>, poi apri Ollama dal menu Start. Serve Windows 10 22H2 o successivo.</li>
            <li><strong>Linux:</strong> segui la <a href="https://docs.ollama.com/linux" target="_blank" rel="noopener">guida ufficiale di installazione</a>, poi avvia il servizio con <code>sudo systemctl start ollama</code>. Se non usi systemd, esegui <code>ollama serve</code> e lascia aperto quel Terminale.</li>
          </ul></li><li><strong>Scarica il modello.</strong> Apri un nuovo Terminale su Mac/Linux oppure PowerShell su Windows e incolla questo comando, poi premi Invio:
          <pre>ollama pull ${recommended}</pre><p>Attendi la conferma <code>success</code>. Il modello pesa circa 1,9 GB su disco; installazione e memoria richiedono spazio aggiuntivo. In caso di download interrotto, esegui di nuovo lo stesso comando.</p></li>
          <li><strong>Verifica in Trama.</strong> Lascia Ollama attivo, torna qui e premi <strong>Verifica Ollama</strong>. Quando compare il modello nel menu, collega MySQL e scegli le tabelle per generare i dati.</li></ol>
          <p>Se il comando non viene trovato, chiudi e riapri Terminale/PowerShell dopo l’installazione. Se Ollama non risponde, apri l’app su Mac/Windows; su Mac con Homebrew usa <code>brew services start ollama</code>, oppure <code>ollama serve</code> in un Terminale da lasciare aperto. Con <code>ollama list</code> puoi controllare i modelli scaricati.</p>
          <p>Dopo il download il laboratorio funziona offline e usa l’AI su questo computer. Inizia con tre righe per tabella; il modello viene rilasciato dalla memoria dopo ogni richiesta. L’editor e le query MySQL si possono usare anche senza Ollama.</p>
        </details>
        <form id="lab-generate-form"><div class="lab-fields"><div><label for="lab-model">Modello installato</label><select id="lab-model"><option value="${recommended}">${recommended} · consigliato per 8 GB</option></select></div><div><label for="lab-target">Tabelle da popolare</label><select id="lab-target" disabled><option value="*">Tutte, seguendo le FK</option></select></div><div><label for="lab-count">Righe per tabella</label><input id="lab-count" type="number" value="3" min="1" max="20" required></div></div><label for="lab-prompt">Che dati vuoi?</label><textarea id="lab-prompt" rows="3" maxlength="2000" required placeholder="Dati realistici per una farmacia italiana, con medicinali a prezzi diversi e articoli venduti e non venduti.">${escape(safePref('prompt', ''))}</textarea><div class="lab-actions"><button id="lab-generate" class="button primary" type="submit" disabled>Genera proposta</button><button id="lab-ai-refresh" class="button subtle" type="button">Verifica Ollama</button></div></form>
        <p id="lab-ai-status" class="field-hint" role="status"></p><p class="field-hint">Premi <strong>Genera proposta</strong>, controlla i dati, poi premi <strong>Inserisci queste righe</strong> per popolare il database. I dati generati sono esempi sintetici e realistici.</p><progress id="lab-generation-progress" value="0" max="1" aria-label="Tabelle elaborate" hidden></progress><p id="lab-generation-status" class="field-hint" role="status" aria-live="polite"></p><section id="lab-draft-section" hidden><h3>Dati proposti</h3><p class="field-hint">Controlla le righe; puoi modificare valori e NULL nel JSON. I dati sono già verificati da MySQL senza conservare righe. Questa verifica può lasciare salti nella numerazione AUTO_INCREMENT. Gli id proposti evitano quelli già presenti. La proposta aggiunge righe e non sostituisce dati. Se un inserimento fallisce, l’intero gruppo viene annullato (tabelle InnoDB).</p><div id="lab-draft-preview"></div><label for="lab-draft">Proposta modificabile · JSON</label><textarea id="lab-draft" rows="12" spellcheck="false"></textarea><div class="lab-actions"><button id="lab-preview" class="button subtle" type="button">Aggiorna anteprima</button><button id="lab-insert" class="button primary" type="button">Inserisci queste righe</button></div></section><p id="lab-insert-status" class="field-hint" role="status" aria-live="polite"></p>
      </details>
      <section class="lab-section"><h3>3. Esegui e comprendi la query</h3><form id="lab-query-form"><label for="lab-sql">Query MySQL</label><textarea id="lab-sql" rows="5" spellcheck="false" placeholder="SELECT m.nome, d.nome FROM medicinali AS m JOIN ditte AS d ON m.id_ditta = d.id WHERE m.prezzo_con_prescrizione &gt; 5;">${escape(safePref('sql', ''))}</textarea><p class="field-hint">Una SELECT alla volta, con JOIN ON oppure giunzioni nel WHERE, filtri, GROUP BY, HAVING e ORDER BY. Per la spiegazione usa query senza sottoquery, CTE, UNION, USING o NATURAL JOIN.</p><div class="lab-actions"><button id="lab-query" class="button primary" type="submit" disabled>Esegui e spiega</button><button id="lab-example" class="button subtle" type="button" disabled>Proponi una giunzione</button></div></form><div id="lab-result" hidden></div></section>`;
    const $ = id => panel.querySelector('#' + id);
    function savePrefs() {
      prefs = { port: Number($('lab-port').value), database: $('lab-database').value, user: $('lab-user').value, model: $('lab-model').value, prompt: $('lab-prompt').value, sql: $('lab-sql').value };
      try { localStorage.setItem('trama-lab-v1', JSON.stringify(prefs)); } catch { /* Connection still works without browser storage. */ }
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
      $('lab-generate-form').querySelectorAll('input,textarea,select').forEach(e => { e.disabled = busy || e.id === 'lab-target' && !tables.length; });
      $('lab-insert').disabled = !session || busy;
      $('lab-sql').disabled = busy; $('lab-draft').disabled = busy;
      panel.setAttribute('aria-busy', busy ? 'true' : 'false');
    }
    async function work(message, action, localStatus = null) {
      if (busy) return;
      busy = true; $('lab-error').hidden = true; $('lab-message').textContent = message; controls();
      if (localStatus) { $(localStatus).className = 'field-hint'; $(localStatus).textContent = message; }
      try { await action(); }
      catch (error) { $('lab-error').textContent = error.message; $('lab-error').hidden = false; $('lab-message').textContent = 'Operazione non completata.'; if (localStatus) { $(localStatus).className = 'error'; $(localStatus).textContent = error.message; } }
      finally { busy = false; controls(); }
    }
    function connected(next) {
      tables = next;
      $('lab-target').innerHTML = '<option value="*">Tutte, seguendo le FK</option>' + tables.map(t => `<option value="${escape(t.name)}">${escape(t.name)}</option>`).join('');
      $('lab-connected').hidden = !session;
      $('lab-connected').textContent = session ? `${connection.host}:${connection.port} / ${connection.database} · ${connection.version} · ${tables.length} tabelle` : '';
      onConnection(tables.length); controls();
    }
    async function status() {
      const state = await api('status');
      const choice = loadedModel || prefs.model || recommended;
      $('lab-model').innerHTML = state.models.map(m => `<option value="${escape(m)}">${escape(m)}</option>`).join('') || `<option value="${recommended}">${recommended} · da installare</option>`;
      $('lab-model').value = state.models.includes(choice) ? choice : state.models.includes(recommended) ? recommended : state.models[0] || recommended;
      loadedModel = $('lab-model').value;
      $('lab-ai-setup').open = !!state.aiError || !state.models.length;
      $('lab-ai-status').textContent = state.aiError
        ? state.aiError + ' Segui la guida «Installa e avvia l’AI locale sul tuo computer» qui sopra, poi premi Verifica Ollama.'
        : state.models.length ? 'AI locale disponibile · scegli un modello installato.'
          : `Ollama è attivo, ma non ci sono modelli locali disponibili. Esegui ollama pull ${recommended} nel Terminale o in PowerShell, attendi la fine e premi Verifica Ollama.`;
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
          value = await api('generate', { model: $('lab-model').value, table: $('lab-target').value, count: Number($('lab-count').value), prompt: $('lab-prompt').value }, progress => {
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
      activeStep = index; const step = result.steps[index];
      $('lab-visual').innerHTML = graph(result, step.phase, step.activeAliases);
      $('lab-step-title').textContent = step.label;
      $('lab-step-data').innerHTML = dataTable(step.data);
      $('lab-step-sql').textContent = step.sql;
      $('lab-result').querySelectorAll('[data-step]').forEach(button => { const active = Number(button.dataset.step) === activeStep; button.setAttribute('aria-pressed', String(active)); button.classList.toggle('active', active); });
    }
    function showResult() {
      $('lab-result').hidden = false;
      $('lab-result').innerHTML = `<h3>Tabelle e colonne coinvolte</h3><p class="field-hint">Scegli un passaggio: il verde evidenzia le colonne usate in quella fase. Le linee collegano le colonne confrontate nelle giunzioni.</p><div class="lab-steps" role="group" aria-label="Passaggi logici della query">${result.steps.map((s, i) => `<button class="button subtle" type="button" data-step="${i}" aria-pressed="false">${escape(s.phase === 'from' ? 'FROM' : s.phase === 'join' ? 'JOIN ' + i : s.phase === 'where' ? 'WHERE' : s.phase === 'group' ? 'GROUP / HAVING' : 'SELECT')}</button>`).join('')}</div><div id="lab-visual"></div><ul class="lab-join-notes">${result.links.map(l => `<li><code>${escape(l.left.alias + '.' + l.left.column)} = ${escape(l.right.alias + '.' + l.right.column)}</code> · ${l.clause.toUpperCase()}</li>`).join('')}</ul><h3 id="lab-step-title"></h3><div id="lab-step-data"></div><details><summary>SQL eseguita per questo passaggio</summary><pre id="lab-step-sql"></pre></details><p class="field-hint">${escape(result.note)}</p><details><summary>Dati delle tabelle di partenza</summary>${result.sources.map(s => `<details class="lab-source"><summary>${escape(s.name + (s.name === s.alias ? '' : ' · ' + s.alias))}</summary>${dataTable(s.sample)}</details>`).join('')}</details>`;
      showStep(result.steps.length - 1);
    }
    $('lab-result').addEventListener('click', event => { const button = event.target.closest('[data-step]'); if (button) showStep(Number(button.dataset.step)); });
    $('lab-query-form').addEventListener('submit', event => {
      event.preventDefault(); work('Esecuzione della query e dei passaggi didattici…', async () => {
        result = null; $('lab-result').hidden = true; savePrefs(); result = await api('query', { sql: $('lab-sql').value }); showResult();
        $('lab-message').textContent = 'Query eseguita. Esplora i passaggi logici.';
      });
    });
    $('lab-sql').addEventListener('input', () => { result = null; $('lab-result').hidden = true; });
    $('lab-example').addEventListener('click', () => {
      const table = tables.find(t => t.foreignKeys.some(f => tables.some(s => s.name === f.target))), fk = table?.foreignKeys.find(f => tables.some(t => t.name === f.target));
      const q = value => '`' + value.replace(/`/g, '``') + '`';
      $('lab-sql').value = table ? `SELECT a.*, b.*\nFROM ${q(table.name)} AS a\nJOIN ${q(fk.target)} AS b\n  ON ${fk.columns.map((c, i) => `a.${q(c)} = b.${q(fk.references[i])}`).join(' AND ')};` : `SELECT * FROM ${q(tables[0].name)};`;
      result = null; $('lab-result').hidden = true; savePrefs();
    });
    panel.addEventListener('change', event => { if (event.target.id === 'lab-model') loadedModel = event.target.value; if (!event.target.closest('#lab-draft-section')) savePrefs(); });
    controls();
    return { async activate() {
      if (!$('lab-database').value) $('lab-database').value = getPhysical(false)?.result.database || '';
      if (!loaded) { loaded = true; await work('Verifica del laboratorio locale…', async () => { await status(); $('lab-message').textContent = 'Scegli la connessione al tuo server MySQL.'; }); }
    } };
  }
  root.TramaLab = { mount, graph, dataTable, readGenerationStream };
})(typeof window !== 'undefined' ? window : globalThis);

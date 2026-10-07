# Trama · editor ER

Un’app locale per gli esercizi di progettazione delle basi di dati. Disegna schemi ER, conserva una copia ristrutturata e genera lo schema relazionale con PK e FK e lo schema fisico MySQL modificabile. La notazione riprende il PDF TikTok: entità rettangolari, associazioni a rombo, attributi a cerchio e identificatori pieni.

## Avvio

Apri `index.html` nel browser per usare l’editor e generare gli schemi, anche offline. Il laboratorio delle query richiede invece il server locale descritto sotto.

Per un indirizzo locale stabile e un salvataggio coerente tra sessioni, con Python 3 disponibile:

```bash
./start_app.sh
```

Apri <http://127.0.0.1:4173>. In alternativa, con Node/npm: `npm start` (avvia lo stesso server Python, senza dipendenze npm).

Per il **Laboratorio query**, con Python 3.10 o successivo, prepara una volta l’ambiente del progetto:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
./start_app.sh
```

Esegui questi comandi nel Terminale dalla cartella del progetto, su ogni Mac: `.venv` e i pacchetti installati non si trasferiscono con Git. Lo script usa automaticamente `.venv` se presente. Le dipendenze sono PyMySQL per la connessione e SQLGlot per analizzare le SELECT MySQL; il server HTTP è quello della libreria standard Python e ascolta solo su questo Mac. Dopo aver creato `.venv` o installato le dipendenze, arresta anche un server già avviato con Ctrl+C, riavvia `./start_app.sh` e ricarica la pagina. Il laboratorio distingue un ambiente assente, dipendenze che non si caricano e un server da riavviare.

Avvia il tuo MySQL e scegli **Laboratorio query** nel selettore della vista. Indica `127.0.0.1`, porta, database, utente e password: più server locali vengono distinti dalla porta, senza scelta automatica. Il pannello mostra indirizzo, database e versione effettiva (anche MariaDB, se è il server installato). La password resta in memoria per la sessione, non viene salvata nel browser o nel JSON. Le sessioni scadono dopo un’ora senza operazioni e al riavvio del server.

Puoi collegare un database esistente oppure usare **Crea le tabelle dallo schema fisico** su un database vuoto. Questa operazione usa lo schema SQL applicato e il nome del database scelto nel laboratorio; conserva le spunte ENGINE/CHARSET. Non sostituisce tabelle esistenti. DDL MySQL non è transazionale: se una creazione fallisce, le tabelle già create restano e il pannello lo segnala.

Per generare dati prepara l’AI **su ogni computer**: servono Ollama (il programma che esegue l’AI) e Qwen (il modello). La guida nel laboratorio si apre automaticamente se Ollama non risponde o non sono disponibili modelli locali.

1. **Installa e avvia Ollama.** Su [Mac](https://ollama.com/download/mac), con macOS 14 o successivo, sposta l’app scaricata in Applicazioni, aprila e consenti l’installazione del comando `ollama` se richiesta. Su [Windows](https://ollama.com/download/windows), con Windows 10 22H2 o successivo, esegui l’installer e apri Ollama dal menu Start. Su [Linux](https://docs.ollama.com/linux), segui l’installazione ufficiale e avvia il servizio con `sudo systemctl start ollama`; senza systemd, esegui `ollama serve` in un Terminale da lasciare aperto.
2. **Scarica Qwen.** Il laboratorio legge RAM e architettura del computer e mostra un suggerimento modificabile e il relativo comando. Apri un nuovo Terminale su Mac/Linux o PowerShell su Windows, incolla il comando mostrato e premi Invio. Serve Internet per il download; attendi la conferma `success`. Se il download si interrompe, ripeti il comando. Esempio per 8 GB:

```bash
ollama pull qwen3.5:2b-q4_K_M
```

3. **Verifica nell’app.** Lascia Ollama attivo, torna al Laboratorio query e premi **Verifica Ollama**. Il modello deve comparire nel menu; poi collega MySQL e scegli le tabelle per generare dati.

Se `ollama` non viene trovato, chiudi e riapri Terminale/PowerShell dopo l’installazione. Se Ollama non risponde, avvia l’app su Mac/Windows. Per l’installazione con Homebrew su Mac usa `brew install ollama` e `brew services start ollama`; in alternativa esegui `ollama serve` e lascia aperto il Terminale. `ollama list` mostra i modelli scaricati. Senza Ollama puoi comunque usare l’editor e le query MySQL.

La scelta iniziale segue la RAM fisica e distingue Apple Silicon, anche quando Python gira sotto Rosetta. I suggerimenti sono prudenti e non misurano RAM libera, velocità o VRAM delle GPU separate. Se il rilevamento non è disponibile puoi scegliere manualmente; su Windows/Linux il consiglio considera la RAM di sistema e la generazione con la sola CPU può essere lenta. Le scelte dei modelli già installati restano disponibili e una scelta salvata non viene sostituita dal suggerimento.

| Hardware | Suggerimento | Download Ollama | Comando |
| --- | --- | --- | --- |
| 8 GB | [Qwen3.5 2B](https://huggingface.co/Qwen/Qwen3.5-2B), Q4_K_M | circa 1,9 GB | `ollama pull qwen3.5:2b-q4_K_M` |
| 16 GB | [Qwen3.5 4B](https://huggingface.co/Qwen/Qwen3.5-4B), Q4_K_M | circa 3,3 GB | `ollama pull qwen3.5:4b-q4_K_M` |
| Apple Silicon con almeno 24 GB | [Qwen3.5 9B](https://huggingface.co/Qwen/Qwen3.5-9B), Q4_K_M | circa 6,6 GB | `ollama pull qwen3.5:9b-q4_K_M` |

Dimensioni verificate il 7 ottobre 2026 nel [catalogo Ollama](https://ollama.com/library/qwen3.5/tags): sono download, non requisiti di RAM. I [GGUF su Hugging Face](https://huggingface.co/bartowski/Qwen_Qwen3.5-4B-GGUF) possono avere dimensioni diverse in base alla quantizzazione e ai componenti inclusi. Q4_K_M è il compromesso iniziale tra memoria e qualità; quantizzazioni Q8_0 aumentano la memoria dei pesi. Su questo M1 con 16 GB il consiglio è 4B; il 9B è una scelta manuale da provare con altre app chiuse, lasciando più margine con il 4B. Il laboratorio conserva contesto 4096, tre righe iniziali, una richiesta alla volta e rilascio della memoria dopo ogni richiesta. La fluidità e la qualità dei dati del 4B/9B restano da misurare sul dispositivo, soprattutto con MySQL e browser aperti.

La selezione deriva da schede e benchmark generali, non da una classifica misurata sul popolamento di questi database. Ho confrontato anche [Qwen3-4B-Instruct-2507](https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507), che produce risposte senza fase di ragionamento, [Gemma 4 E4B](https://huggingface.co/google/gemma-4-E4B-it) e [Phi-4-mini-instruct](https://huggingface.co/microsoft/Phi-4-mini-instruct), che include l’italiano fra le lingue supportate. Qwen3.5 mantiene il percorso Ollama già usato dall’app e offre tre tag quantizzati verificati. Gemma E4B ha circa 8B parametri totali con gli embedding, pur avendo circa 4,5B effettivi: la sola sigla non basta per stimare la memoria. Per confrontare le alternative sul caso didattico servono generazioni con lo stesso schema, prompt e numero di righe, misurando tempi, vincoli e correzioni richieste. Dopo il download il laboratorio usa solo Ollama locale sulla porta 11434.

Scrivi un prompt e scegli tutte le tabelle oppure una singola tabella. La generazione segue le FK; l’app assegna gli AUTO_INCREMENT e fornisce all’AI i riferimenti esistenti/proposti e un campione delle chiavi uniche. Il modello produce JSON strutturato, mai SQL da eseguire. La proposta viene verificata con inserimenti di prova annullati: MySQL controlla tipi, PK, UNIQUE, FK e CHECK. Questa verifica può lasciare salti nell’AUTO_INCREMENT, senza conservare righe. Controlla l’anteprima, modifica i valori nel JSON se necessario, poi premi **Inserisci queste righe**. Gli INSERT sono parametrizzati e aggiungono dati; con un errore, il gruppo viene annullato. Per garantire questo comportamento il popolamento richiede tabelle InnoDB. Cambiamenti concorrenti possono invalidare una proposta: in quel caso non viene inserita parzialmente. Le FK cicliche richiedono popolamento di una tabella alla volta con riferimenti già disponibili. Limiti: 20 righe per tabella, 30 colonne per generazione, contesto contenuto; per schemi grandi riduci le righe o genera una tabella alla volta.

**Quantità e distribuzione.** Puoi impostare quantità diverse per ciascuna tabella, da 0 a 20 nuove righe; zero esclude una tabella. Ad esempio, 5 ditte e 8 telefoni. Per le tabelle con una sola FK non ricorsiva nello stesso database, la distribuzione guidata assegna i collegamenti direttamente in Trama: prima copre il minimo di ogni riga referenziata, poi distribuisce le righe aggiuntive privilegiando quelle meno servite. Il minimo viene ricavato dallo schema ER quando le tabelle e le FK corrispondono allo schema fisico applicato; una partecipazione obbligatoria non può essere disattivata. Su database esterni la scelta è esplicita, perché una FK SQL non permette di ricostruire il minimo ER. Il massimo limita il popolamento di esempio e rispetta le FK univoche (massimo 1). Minimo e massimo considerano il totale di collegamenti esistenti e nuovi. Le quantità impossibili vengono rifiutate prima di interrogare il modello per generare valori; i limiti vengono verificati anche nell’inserimento finale dopo le modifiche al JSON. La distribuzione guidata gestisce fino a 200 righe nella tabella referenziata, anche con chiavi composte; se servono più di 20 nuove righe per coprire il minimo non è possibile completarlo in una sola generazione. Tabelle con più FK, associazioni N:M e riferimenti ricorsivi conservano la generazione con scelta dei riferimenti affidata al modello e verifica MySQL.

L’avanzamento appare vicino a **Genera proposta**, con tabella corrente, numero sul totale e fasi di generazione, verifica o correzione. Gli eventi arrivano dal server durante l’operazione; anche gli errori sono mostrati vicino al pulsante. Al termine l’app porta in vista i dati proposti. La generazione prepara un’anteprima: **Inserisci queste righe** è il passaggio che popola il database. Per gli esercizi chiedi “dati realistici di esempio”: il modello locale genera dati sintetici e non verifica fatti o fonti reali.

Le lunghezze di `CHAR(n)` e `VARCHAR(n)` vengono incluse sia nello schema JSON richiesto a Ollama sia nel contesto del modello. Per telefoni e fax viene richiesto un formato compatto, con prefissi inclusi nel limite. Il controllo locale conserva la verifica e indica lunghezza ricevuta e massima in caso di errore; i valori troppo lunghi vengono rifiutati, senza tagliarli automaticamente.

L’inserimento mostra avanzamento, conferma o errore accanto al pulsante. Se la sessione scade, il modulo di connessione si riabilita e la proposta resta disponibile nella pagina: ricollegati allo stesso server e database per inserirla. La proposta non viene conservata dopo una ricarica della pagina. Nello schema fisico, **Applica scelte SQL** è disponibile anche accanto al nome del database e salva il nuovo nome nel progetto e nello script.

**Esegui e spiega** esegue una sola SELECT in transazione di lettura. La vista mostra tabelle e alias, colonne evidenziate per fase, linee delle uguaglianze di giunzione e righe dei passaggi `FROM → JOIN → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → LIMIT`. La tabella intermedia conserva tutte le colonne delle tabelle combinate, con etichette PK/FK e clausole coinvolte, accanto alla tabella finale. WHERE e HAVING mostrano anche la vista prima del filtro: condizioni VERO/FALSO/NULL e righe mantenute in verde o scartate in grigio. AND e OR rispettano le parentesi e la logica SQL dei NULL; non vengono applicati come filtri sequenziali. GROUP BY mostra le righe di ciascun gruppo e gli aggregati; ORDER BY ha un passaggio separato con criteri ASC/DESC. Ogni passaggio è una query reale sullo stesso snapshot, non una simulazione del piano dell’ottimizzatore. I dati iniziali mostrano fino a 12 righe e i risultati fino a 200, con indicazione delle anteprime limitate: gli aggregati considerano comunque tutte le righe. Sono supportati JOIN ON, LEFT/RIGHT JOIN, giunzioni nel WHERE, filtri, aggregazioni, GROUP BY, HAVING, DISTINCT, ORDER BY e LIMIT. CTE, UNION, sottoquery, USING, NATURAL JOIN e funzioni finestra restano fuori dalla spiegazione. Le funzioni ammesse coprono aggregazioni, testo, numeri e date; le altre vengono segnalate prima dell’esecuzione. Il server limita i tempi delle query e non ammette scritture, altri database, file, variabili o funzioni arbitrarie nel laboratorio.

L’esito della query appare subito sotto **Esegui e spiega**: il pulsante indica l’esecuzione in corso e un errore viene portato in vista accanto alla query, conservando il testo SQL per correggerlo. Modificare la query cancella l’esito precedente; una nuova esecuzione aggiorna il messaggio locale e i passaggi grafici.

Verifica iniziale del laboratorio: Qwen3.5 2B reale ha generato tre righe per ciascuna delle sei tabelle della farmacia; 18 righe verificate e inserite e una query JOIN/WHERE corretta in circa 41 secondi sul Mac M1 da 16 GB, con MariaDB 10.4 temporaneo. Verifica della distribuzione del 7 ottobre: MySQL 8.0.44 isolato e Ollama Qwen3.5 4B reale hanno generato e inserito 5 ditte con 8 telefoni (2, 2, 2, 1, 1), poi altri due telefoni alle ditte meno servite, in 32,42 secondi complessivi. I test includono il rollback di un JSON modificato che supera il massimo e quantità incompatibili rifiutate prima della generazione dei valori. Il percorso è stato verificato anche nel browser desktop, inclusi errore locale della query e risultato corretto con due telefoni della stessa ditta; la vista mobile non è stata verificata in questa sessione.

## Come usarla

1. In **Struttura**, aggiungi le entità e i loro attributi, uno per riga.
2. Aggiungi le associazioni scegliendo due partecipanti e le rispettive cardinalità. Per la ricorsione, scegli la stessa entità due volte e assegna ruoli distinti.
3. Premi **Applica allo schema**. Trascina rettangoli, rombi o cerchi per sistemare il disegno. Nel modulo trovi un unico controllo **Posizione degli attributi**: seleziona le caselle oppure premi **Seleziona tutti**, poi scegli sopra/sotto/destra/sinistra dal menu **Sposta la selezione**. Per un elemento esistente, il diagramma mostra subito l’anteprima; premi **Applica allo schema** o **Applica disposizione** per salvarla. Tornando allo schema senza applicare, l’anteprima viene scartata. Un composto sposta anche le sue componenti. Le disposizioni sono modificabili anche sul diagramma ristrutturato, aprendo il suo elemento.
4. Aggiungi eventuali gerarchie scegliendo padre, figlie, copertura totale/parziale, appartenenza esclusiva/sovrapposta e strategia. Premi **Ristruttura ER**: l’originale rimane disponibile nel selettore della vista, insieme al rapporto delle trasformazioni e ai vincoli da conservare.
5. Premi **Genera relazionale** per ottenere relazioni, chiavi, FK, nullabilità e unicità. La rappresentazione iniziale è **Notazione compatta (PDF TikTok)**, come a pagina 7: `Relazione(attributi)`, PK sottolineate, FK con doppia sottolineatura blu e `*` per gli opzionali. Una PK composta viene mostrata come un unico gruppo con una sola sottolineatura continua, anche quando i suoi attributi sono FK: ad esempio `segue(id_follower, id_seguito_da)`. I riferimenti delle due FK rimangono separati nel dettaglio. Il selettore **Rappresentazione** permette di passare al dettaglio delle tabelle. Le relazioni derivate dalle entità ricevono nomi al plurale: medicinale → medicinali, utilizzo → utilizzi, ditta → ditte, articolo → articoli. Le associazioni N:M conservano il nome dell’associazione. Le FK vengono dedotte dalle associazioni e dagli identificatori esterni e hanno nomi come `id_ditta`, dal nome singolare dell’entità referenziata. I ruoli distinguono i riferimenti alla stessa entità (`id_mittente`, `id_destinatario`); le chiavi composte aggiungono il nome della componente dopo il prefisso. Nei nomi composti si pluralizza la testa: numero di telefono → numeri di telefono; `n_telefono` nei nomi generati viene espanso in `numeri_di_telefono`. Se l’originale cambia, il risultato viene segnalato **Da rigenerare**; rigenerarlo sostituisce la copia derivata, comprese le sue disposizioni manuali.
6. Premi **Genera SQL** per ottenere lo schema fisico MySQL. Scegli la tabella e modifica nome SQL, tipi (anche `ENUM`), `UNSIGNED`, nullabilità, `AUTO_INCREMENT`, `UNIQUE`, `DEFAULT` e azioni `ON DELETE`/`ON UPDATE`. Le spunte **ENGINE=InnoDB** e **DEFAULT CHARSET=utf8mb4** includono le clausole in tutte le tabelle; sono inizialmente disattivate nelle nuove proposte. CHARSET vale anche per CREATE DATABASE. Per le azioni FK puoi scegliere **Non specificare**: la nota **Come scegliere ON DELETE e ON UPDATE** spiega RESTRICT, CASCADE, SET NULL e NO ACTION. RESTRICT e NO ACTION, se selezionati, sono scritti esplicitamente nello script. Le FK ereditano tipo e segno dalla chiave referenziata: modifica la colonna di origine per aggiornare tutte le FK. Aggiungi una condizione CHECK per riga, ad esempio `prezzo >= 0`, anche su più colonne della stessa tabella. Premi **Applica scelte SQL**, poi **Copia SQL** o **Esporta SQL**. Le scelte sono salvate e incluse in Annulla/Ripristina. Ripetere Genera SQL sullo stesso schema le conserva; rigenerare dopo una modifica strutturale richiede conferma prima di sostituirle.
7. Usa **Esporta → Progetto modificabile (JSON)** per conservare originale e risultati, incluse le scelte SQL, e **Apri** per ricaricarli. SVG e PNG esportano lo schema ER visualizzato; il relazionale si esporta in TXT e il fisico in SQL. **Stampa / Salva PDF** stampa la vista corrente.

La proposta SQL segue le convenzioni delle pagine 8–14 del PDF: identificatori `MEDIUMINT UNSIGNED`, clausole PK/FK esplicite e tipi suggeriti dal nome dell’attributo. Sono suggerimenti da controllare prima dell’esecuzione. Il generatore ordina le tabelle secondo le dipendenze; per i cicli aggiunge le FK con `ALTER TABLE` dopo le creazioni. Lo script include InnoDB e utf8mb4 quando selezionati e richiede MySQL 8.0.16 o successivo per i CHECK. Il controllo dell’editor verifica struttura e combinazioni delle opzioni; MySQL verifica grammatica e semantica delle espressioni quando esegui lo script. I vincoli che coinvolgono altre righe o tabelle sono conservati nei commenti SQL, da gestire con controlli applicativi o trigger. Lo script crea le tabelle e non aggiorna tabelle già esistenti.

I due esempi TikTok riprendono gli schemi originali e ristrutturati a pagina 6 del PDF fornito dall’utente. Sono disponibili anche Studenti e corsi e **Persone e corsi**, con composto opzionale, telefoni multipli e gerarchia.

## Input da testo

La scheda **Da testo** accetta una descrizione strutturata, non un testo in linguaggio naturale. Gli attributi con `[ID]` oppure `[PK]` sono parti dell’identificatore; senza indicazioni sono obbligatori e monovalore `(1,1)`. I due marcatori sono equivalenti, anche nei moduli, e vengono uniformati a `[ID]` nella descrizione generata dall’app.

```text
TITOLO: Studenti e corsi

ENTITA: Studente
- matricola [ID]
- nome
- email [0,1]
- telefono [0,N]

ENTITA: Corso
- codice [ID]
- titolo

ASSOCIAZIONE: frequenta: Studente [0,N] -> Corso [0,N]
- data_iscrizione
```

Un’associazione può avere attributi. Più attributi `[ID]` o `[PK]` nella stessa entità formano un identificatore composto. Sono accettate le cardinalità `[0,1]`, `[1,1]`, `[0,N]` e `[1,N]`, anche per gli attributi.

La sintassi è specifica di Trama, non uno standard ER. Un attributo composto usa due spazi di rientro per livello, nei moduli e nella descrizione completa:

```text
ENTITA: Persona
- codice [PK]
- indirizzo [0,1]
  - via
  - civico
  - città
- telefoni [0,N]

ENTITA: Studente
- matricola
ENTITA: Docente
- stipendio

GERARCHIA: Persona [PARZIALE, ESCLUSIVA, PADRE] -> Studente, Docente
```

Le alternative sono `TOTALE`/`PARZIALE`, `ESCLUSIVA`/`SOVRAPPOSTA` e `PADRE`/`FIGLIE`/`SEPARATE`. `FIGLIE` richiede una gerarchia totale; `SEPARATE` è la strategia predefinita e sostituisce la gerarchia con associazioni ISA e identificazione attraverso il padre. Sono ammesse gerarchie annidate, senza cicli né ereditarietà multipla.

Gli identificatori esterni possono essere esplicitati nel testo (o generati dalla ristrutturazione):

```text
ENTITA: Persona
- codice [PK]
ENTITA: Telefono
- numero
ASSOCIAZIONE: ha_telefono: Persona [0,N] -> Telefono [1,1]
IDENTIFICATORE ESTERNO: Telefono: numero -> Persona (ha_telefono)
VINCOLO: Una persona deve avere almeno un recapito verificato.
```

La parte locale può essere vuota; più proprietari si separano con `;`. `VINCOLO` conserva una regola testuale, senza verificarla automaticamente.

La ristrutturazione appiattisce i composti e trasferisce i multivalore in entità dedicate, con un identificatore proprio `id` e un attributo separato per il valore, derivato dal nome originale. Per i valori composti conserva le componenti, inclusa l’estrazione delle collezioni annidate. Il collegamento al proprietario diventa una FK nel relazionale; il vincolo che impedisce valori duplicati per lo stesso proprietario resta esplicito nei vincoli residui. Per gli accorpamenti conserva discriminatori, condizioni di appartenenza e obbligatorietà nel rapporto. Il relazionale traduce associazioni N:M in relazioni dedicate e 1:N in FK sul lato che partecipa al massimo una volta; per 1:1 preferisce il lato obbligatorio, altrimenti il primo partecipante, e aggiunge UNIQUE. I vincoli testuali richiedono una gestione esplicita nello schema fisico.

La ricorsione usa ruoli fra parentesi:

```text
ASSOCIAZIONE: segue: Utente (follower) [0,N] -> Utente (seguito_da) [0,N]
```

I nomi non possono contenere `:`, parentesi quadre o a capo; per entità e ruoli, le parentesi tonde sono riservate alla sintassi dei ruoli. Le righe che iniziano con `#` sono commenti. La generazione da testo ridispone il diagramma: il JSON conserva le posizioni personalizzate.

## Vista e tastiera

- Trascina lo sfondo o usa la rotella per spostare la vista.
- Pulsanti `+`/`−` o Ctrl/⌘ + rotella: zoom. Il pulsante percentuale ripristina il 100%; **Adatta alla finestra** mostra l’intero schema.
- Doppio clic su un elemento: modifica. Con la tastiera, Tab lo seleziona e Invio apre il modulo.
- Frecce: spostamento di 5 unità; Maiusc + frecce: 25 unità.
- Ctrl/⌘ + Z: annulla; Ctrl/⌘ + Maiusc + Z: ripristina. Lo storico comprende fino a 60 operazioni nella sessione corrente.
- **Riordina** confronta disposizioni basate sui collegamenti, privilegiando centri allineati, linee rette e uno schema equilibrato. Negli schemi piccoli considera anche celle vuote, così le ramificazioni possono occupare lati diversi senza diagonali obbligate. Colloca i rombi a metà strada fra le entità; quando serve spazio li sposta mantenendo uguale distanza dai partecipanti. Riassegna anche i lati degli attributi, suddividendo i ventagli lunghi e mantenendo insieme gli attributi composti. L’operazione si può annullare.

## Salvataggio e limiti

Il browser conserva l’ultimo schema applicato e la bozza testuale. Le modifiche di un modulo vanno applicate prima di essere salvate. La memoria locale dipende dal browser e dall’indirizzo usato; con `file://` il comportamento può variare. Il JSON esportato è la copia trasferibile del progetto.

Questa versione gestisce fino a 60 entità, 120 associazioni binarie e 60 attributi complessivi per elemento, con massimo 30 per livello e cinque livelli di rientro; file e descrizioni fino a 1 MB. I limiti valgono anche per lo schema ristrutturato: un’espansione eccessiva viene segnalata senza modificare l’originale. PNG: massimo 16 milioni di pixel e 8192 px per lato; SVG conserva il disegno vettoriale.

La disposizione automatica cerca di separare associazioni e attributi ma non elimina tutti gli incroci, soprattutto su schemi grandi. Nodi e attributi si possono riposizionare manualmente. Non interpreta automaticamente i vincoli testuali: nella fase fisica puoi tradurre in CHECK le regole sulla singola riga. Associazioni n-arie ed ereditarietà multipla restano fuori da questa versione. Ogni entità deve avere un identificatore locale o esterno per generare il relazionale e il fisico.

## Verifica e file

```bash
npm test
.venv/bin/python -m unittest discover -s tests -p test_lab.py
```

I test nativi Node verificano parser, cardinalità, ricorsione, input non validi, roundtrip, coordinate, escaping SVG, disposizione, lati di attributi singoli/gruppi, ristrutturazione delle gerarchie, traduzione relazionale e generazione SQL (tipi, FK, CHECK, opzioni incompatibili e dipendenze cicliche). Sono state provate nel browser anche creazione/modifica/eliminazione, trascinamento, tastiera, persistenza, importazione JSON, esportazioni, viste derivate, apertura diretta del file HTML e Riordina sui due esempi TikTok. Per il fisico sono stati verificati modifica dei tipi, propagazione delle FK, CHECK, errori, Annulla/Ripristina e persistenza dopo ricaricamento. Cinque script di esempio hanno creato 30 tabelle su MariaDB 10.4 locale; non è stata eseguita una prova diretta su MySQL 8.

Il controllo browser di selezione e anteprima è ripetibile con Playwright disponibile esternamente, senza aggiungere dipendenze all’app: `node tests/editor.browser.cjs /percorso/al/modulo/playwright`, con il server locale avviato. Verifica selezioni singole/gruppi/tutti, anteprima non salvata, scarto, persistenza e layout mobile.

- `model.js`: modello validato, sintassi, esempi, disposizione e SVG.
- `restructure.js`: trasformazione ER e conservazione dei vincoli residui.
- `relational.js`: traduzione di chiavi/associazioni e testo relazionale.
- `physical.js`: proposta dei tipi, validazione delle scelte fisiche e generazione MySQL.
- `app.js`: editor, interazione, persistenza ed esportazioni.
- `lab.js`: connessione, proposte AI e visualizzazione dei passaggi delle query.
- `server.py` / `requirements.txt`: laboratorio locale MySQL e chiamate a Ollama.
- `index.html` / `styles.css`: interfaccia responsive.
- `PLAN.md`: avanzamento dei task.
- `PRODUCT.md` / `DESIGN.md`: contesto e scelte dell’interfaccia.

La scelta è **HTML + CSS + JavaScript + SVG** per l’editor, senza dipendenze di esecuzione. Il laboratorio aggiunge un backend Python locale per MySQL e Ollama; non richiede account o servizi cloud.

Per la parte grafica sono state consultate tramite [skills.sh](https://skills.sh/) le skill [Impeccable](https://skills.sh/pbakaus/impeccable/impeccable) e [Taste](https://skills.sh/leonxlnx/taste-skill/design-taste-frontend), insieme a find-skills, PDF e Ponytail. Di Taste sono state usate le indicazioni pertinenti; la skill è orientata principalmente a landing page e portfolio. Playwright è stato usato solo per le prove, in una cartella temporanea esterna al progetto.

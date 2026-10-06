# Trama · editor ER

Un’app locale per gli esercizi di progettazione delle basi di dati. Disegna schemi ER, conserva una copia ristrutturata e genera lo schema relazionale con PK e FK. La notazione riprende il PDF TikTok: entità rettangolari, associazioni a rombo, attributi a cerchio e identificatori pieni.

## Avvio

Apri `index.html` nel browser. Non servono installazioni, compilazione o connessione Internet.

Per un indirizzo locale stabile e un salvataggio coerente tra sessioni, con Python 3 disponibile:

```bash
./start_app.sh
```

Apri <http://127.0.0.1:4173>. In alternativa, con Node/npm: `npm start` (avvia lo stesso server Python, senza dipendenze npm).

## Come usarla

1. In **Struttura**, aggiungi le entità e i loro attributi, uno per riga.
2. Aggiungi le associazioni scegliendo due partecipanti e le rispettive cardinalità. Per la ricorsione, scegli la stessa entità due volte e assegna ruoli distinti.
3. Premi **Applica allo schema**. Trascina rettangoli, rombi o cerchi per sistemare il disegno. Nel modulo trovi un unico controllo **Posizione degli attributi**: seleziona le caselle oppure premi **Seleziona tutti**, poi scegli sopra/sotto/destra/sinistra dal menu **Sposta la selezione**. Per un elemento esistente, il diagramma mostra subito l’anteprima; premi **Applica allo schema** o **Applica disposizione** per salvarla. Tornando allo schema senza applicare, l’anteprima viene scartata. Un composto sposta anche le sue componenti. Le disposizioni sono modificabili anche sul diagramma ristrutturato, aprendo il suo elemento.
4. Aggiungi eventuali gerarchie scegliendo padre, figlie, copertura totale/parziale, appartenenza esclusiva/sovrapposta e strategia. Premi **Ristruttura ER**: l’originale rimane disponibile nel selettore della vista, insieme al rapporto delle trasformazioni e ai vincoli da conservare.
5. Premi **Genera relazionale** per ottenere relazioni, chiavi, FK, nullabilità e unicità. La rappresentazione iniziale è **Notazione compatta (PDF TikTok)**, come a pagina 7: `Relazione(attributi)`, PK sottolineate, FK con doppia sottolineatura blu e `*` per gli opzionali. Una PK composta viene mostrata come un unico gruppo con una sola sottolineatura continua, anche quando i suoi attributi sono FK: ad esempio `segue(follower_id, seguito_da_id)`. I riferimenti delle due FK rimangono separati nel dettaglio. Il selettore **Rappresentazione** permette di passare al dettaglio delle tabelle. Le FK vengono dedotte dalle associazioni e dagli identificatori esterni. Se l’originale cambia, il risultato viene segnalato **Da rigenerare**; rigenerarlo sostituisce la copia derivata, comprese le sue disposizioni manuali.
6. Usa **Esporta → Progetto modificabile (JSON)** per conservare originale e risultato, e **Apri** per ricaricarli. SVG e PNG esportano lo schema ER visualizzato; il relazionale si esporta in TXT. **Stampa / Salva PDF** stampa la vista corrente.

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

La ristrutturazione appiattisce i composti e trasferisce i multivalore in entità dedicate. Per collezioni di valori composti genera un progressivo locale e conserva come vincolo l’unicità della tupla completa. Per gli accorpamenti conserva discriminatori, condizioni di appartenenza e obbligatorietà nel rapporto. Il relazionale traduce associazioni N:M in relazioni dedicate e 1:N in FK sul lato che partecipa al massimo una volta; per 1:1 preferisce il lato obbligatorio, altrimenti il primo partecipante, e aggiunge UNIQUE. Questi vincoli testuali richiederanno una gestione esplicita nell’eventuale schema fisico.

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
- **Riordina** ricolloca entità e associazioni considerando anche lo spazio dei loro attributi. Ripristina le posizioni automatiche dei cerchi, mantenendo i lati assegnati ad attributi singoli o gruppi. L’operazione si può annullare.

## Salvataggio e limiti

Il browser conserva l’ultimo schema applicato e la bozza testuale. Le modifiche di un modulo vanno applicate prima di essere salvate. La memoria locale dipende dal browser e dall’indirizzo usato; con `file://` il comportamento può variare. Il JSON esportato è la copia trasferibile del progetto.

Questa versione gestisce fino a 60 entità, 120 associazioni binarie e 60 attributi complessivi per elemento, con massimo 30 per livello e cinque livelli di rientro; file e descrizioni fino a 1 MB. I limiti valgono anche per lo schema ristrutturato: un’espansione eccessiva viene segnalata senza modificare l’originale. PNG: massimo 16 milioni di pixel e 8192 px per lato; SVG conserva il disegno vettoriale.

La disposizione automatica cerca di separare associazioni e attributi ma non elimina tutti gli incroci, soprattutto su schemi grandi. Nodi e attributi si possono riposizionare manualmente. Non verifica vincoli espressi nel testo, come “almeno una foto o un video”. Schema fisico, SQL, tipi dei dati, associazioni n-arie ed ereditarietà multipla restano fuori da questa versione. Ogni entità deve avere un identificatore locale o esterno per generare il relazionale.

## Verifica e file

```bash
npm test
```

I test nativi Node verificano parser, cardinalità, ricorsione, input non validi, roundtrip, coordinate, escaping SVG, disposizione, lati di attributi singoli/gruppi, ristrutturazione delle gerarchie e traduzione relazionale. Sono state provate nel browser anche creazione/modifica/eliminazione, trascinamento, tastiera, persistenza, importazione JSON, esportazioni, viste derivate, apertura diretta del file HTML e Riordina sui due esempi TikTok.

Il controllo browser di selezione e anteprima è ripetibile con Playwright disponibile esternamente, senza aggiungere dipendenze all’app: `node tests/editor.browser.cjs /percorso/al/modulo/playwright`, con il server locale avviato. Verifica selezioni singole/gruppi/tutti, anteprima non salvata, scarto, persistenza e layout mobile.

- `model.js`: modello validato, sintassi, esempi, disposizione e SVG.
- `restructure.js`: trasformazione ER e conservazione dei vincoli residui.
- `relational.js`: traduzione di chiavi/associazioni e testo relazionale.
- `app.js`: editor, interazione, persistenza ed esportazioni.
- `index.html` / `styles.css`: interfaccia responsive.
- `PLAN.md`: avanzamento dei task.
- `PRODUCT.md` / `DESIGN.md`: contesto e scelte dell’interfaccia.

La scelta è **HTML + CSS + JavaScript + SVG**: il browser copre disegno, interazione e trasformazioni, senza dipendenze di esecuzione. Un backend servirà se verranno richiesti account, collaborazione o interpretazione della traccia tramite un servizio AI.

Per la parte grafica sono state consultate tramite [skills.sh](https://skills.sh/) le skill [Impeccable](https://skills.sh/pbakaus/impeccable/impeccable) e [Taste](https://skills.sh/leonxlnx/taste-skill/design-taste-frontend), insieme a find-skills, PDF e Ponytail. Di Taste sono state usate le indicazioni pertinenti; la skill è orientata principalmente a landing page e portfolio. Playwright è stato usato solo per le prove, in una cartella temporanea esterna al progetto.

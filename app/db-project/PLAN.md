# Piano di lavoro · editor ER

## Obiettivo
App didattica locale per descrivere e disegnare lo schema ER iniziale, derivarne una ristrutturazione controllata e generare lo schema relazionale e fisico. HTML, CSS, JavaScript e SVG per l’editor; laboratorio MySQL/Ollama con backend Python locale.

## 1. Comprendere il riferimento
- [x] Leggere la traccia e le analisi rilevanti del PDF.
- [x] Esaminare visivamente i due schemi ER a pagina 6.
- [x] Confermare uso didattico e costruzione diretta con l’utente.
- [x] Consultare find-skills, skills.sh, Taste, Impeccable, PDF e Ponytail.

## 2. Modello e generazione
- [x] Entità, attributi identificatori/opzionali/multivalore.
- [x] Associazioni binarie, cardinalità, ruoli e ricorsione.
- [x] Parser di testo strutturato e validazione del progetto.
- [x] Disegno SVG e disposizione iniziale.
- [x] Esempi TikTok originale e ristrutturato.
- [x] Verifiche eseguibili del modello e del parser.

## 3. Editor
- [x] Struttura HTML e stile responsive.
- [x] Moduli per creazione, modifica ed eliminazione.
- [x] Generazione da testo con errori comprensibili.
- [x] Trascinamento di nodi/attributi, pan, zoom e tastiera.
- [x] Annulla/ripristina e salvataggio locale.
- [x] Import/export JSON, SVG, PNG e stampa/PDF.
- [x] Gestione perdita dati, stati vuoti e accessibilità.

## 4. Verifica e consegna
- [x] Test funzionali del modello.
- [x] Prova nel browser di creazione, modifica, import/export e persistenza.
- [x] Ispezione grafica desktop e mobile, compreso avvio mobile e apertura file://.
- [x] Correzione dei difetti materiali: posizionamento di nuove entità, testi piccoli, layout mobile e nomi con parentesi.
- [x] Correzione segnalata dall’utente: collegamenti multipli distinti, con test orizzontali/verticali e rombi a distanze diverse.
- [x] Verifica dell’albero accessibile: nodi e attributi esposti come controlli; revisione indipendente conclusa con entrambi i rilievi risolti.
- [x] README con avvio, sintassi, funzionalità e limiti.
- [x] Documentazione grafica finale: DESIGN.md e sidecar Impeccable verificati.
- [x] Stampa/PDF esaminata visivamente: schema completo su una pagina.
- [x] Aggiornamento finale del piano.

## Esito
ER iniziale, ER ristrutturato e schema relazionale implementati; pagina locale avviata su http://127.0.0.1:4173. Tre suite native e prove nel browser superate, comprese gerarchie, selezioni di attributi, salvataggio, notazione compatta del PDF, esportazioni e vista mobile. La revisione indipendente ha confermato la risoluzione dei due rilievi finali: separazione di gerarchia/composto e stile ISA nell’SVG esportato.

## Correzioni segnalate dopo la consegna
- [x] Allineare le curve quando i tratti perpendicolari sono separati, mantenendo corsie distinte per tratti sovrapposti.
- [x] Dimensionare la griglia di `Riordina` considerando nodi e tutti gli attributi.
- [x] Collocare rombi e relativi attributi senza sovrapporre gli ingombri già occupati.
- [x] Regressioni: esempi TikTok, 30 attributi, associazioni ripetute, ricorsione, stabilità e conservazione del contenuto.
- [x] Prova nel browser dei due esempi con ingombri SVG effettivi e ripristino tramite Annulla.
- [x] Correggere la posizione di cardinalità/ruoli e la stima dei nomi lunghi; aggiungere regressioni sulle etichette.
- [x] Concludere la revisione indipendente: SHIP; nessuna sovrapposizione dei testi SVG nei due esempi dopo Riordina.
- [x] Accettare [PK] come alias di [ID] nei moduli e nel testo, con normalizzazione, guida e regressione sui marcatori misti.

## 5. ER esteso e ristrutturazione
- [x] Attributi composti annidati nei moduli, sintassi, validazione, disegno e trascinamento.
- [x] Gerarchie con padre/figlie, totale/parziale, esclusiva/sovrapposta e controllo dei cicli.
- [x] Scelta della strategia per gerarchia: accorpamento nel padre, nelle figlie o associazioni ISA.
- [x] Appiattire attributi composti senza perdere cardinalità, identificatori e nomi.
- [x] Estrarre attributi multivalore in entità/associazioni con identificatori esterni.
- [x] Ristrutturare gerarchie trasferendo proprietà/associazioni e conservando vincoli residui.
- [x] Conservare originale, risultato e rapporto delle trasformazioni nel progetto JSON.
- [x] Segnalare risultato da rigenerare dopo modifiche alla struttura originale.
- [x] Evitare quando possibile l’uscita delle associazioni sul lato degli attributi e spostare le curve fuori dal loro ingombro.
- [x] Lati sopra/sotto/destra/sinistra per attributi singoli, gruppi o tutti gli attributi, anche nella copia ristrutturata; persistenza, annulla e Riordina.
- [x] Semplificare i controlli segnalati come confusi: unica selezione con Seleziona tutti, unico menu del lato e anteprima senza modificare il progetto prima di Applica. Verificati selezione singola/gruppo/totale, promemoria persistente, scarto, salvataggio e mobile; tre suite native e controllo browser superati. Revisione indipendente conclusa con il rilievo sul promemoria risolto.
- [x] Esempio completo, regressioni e verifica desktop/mobile.
- [x] Revisione finale Impeccable: due rilievi risolti (ISA fuori dal composto e stile SVG); DESIGN.md e sidecar aggiornati e verificati.

## 6. Schema relazionale
- [x] Traduzione di entità, identificatori composti/esterni e associazioni 1:N/N:M/ricorsive.
- [x] Strategia per associazioni 1:1, FK, nullabilità e unicità.
- [x] Vista delle relazioni e vincoli non esprimibili con sole PK/FK.
- [x] Verifica delle traduzioni, export TXT, persistenza, stampa/PDF e documentazione d’uso.
- [x] Rappresentazione compatta come a pagina 7 del PDF TikTok: relazione(attributi), PK sottolineate, FK evidenziate, opzionali con asterisco; scelta alternativa al dettaglio delle tabelle, persistenza e stampa verificate.
- [x] Correzione della notazione richiesta dall’utente: FK con doppia sottolineatura; PK composta come unico gruppo con linea continua, anche nelle N:M ricorsive (`segue`), conservando FK distinte. Regressione del markup e verifica browser/stampa.

## Fuori da questo ciclo
Interpretazione libera tramite AI e collaborazione online. La disposizione automatica non ottimizza tutti gli incroci: si può correggere manualmente.

## 7. Schema fisico MySQL
- [x] Leggere le convenzioni SQL del PDF TikTok e proporre tipi modificabili.
- [x] Conservare PK, FK e UNIQUE, propagare i tipi delle FK e ordinare le creazioni per dipendenze.
- [x] Modificare tipi, opzioni, DEFAULT, azioni FK e CHECK per tabella, con validazione e bozza esplicita.
- [x] Salvare nel progetto JSON, recuperare con Annulla/Ripristina ed esportare SQL.
- [x] Regressioni eseguibili per proposta, vincoli, tipi incompatibili, frammenti SQL e dipendenze cicliche.
- [x] Verifica browser di modifiche, propagazione FK, Annulla/Ripristina, errori e persistenza dopo ricaricamento.
- [x] Eseguire cinque script di esempio su un MariaDB 10.4 temporaneo isolato: 30 tabelle create, comprese FK cicliche.
- [ ] Verifica browser finale di download SQL e vista mobile: connessione al browser interrotta. Prova diretta su MySQL 8 non disponibile nell’ambiente.

## Correzioni dopo la generazione SQL
- [x] Estrarre i multivalore con identificatore proprio id e valore separato, anche per composti e collezioni annidate.
- [x] Nomi plurali delle relazioni derivate dalle entità, con gestione dei conflitti e conservazione dei nomi delle colonne FK.
- [x] Celle vuote nei piccoli layout: regressione sullo schema farmacia con quattro entità, sei tratti rettilinei e rombi al punto medio.
- [x] Spunte facoltative per ENGINE e DEFAULT CHARSET; scelta Non specificare per azioni FK e nota esplicativa.
- [x] Tredici test automatici superati; import dei vecchi flag SQL mantiene il comportamento precedente.
- [ ] Verifica visiva nell’app: il collegamento al browser non è disponibile. Diagramma farmacia esportato in `.impeccable/review/riordina-farmacia.svg`.

## Identificatori e nomi nei progetti già salvati
- [x] Aggiornare al caricamento le vecchie estrazioni multivalore: id proprio e valore separato, mantenendo le posizioni dei nodi.
- [x] Pluralizzare la testa dei nomi composti: numeri di telefono, ditte_numeri_di_telefono.
- [x] FK con prefisso id e nome singolare del proprietario/ruolo: id_ditta, id_follower, id_seguito_da; distinguere le componenti delle chiavi composte.
- [x] Recuperare tipi, opzioni, nomi SQL personalizzati e CHECK dei progetti precedenti, aggiornando i riferimenti alle FK rinominate anche negli identificatori esterni.
- [x] Sedici test superati, compresa la regressione sul caricamento del vecchio progetto con telefono come identificatore esterno.

## 8. Dati sintetici e laboratorio delle query
- [x] Connessione esplicita al server locale per porta/database, versione visibile e credenziali solo nella sessione.
- [x] Creare le tabelle dallo schema fisico in un database vuoto, senza sostituire tabelle esistenti.
- [x] Ollama locale con Qwen3.5 2B Q4_K_M come proposta per Apple Silicon con 8 GB: contesto 4096, poche righe, una richiesta alla volta, rilascio della memoria.
- [x] Generazione JSON per tabella in ordine di dipendenze, riferimenti FK e campione delle chiavi uniche; id assegnati dall’app.
- [x] Validazione preventiva su MySQL con rollback, anteprima modificabile e INSERT parametrizzati con annullamento del gruppo in caso di errore.
- [x] Analisi delle SELECT MySQL, tabelle/alias/colonne, linee delle giunzioni e righe intermedie ottenute dallo stesso snapshot.
- [x] Limiti espliciti: SELECT senza sottoquery/CTE/UNION/USING/NATURAL, 200 righe di anteprima, tempo limitato e sola lettura.
- [x] Diciassette test Node e cinque controlli Python, incluso percorso sul MariaDB temporaneo e rollback per CHECK non valido.
- [x] Prova AI reale sullo schema farmacia: sei tabelle, tre righe per tabella, 18 inserimenti e query JOIN/WHERE validi in 41,3 s sul Mac M1 da 16 GB. Nessuna prova sul Mac da 8 GB.
- [x] Verifica API HTTP di connessione/schema/query/scollegamento e isolamento di origini/file; avvio aggiornato su porta 4173.
- [ ] Verifica visiva desktop/mobile: CUA non espone browser o app, con errore di avvio del collegamento nativo. Anteprima generata in `/private/tmp/trama-lab-query-preview.html`.

## Feedback della generazione
- [x] Individuare la richiesta attiva su MySQL/Ollama e la conclusione della generazione: il feedback era lontano dai controlli e il risultato appariva sotto senza scroll.
- [x] Avanzamento trasmesso dal server, tabella/fase visibili accanto al pulsante, errori locali e proposta portata in vista.
- [x] Rendere espliciti i due passaggi Genera proposta / Inserisci queste righe e la natura sintetica dei dati.
- [x] Regressioni su eventi ricevuti prima della conclusione, errori e risposta interrotta, anche con caratteri UTF-8 divisi fra pacchetti; diciotto test Node e cinque test Python unitari passati.
- [x] Verifica HTTP con Ollama reale e MySQL di MAMP sul prompt dell’utente: eventi immediati, 18 righe proposte in 44 secondi, conteggi delle righe invariati dopo la generazione.

# Piano di lavoro · editor ER

## Obiettivo
App didattica locale per descrivere e disegnare lo schema ER iniziale, derivarne una ristrutturazione controllata e generare lo schema relazionale. HTML, CSS, JavaScript e SVG, senza backend.

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
Schema fisico, SQL, interpretazione libera tramite AI e collaborazione online. La disposizione automatica non ottimizza tutti gli incroci: si può correggere manualmente.

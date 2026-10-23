# Piano di lavoro — Visualizzatore didattico C++

## Obiettivo

Consentire al docente di scrivere brevi programmi C++ e mostrarne agli studenti
l'esecuzione passo passo, osservando variabili, array, memoria e chiamate a funzione.
Il contesto è l'insegnamento dell'Informatica nel SIA.
Il docente deve poter scrivere o modificare codice liberamente durante la lezione
e avviarne la visualizzazione, entro i costrutti supportati. Gli esempi precaricati
sono facoltativi: il funzionamento non deve dipendere da programmi predefiniti.

## Regole di aggiornamento

- `[ ]` da fare; `[x]` completato.
- Il task corrente è indicato nello stato di avanzamento.
- Aggiornare questo file durante l'esecuzione, al completamento dei sotto-task.
- Registrare decisioni, limiti e verifiche effettivamente svolte.
- Prima completare la pianificazione, poi avviare la progettazione.

## Stato di avanzamento

- Fase corrente: prima versione locale completata; verifiche automatiche e prova nel browser concluse.
- La cartella iniziale era vuota: nessun codice preesistente da mantenere o integrare.
- Scelta: applicazione locale, server Python standard, interfaccia HTML/JS, Clang C++17 con strumentazione AST.
- Riferimento per stile, esempi e requisiti: [ANALISI_DIDATTICA.md](ANALISI_DIDATTICA.md).
- Perimetro e prove: [COSTRUTTI.md](COSTRUTTI.md); avvio e limiti nel [README.md](README.md).

## 1. Raccogliere i requisiti

- [x] Identificare destinatari e uso: docente e studenti SIA, dimostrazioni in classe.
- [x] Esplicitare la scrittura e modifica di programmi al momento come requisito centrale.
- [x] Includere variabili semplici, array e visualizzazione dei contenuti.
- [x] Includere chiamate a funzione/procedura, parametri e variabili locali.
- [x] Includere passaggio per valore e riferimenti nativi C++ (`T&`).
- [x] Distinguere i riferimenti C++ dai puntatori (`T*`): non sono intercambiabili.
- [x] Leggere la dispensa fornita dal docente e controllare visivamente pagine significative.
- [x] Registrare convenzioni del codice e progressione degli argomenti.
- [x] Selezionare esempi della dispensa da trasformare in verifiche del tool.
- [x] Valutare la necessità delle playlist: non necessarie per questa prima analisi.
- [x] Definire il perimetro iniziale dei tipi e dei costrutti C++ da supportare, distinguendolo dal supporto effettivo del tool.
- [x] Valutare esplicitamente il supporto a matrici, struct, stringhe, overloading e parametri predefiniti.
- [x] Verificare con un compilatore reale i casi didattici di base e documentare esiti e limiti.
- [x] Definire modalità d'uso e vincoli: locale o online, connessione e installazione.
- [x] Definire i comandi necessari per avanzare, tornare indietro e ricominciare.

## 2. Progettare la soluzione minima

- [x] Confrontare un motore di esecuzione C++ reale con una simulazione didattica.
- [x] Scegliere e documentare l'approccio e i relativi limiti di fedeltà.
- [x] Definire come collegare il passo di esecuzione alla riga di codice.
- [x] Definire come rappresentare variabili, array e pila delle chiamate.
- [x] Definire come mostrare copia dei parametri, alias dei riferimenti e puntatori.
- [x] Preservare lo stile della dispensa: prototipi, `using namespace std;`, `cin`/`cout`, array tradizionali e `int &nome`.
- [x] Distinguere una variabile locale non inizializzata da un valore zero e dall'inizializzazione parziale degli array.
- [x] Gestire input e output coerenti con il passo visualizzato, anche tornando indietro.
- [x] Distinguere indirizzi reali ed eventuali indirizzi simulati.
- [x] Definire come comunicare errori e costrutti non supportati.
- [x] Se si esegue codice nativo, definire isolamento e limiti di tempo e risorse.
- [x] Annotare la scelta finale in questo file prima di implementarla.

## 3. Preparare esempi e criteri di accettazione

- [x] Codice scritto al momento: un programma originale, entro il perimetro supportato, viene eseguito e visualizzato senza dipendere dagli esempi precaricati.
- [x] Modifica del codice: la precedente esecuzione viene invalidata; al nuovo avvio, stati, input e output corrispondono alla nuova versione del programma.
- [x] Variabile semplice: dichiarazione, inizializzazione e modifica visibili.
- [x] Array: elementi e indici visibili; una modifica aggiorna la cella corretta.
- [x] Passaggio per valore: la modifica del parametro non cambia l'originale.
- [x] Riferimento `int&`: la modifica del parametro cambia l'originale.
- [x] Puntatore `int*`: indirizzo copiato e modifica tramite dereferenziazione distinti.
- [x] Chiamate annidate: ogni chiamata mostra parametri e variabili del proprio ambito.
- [x] Ritorno da funzione: risultato disponibile e rimozione del relativo frame.
- [x] Array passato a funzione: evidenziare il comportamento dei parametri `T[]`/`T*`.
- [x] Riproduzione di un passo precedente: ripristino coerente di codice e memoria.
- [x] Errore o costrutto non supportato: messaggio esplicito senza stati fuorvianti.
- [x] `scambioErrato` e `scambioCorretto` (pagine stampate 15-16): copia e alias producono i risultati attesi.
- [x] `incrementa` e `moltiplica` (pagina 16): parametri misti, per riferimento e per valore.
- [x] `sommaArray` e `raddoppiaElementi` (pagine 28-29): lettura e modifica dello stesso array del chiamante.
- [x] `contatore` globale e locale (pagine 21-22): oggetti distinti e accesso con `::contatore`.
- [x] `int numeri[10] = {0};` e `int sequenza[5] = {1, 2};` (pagina 25): inizializzazione completa e parziale corrette.
- [x] Dichiarazione senza inizializzazione e successivo `cin`: stato iniziale distinto dal valore inserito.

## 4. Implementare

- [x] Preparare la struttura minima e le istruzioni di avvio.
- [x] Implementare il motore e la raccolta degli stati previsti nel perimetro.
- [x] Implementare inserimento del codice e segnalazione degli errori.
- [x] Implementare navigazione tra gli stati e indicazione della riga corrente.
- [x] Implementare visualizzazione di variabili, array e pila delle chiamate.
- [x] Implementare collegamenti visivi per riferimenti e puntatori.
- [x] Inserire gli esempi didattici definiti nella fase 3.
- [x] Verificare leggibilità in proiezione e accessibilità dei controlli.

## 5. Verificare e consegnare

- [x] Automatizzare controlli mirati per la logica non banale del motore.
- [x] Verificare i casi della fase 3, inclusi valore, riferimenti e puntatori.
- [x] Confrontare i risultati degli esempi con l'esecuzione C++ di riferimento.
- [x] Provare il percorso completo: scrittura, avvio, passi, ritorno e riavvio.
- [x] Documentare uso, costrutti supportati e limiti effettivi.
- [x] Registrare qui l'esito delle verifiche e gli eventuali problemi aperti.

## Registro delle decisioni

- 2026-10-22: i riferimenti richiesti sono quelli nativi C++ (`T&`).
- 2026-10-22: piano scritto prima della progettazione; task aggiornabili in questo file.
- 2026-10-22: dispensa analizzata come riferimento didattico, senza modificarla; playlist conservate come fonti facoltative.
- 2026-10-22: la presenza di un argomento nella dispensa non implica automaticamente supporto nella prima versione; il perimetro resta da definire esplicitamente.
- 2026-10-22: il docente potrà scrivere e modificare codice durante la lezione; gli esempi precaricati sono un supporto facoltativo.
- 2026-10-22: perimetro iniziale dettagliato in COSTRUTTI.md; matrici e struct sono estensioni successive, stringhe di base, overloading numerico e parametri predefiniti rientrano nel nucleo.
- 2026-10-22: C++17 è la base della verifica preliminare; compilare ed eseguire i casi non dimostra ancora la loro corretta visualizzazione.

## Verifiche svolte

- Ispezionata la cartella iniziale: nessun file di progetto presente.
- Estratto e letto il testo della dispensa; controllate visivamente pagine su funzioni, riferimenti, scope, array, matrici e struct.
- Annotate in ANALISI_DIDATTICA.md le cautele per trascrivere esempi dal PDF e verificarne la compilazione.
- Compilato verifiche/costrutti.cpp con Apple Clang 21 in modalità C++17, senza diagnostiche; superati 10 gruppi di controlli assert.
- Implementati motore Clang/AST, runtime C++, server locale, interfaccia e sei esempi didattici.
- Suite completa `python3 -m unittest test_engine test_server -v`: 22 test superati; sei esempi confrontati con C++ originale.
- Provati nel browser: codice originale scritto al momento, cambio input e nuova esecuzione, alias con stesso indirizzo, navigazione indietro con ripristino di memoria/console/input, testo grande e disposizione a 390 px senza overflow della pagina.
- Salvata anteprima.jpg; preparati README.md e avvia.command eseguibile per l'avvio su macOS.

## Consegna della prima versione

- 2026-10-22: completati i task del nucleo iniziale. Matrici, struct, file, heap e portabilità restano estensioni esplicite, non task incompleti di questa versione.
- Comandi verificati: suite unittest, controllo sintattico JavaScript e script di avvio.
- Il server di prova viene fermato a fine verifica; per utilizzare il tool avviare avvia.command o python3 server.py.

## Aggiornamento: editor vuoto e nuovo programma

- [x] Individuare il caricamento automatico del primo esempio e il comportamento della selezione vuota.
- [x] Avviare con editor e input vuoti quando non esiste un programma salvato.
- [x] Aggiungere Nuovo programma per svuotare editor/input e invalidare la traccia.
- [x] Mantenere il recupero del codice salvato e il caricamento degli esempi.
- [x] Verificare i percorsi nel browser e aggiornare le istruzioni.

Verifica mirata: `node --check app.js` superato. In Chrome, su un'origine locale
separata per preservare i dati della sessione abituale, controllati con assert:
primo avvio vuoto, caricamento esempio, selezione Nessun esempio, recupero di codice
e input dopo ricaricamento, esecuzione di un programma originale, Nuovo programma
con cancellazione della traccia e focus nell'editor, persistenza della pagina vuota.
Anteprima salvata in editor-vuoto.jpg. Il motore C++ non è stato modificato.

## Aggiornamento: console interattiva e memoria finale

- [x] Individuare la separazione attuale tra stdout, input e fotografia della memoria.
- [x] Mostrare nella console l'input digitato e INVIO, mantenendo separato stdout per le verifiche C++.
- [x] Conservare l'ordine tra prompt, input e output, anche con getline, input sulla stessa riga e navigazione indietro.
- [x] Aggiungere la scelta Svuota memoria: alla fine oppure all'avvio della prossima esecuzione.
- [x] Mostrare lo stato finale come fotografia, senza ripristinare le variabili di funzioni o blocchi già conclusi.
- [x] Mantenere la fotografia durante la modifica del codice e rimuoverla all'avvio di una nuova esecuzione.
- [x] Verificare motore e interfaccia, salvare la preferenza e aggiornare le istruzioni.

Verifica: riprodotto il difetto iniziale con un test sull'eco mancante. Dopo la
correzione, `python3 -m unittest test_engine test_server -v` supera 25 test, inclusi
tre nuovi casi di regressione. In Chrome, verificati con assert console completa,
passi prima/dopo cin, fotografie finali senza locali di funzioni terminate, entrambe
le modalità di pulizia, preferenza ricordata al ricaricamento, conservazione durante
la modifica e rimozione all'avvio della nuova esecuzione. Il motore continua a
registrare le durate C++ reali: è la visualizzazione che conserva la fotografia.

Verificato anche input senza newline finale: la console mostra il testo digitato
esatto e aggiunge INVIO senza cambiare il valore letto. `node --check app.js`
superato; anteprima finale salvata in console-memoria-finale.jpg.

## Aggiornamento: ruoli didattici di variabili e parametri

- [x] Confermare il perimetro: variabili del programma e parametri delle funzioni.
- [x] Esaminare strumentazione delle dichiarazioni, fotografie e visualizzazione.
- [x] Aggiungere un'identità della dichiarazione alla traccia, distinta per omonimi e condivisa nelle chiamate ricorsive.
- [x] Consentire al docente di assegnare Input, Output, Input/Output o Lavoro; lasciare le dichiarazioni non classificate senza supposizioni automatiche.
- [x] Mostrare etichette e colori distinti, legenda e riconoscimento dei parametri.
- [x] Ricordare le assegnazioni per il codice corrente, tra passi e nuove esecuzioni; azzerarle eseguendo codice diverso.
- [x] Verificare riferimenti, array, ricorsione, omonimi, persistenza e fotografia finale.
- [x] Aggiornare guida e documentazione con uso e limiti.

Interventi previsti: engine.py e runtime.hpp per l'identità delle dichiarazioni;
app.js, index.html e style.css per assegnazioni e visualizzazione; test_engine.py
e verifiche nel browser per la regressione. Nessuna nuova dipendenza o modifica
all'esecuzione C++. I ruoli appartengono alle dichiarazioni: un parametro alias
può avere un ruolo diverso dalla variabile del chiamante.

### Correzione aggiuntiva: eco dei singoli cin

- [x] Riprodurre il caso base/altezza con input `4 6`.
- [x] Associare l'eco ai dati consumati da ciascuna istruzione di lettura, mostrando INVIO anche quando i valori iniziali sono sulla stessa riga.
- [x] Preservare letture concatenate, getline, input non valido e stdout originale.
- [x] Aggiornare test e descrizione del campo input.

Verifica del 2026-10-23: riprodotto il difetto base/altezza con due assert falliti
prima della correzione. Dopo la correzione la suite completa supera 27 test
(`python3 -m unittest test_engine test_server -v`, 56,6 secondi), inclusi letture
separate con spazi o newline, letture concatenate, getline, input non valido e
metadati delle dichiarazioni. Due timeout intermittenti nelle prime esecuzioni
non si sono ripresentati nella ripetizione mirata e nella suite completa; i limiti
del motore non sono stati cambiati. `node --check app.js` superato.

In Chrome, su origine separata per preservare il lavoro del docente, verificati
con assert: console base/altezza corretta con input `4 6` e `5 8`, quattro ruoli e
legenda, omonimi distinti nello stesso frame, array e parametro puntatore,
indipendenza tra riferimento e originale, propagazione immediata nelle tre
chiamate ricorsive, persistenza dopo ricaricamento e nuova esecuzione, conservazione
cambiando solo input, azzeramento eseguendo codice diverso, fotografia finale e
cambio della politica di pulizia. Anteprime: ruoli-variabili.jpg e
console-input-corretto.jpg. Nessuna nuova dipendenza.

## Correzione: server rimasto attivo dopo l'aggiornamento

- [x] Identificare l'incompatibilità: il processo Python conserva il vecchio motore mentre il compilatore legge il nuovo runtime.hpp.
- [x] Individuare e riavviare soltanto il server del visualizzatore.
- [x] Verificare il caso base/altezza attraverso il server aggiornato.
- [x] Documentare il riavvio necessario dopo modifiche al motore o al runtime.

La correzione prevista è operativa: nessun overload di compatibilità che nasconda
il disallineamento e nessuna modifica al sorgente del docente o ai dati del browser.

Confermato tramite porta, cartella e data di avvio: il processo precedente sulla
8765 era in esecuzione dal 22 ottobre alle 23:35. Fermato con SIGINT e riavviato
il server aggiornato sulla stessa porta. Verifica HTTP reale con assert: programma
con b, h, a compilato, nessun errore, console con risposte separate 4 e 6 e area 24,
tre identità di dichiarazione distinte. Il server resta attivo per il docente.
README aggiornato; non ripetuta la suite completa perché il codice del motore
non è stato modificato. Necessaria la ricarica della pagina per il token del
server riavviato.

## Aggiornamento: classificazione automatica e grafica originale

- [x] Recepire la sostituzione dei ruoli manuali con analisi automatica del codice.
- [x] Definire e verificare le regole per console, ritorni e parametri per valore/riferimento/puntatore/array.
- [x] Calcolare i ruoli dall'AST, mantenendoli stabili nei passi e distinti per dichiarazione.
- [x] Rimuovere selettori e persistenza delle assegnazioni manuali.
- [x] Ripristinare le righe originali delle variabili aggiungendo soltanto il colore; aggiornare legenda e guida.
- [x] Verificare base/altezza/area, variabili di lavoro, parametri di output, input/output, alias, array e rami condizionali.
- [x] Aggiornare documentazione, riavviare il server abituale e verificare l'interfaccia.

Ambito: analisi statica del C++ già supportato, metadati delle fotografie e pannello
memoria. Nessuna modifica alla semantica C++, ai dati del docente o alla console.

Verifica del 2026-10-23: suite completa di 36 test superata in 58,6 secondi
(`python3 -m unittest test_engine test_server test_roles -v`); controllo sintattico
JavaScript superato. Nove test dedicati alle regole automatiche coprono console,
lavoro, ritorni, parametri misti, scritture certe, rami, cortocircuito, array per
elemento, puntatori, alias, globali, stringhe, inoltro, prototipi e ricorsione.
Un assert del motore verifica il ruolo nel JSON e la stabilità tra fotografie.

Riavviato il server abituale sulla porta 8765. In Chrome, usando localhost per
non sostituire il codice salvato su 127.0.0.1, verificati con assert: parametri
blu/blu/verde/viola e locale ocra, header originale con soli nome e tipo, nessun
selettore nel pannello memoria, base/altezza blu e area verde nella fotografia
finale, console corretta con input `4 6`, entrambe le politiche di pulizia e
ricalcolo automatico cambiando programma (`cin >> n; cout << n` diventa viola).
Anteprima verificata e salvata in ruoli-automatici.jpg. Il server resta attivo.
README, PROGETTO e COSTRUTTI descrivono le regole e le approssimazioni conservative;
le precedenti assegnazioni manuali non vengono più lette né salvate.

## Correzione: Failed to fetch

- [x] Verificare il servizio sulla porta 8765: nessun processo in ascolto.
- [x] Riavviare il server indipendentemente dalla sessione di verifica dell'agente.
- [x] Mostrare un messaggio comprensibile quando la connessione al server fallisce.
- [x] Provare dal browser un programma con funzione e verificare console e memoria.
- [x] Registrare causa, verifica e modalità di avvio.

Il sintomo osservato è una connessione HTTP non disponibile, prima della
compilazione C++; nessuna modifica al codice del docente o alla gestione funzioni
è giustificata da questa evidenza.

Verifica del 2026-10-23: il precedente processo gestito dalla sessione di verifica
non esisteva più. Avviato il server 8765 con stdin scollegato, log in
/private/tmp/cppviz-server.log e sessione di processo indipendente. Confermati PID
25503, padre 1 e gruppo di processo proprio; porta 8765 nuovamente in ascolto.

Nel browser originale il sorgente del docente è stato conservato e la pagina
ricaricata per aggiornare il token. Individuato anche un errore distinto nel suo
calcolaArea: manca return a, confermato dalla diagnostica del compilatore. Sorgente
originale non modificato. Su origine separata, lo stesso calcolo con return a
restituisce 24 da input 4 6, con tre variabili nella fotografia finale. Anteprima:
funzione-connessione-ripristinata.jpg.

Spento soltanto il server di prova: assert nel browser sul nuovo messaggio italiano,
conservazione di codice/input e riabilitazione del pulsante. Il server abituale resta
in ascolto. node --check app.js superato; suite C++ non ripetuta perché il motore
non è stato modificato. README aggiornato con il recupero dalla mancata connessione.

## Aggiornamento: copie dei parametri e ultima chiamata conclusa

- [x] Esaminare chiamate, metadati delle variabili e fotografie prima del ritorno.
- [x] Registrare il punto di chiamata e l'origine dei parametri senza rivalutare gli argomenti.
- [x] Distinguere copia del valore, copia dell'indirizzo e alias per riferimento, anche nelle chiamate annidate e ricorsive.
- [x] Mostrare il collegamento selezionando una variabile, con valore iniziale della copia e destinazione corrente dei puntatori.
- [x] Aggiungere una sezione richiudibile per l'ultima funzione/procedura conclusa, grigia e chiaramente separata dalla memoria attiva.
- [x] Conservare navigazione temporale, scelta di pulizia e fotografia finale; escludere globali/statiche dall'archivio dei locali terminati.
- [x] Verificare valore, riferimenti, puntatori, array, espressioni, ricorsione, chiamate ripetute e layout nel browser.
- [x] Aggiornare documentazione, riavviare il server stabile e consegnare un'anteprima.

Ambito: engine.py/runtime.hpp per identificare la chiamata; arricchimento della
traccia con origini immutabili, interfaccia di selezione e indice dell'archivio
basato sulle fotografie già registrate. Argomenti valutati una sola volta, nessuna nuova
dipendenza e nessuna modifica al codice del docente. Soltanto l'ultima chiamata
conclusa visibile al passo corrente; main resta nella fotografia finale esistente.

Verifica del 2026-10-23: 40 test superati in 62,9 secondi; node --check app.js
superato. Quattro nuovi test del motore controllano origini immutabili, distinzione
tra celle per copia/alias, puntatore modificato a nullptr senza perdere l'indirizzo
iniziale, array/indici letterali/default, chiamate annidate sulla stessa riga,
ricorsione, argomenti con incremento valutati una sola volta, archivio finale,
chiamate ripetute e statiche ancora attive.

In Chrome, su origine di prova separata, assert su: selezione iniziale del primo
parametro, copia iniziale 5 ancora indicata dopo modifica del parametro a 15,
destinazioni cliccabili, copia dell'indirizzo distinta dal puntamento corrente,
nullptr dopo modifica senza cambiare x=6, archivio inizialmente chiuso e senza
collegamenti attivi, valori grigi corretti, navigazione prima della conclusione
senza mostrare chiamate future, sostituzione dell'ultima chiamata, entrambe le
politiche di pulizia, conservazione durante la modifica, selezione dal chiamante,
distinzione alias/copia e uso della tastiera con focus mantenuto. Pannelli con
altezza limitata e scorrimento accessibile per non allontanare la memoria attiva.

Documentati uso e limite dei collegamenti per espressioni non riconducibili a
una singola cella senza rivalutazione. Anteprima puntatori-e-chiamata-conclusa.jpg.
Riavviato il server abituale in sessione indipendente: PID 26704 sulla porta 8765.
Nessun sorgente o dato salvato del docente è stato sostituito.

## Aggiornamento: fotografie di tutte le subroutine concluse

- [x] Verificare che la traccia contenga già una fotografia per ciascuna conclusione.
- [x] Raccogliere tutte le chiamate concluse fino al passo corrente, senza duplicati.
- [x] Sostituire la fotografia singola con un archivio richiudibile e una voce per chiamata, ordinata per conclusione.
- [x] Distinguere chiamate ripetute/ricorsive con numero di chiamata e passo di conclusione.
- [x] Conservare apertura delle voci, navigazione indietro e preferenze di pulizia.
- [x] Verificare funzione seguita da procedura, ripetizioni, ricorsione e fotografie finali nel browser.
- [x] Aggiornare guida e documentazione; conservare il codice del docente.

Intervento nell'interfaccia: i metadati lastCall dei passi registrano già ogni
conclusione. Nessuna modifica a motore, runtime o formato della traccia; nessun
riavvio necessario del server. Main resta nella fotografia finale esistente.

Verifica del 2026-10-23: node --check app.js superato. In Chrome, su origine
separata, verificati con assert sei record in ordine di conclusione: doppio #2,
incrementa #3 e #4, conto #7/#6/#5. Parametri/locali distinti e corretti: risultato
6, valori precedenti 6 e 7 per le due procedure, parametri ricorsivi 0/1/2. Nessun
duplicato nei passi intermedi o cambiando Indirizzi; aperture conservate anche
con tastiera. Prima della procedura è visibile soltanto la funzione già conclusa;
al primo passo non compare l'archivio. Verificate entrambe le politiche di pulizia,
conservazione delle sei fotografie durante la modifica e cancellazione all'avvio
del programma successivo. Anteprima tutte-le-chiamate-concluse.jpg.

README, guida e PROGETTO aggiornati. La suite C++ non è stata ripetuta: motore,
runtime e metadati non sono cambiati; verificata la nuova logica nell'interfaccia.
Il server abituale PID 26704 è rimasto attivo, senza sostituire il codice del docente.

## Aggiornamento: condizioni attivabili con flag

- [x] Esaminare i controlli già strumentati e la visualizzazione del passo corrente.
- [x] Registrare espressione, valori realmente letti ed esito, senza rivalutare la condizione.
- [x] Distinguere for, while, do…while e if; riconoscere break/continue del ciclo senza confonderli con break di switch.
- [x] Aggiungere Mostra condizioni accanto a Indirizzi, inizialmente disattivato e ricordato nel browser.
- [x] Mostrare il controllo e il percorso successivo con testo e colore; evidenziare le righe del codice.
- [x] Verificare prima condizione falsa, ultima iterazione, effetti collaterali, cortocircuito, cicli annidati e navigazione.
- [x] Aggiornare documentazione, verificare nel browser e riavviare il server stabile.

Ambito: metadati delle condizioni nell'AST e nel runtime, pannello facoltativo e
preferenza locale. Le registrazioni restano disponibili anche con flag spento per
attivarlo senza rieseguire il programma. Gli argomenti e le condizioni vengono
valutati una sola volta dal C++; nessuna deduzione dei valori dalla memoria dopo
la valutazione, perché potrebbe essere già cambiata.

Verifica del 2026-10-23: suite completa di 45 test superata in 70,7 secondi;
node --check app.js superato. Cinque nuovi test coprono controlli 0/1/2/3 del for,
esito finale falso, incremento postfisso/prefisso valutato una volta, cortocircuito
senza lettura non inizializzata, do…while, break/continue con switch e cicli annidati,
funzione invocata nella condizione, array con indice incrementato, caratteri e
offset UTF-8. La regressione con funzione annidata ha rilevato e corretto un nome
locale che oscurava il buffer del sorgente durante l'arricchimento della traccia.

In Chrome, su origine separata, assert su: flag spento inizialmente, attivazione
senza riesecuzione né cambio passo, sostituzione 0 < 3 e 3 < 3, esiti verde/rosso,
controllo #4, riga del corpo e riga dopo il ciclo evidenziate al passo successivo,
scomparsa dei marcatori spegnendo il flag, ripristino tornando indietro, preferenza
ricordata al ricaricamento, pannello senza dati vecchi prima/dopo l'esecuzione,
continue e break in ambra senza esito falso, condizione subito falsa con controllo
#1 e output invariato. Anteprima condizioni-facoltative.jpg.

Guida, README, PROGETTO e COSTRUTTI aggiornati. Il pannello sostituisce solo i valori
effettivamente raccolti: funzioni e parti non lette restano espressioni, senza
valutazioni aggiuntive. Riavviato il server abituale in sessione indipendente.

## Implementazione: flowchart nel visualizzatore locale

- [x] Esaminare editor, avvio, traccia, condizioni, API e protezioni esistenti.
- [x] Definire documento a blocchi strutturati, validazione e generazione C++ con mappa riga→blocco.
  - [x] Dichiarazioni scalari/array/puntatori/riferimenti, input, output, elaborazione.
  - [x] Decisioni Vero/Falso, while, for, do…while, break/continue e restituzione.
  - [x] Funzioni/procedure con parametri per valore, riferimento, puntatore e array.
- [x] Aggiungere editor grafico con forme standard, frecce automatiche, selezione e campi modificabili.
  - [x] Inserimento nei rami/corpi, riordino, cancellazione e annullamento.
  - [x] Proprietà delle subroutine e selezione del diagramma da osservare.
  - [x] Apri/Salva documento JSON, autosalvataggio separato e anteprima C++.
- [x] Integrare modalità C++/Flowchart con il medesimo avvio e input.
  - [x] Proteggere il sorgente C++ del docente passando da una modalità all'altra.
  - [x] Evidenziare blocco corrente e rami Vero/Falso seguendo la traccia nativa.
  - [x] Mantenere memoria, console, fotografie e collegamenti dei parametri.
- [x] Verificare generatore/layout, import non valido nei test, programmi generati con Clang e percorso nel browser.
- [x] Aggiornare documentazione e riavviare il server stabile.
- [ ] Riapertura del file e anteprima finale nel browser: automazione interrotta dall'estensione.

Accettazione: costruire senza scrivere il sorgente C++ un programma con input,
calcolo e output; aggiungere una decisione/ciclo e una chiamata con parametri;
eseguirlo a passi, vedere il blocco attivo e i valori, salvarlo e riaprirlo.
Il C++ generato resta consultabile e scaricabile. Nessun servizio o pacchetto a
pagamento, nessuna dipendenza esterna, nessun motore online in questa fase.

Scelta grafica: diagramma centrale con ovali, parallelogrammi, rettangoli e rombi;
campi del blocco sotto il diagramma e memoria nella colonna esistente. Palette
coerente: carta #f3f6fa, testo #17263c, blu #245bb2, verde #146b58 e rosso #a32f3e.
Font di sistema per i comandi e monospace per le espressioni. Le frecce hanno una
funzione didattica; niente effetti decorativi. Diagrammi strutturati con collegamenti
automatici, scorrimento e comandi accessibili anche da tastiera. La conversione da
C++ arbitrario a diagramma modificabile e la sincronizzazione bidirezionale restano
fuori da questa prima integrazione.

### Revisione richiesta: sintassi simile ad AlgoBuild

- [x] Consultare il manuale ufficiale: istruzioni semplici, cicli, tipi e operatori.
- [x] Ricevere conferma su input/output/assegnamenti su più righe e OUT/OUTLN.
- [x] Individuare la soluzione richiesta: supportare sia dichiarazioni esplicite sia creazione implicita.
- [x] Confermare tipo dell'input implicito, stabilità del tipo e ambito delle variabili.
- [x] Concordare sintassi e comportamento di cicli, array e parametri.
- [x] Adattare editor, generatore, esempi e verifiche alle scelte confermate.

Il docente ha chiesto conferma sulle varie scelte prima di procedere. Sospesa la
modifica della sintassi e la consegna della versione iniziale. L'editor attuale usa
ancora espressioni C++ e dichiarazioni esplicite. Test preliminari: generatore e
layout Node superati; sei test Python (flowchart e server) superati. Nel browser
verificati costruzione manuale, procedura con puntatore, modifica 7→8, collegamento
all'indirizzo del chiamante e conservazione del sorgente/input C++ fra modalità.
Prova di import nel browser impedita dal permesso file dell'estensione Chrome;
formato e roundtrip JSON verificati nei test del generatore.

Suite completa: 48 test Python superati in 89,7 secondi; controlli sintattici Node
su app.js e flowchart-editor.js superati. Riavviato soltanto il server abituale
(PID 30018) per caricare l'elenco aggiornato dei file statici: il precedente avrebbe
rifiutato i nuovi script alla ricarica, bloccando anche la modalità C++. La sintassi
AlgoBuild resta da concordare; nessuna modifica dipendente dalle risposte applicata.

Fonti: https://algobuild.com/en/manual-en/simple_instructions.html,
https://algobuild.com/en/manual-en/compound_instructions.html,
https://algobuild.com/en/manual-en/data_types.html.

Richiesta successiva del docente: consentire entrambi i modi di creare le variabili.
Proposta da confermare nei dettagli: una dichiarazione esplicita determina il tipo;
in assenza di dichiarazione, il primo assegnamento lo ricava dall'espressione e
l'input usa un tipo predefinito o specificato sulla singola riga. Nessun cambiamento
automatico del tipo dopo la creazione. Da concordare anche la visibilità dopo rami
e cicli, perché influenza la durata mostrata nella memoria.

### Esecuzione delle proposte confermate

Il docente ha confermato la tabella completa: INPUT su più righe (double se nuovo
e privo di tipo, oppure int/string/etc esplicito), assegnamenti su più righe,
OUT/OUTLN, operatori C++, for in tre campi, variabili locali all'intera subroutine,
array tipizzati e dimensionati, parametri con semantica C++.

- [x] Generatore: righe multiple, tipo dedotto dal primo assegnamento, input tipizzato,
  tipo stabile, risultato di funzione implicito e dichiarazioni esplicite.
- [x] Durata: estendere all'intera subroutine le variabili create dentro rami/cicli,
  mostrandole soltanto quando il relativo percorso le crea; controllare letture
  prima dell'inizializzazione e rami non percorsi.
- [x] Editor: campi multilinea, OUT/OUTLN, suggerimenti ed esempio senza dichiarazioni
  obbligatorie; mantenere leggibili i blocchi e riconoscere i vecchi diagrammi JSON.
- [x] Verifiche: generazione, tipi numerici/stringa, rami e cicli, funzioni/puntatori,
  console, limiti e regressioni C++; prova nel browser su origine separata.
- [x] Guida e documentazione e riavvio del server locale.
- [ ] Acquisire l'anteprima finale: controllo del browser non più disponibile.

Punti raggiunti dal cambiamento: core/editor Flowchart, chiamante app.js, metadati
opzionali dell'API locale, strumentazione e runtime solo per dichiarazioni differite,
test e documentazione. Il sorgente C++ del docente e la sua modalità restano distinti.
Si riusano compilatore, analisi dei ruoli e tracciamento nativi, evitando un secondo
interprete delle espressioni. Il compilatore determina i tipi senza eseguire due volte
le espressioni. Le dichiarazioni tecniche anticipate per dare durata di subroutine
non devono generare passi o variabili visibili prima della loro creazione logica.

Verifica del 2026-10-23: suite di 53 test superata in 116,3 secondi, poi verifiche
aggiuntive di chiamate non rivalutate, stringhe non create, alias di stringhe e
input in un ramo: 57 casi distinti complessivamente coperti. Dopo l'aggiunta del
controllo delle stringhe, 9/10 casi flowchart passati al primo giro; un caso già
passato si è fermato per timeout ed è passato ripetendolo insieme al nuovo input
stringa/intero (2 test in 4 secondi), senza alzare i limiti del motore. Nessuna
modifica alla semantica di stringhe/riferimenti nel C++ ordinario. Node verifica
generazione, JSON vecchio/nuovo, formato non valido, tipi stabili, array e layout;
controlli sintattici JS e diff --check superati.

In Chrome su origine separata: creato senza sorgente C++ un programma con INPUT
multilinea (base double, altezza int), due assegnamenti (area double, contatore int),
OUT senza a capo e OUTLN con a capo, for/if annidati e passaggio creato solo nel
ramo Vero. Verificati esiti/percorsi Vero/Falso e flag senza riesecuzione, variabile
conservata dopo il ciclo, contatore finale 2, output finale «Dopo il ciclo: 25 / 0 / 2»,
autosave al ricaricamento e codice/input C++ intatti passando fra modalità.
Riordino, eliminazione e Annulla ripristinano il sorgente generato. Salva diagramma
ha prodotto lezione.flow.json nel browser (formato 2 e input multilinea verificati
sul file scaricato). L'evento di download dell'automazione non ha restituito il
percorso; il download effettivo è riuscito. Apri diagramma non verificabile nella
UI: l'estensione richiede accesso ai file locali; il controllo si è poi interrotto.
Non sono stati cambiati i permessi di Chrome e non è disponibile una nuova immagine
finale. Le prove precedenti hanno controllato selezione, forme e colori a schermo.

Limite esplicito e documentato: array, costanti e riferimenti si dichiarano nel
corpo principale della subroutine, prima di rami/cicli. Gli scalari e i puntatori
possono nascere nei rami/cicli e durano fino al ritorno. La sintassi è simile ad
AlgoBuild ma il formato JSON è proprio del visualizzatore. Aggiornati README,
guida, COSTRUTTI e PROGETTO. Server stabile riavviato, PID 33123 sulla porta 8765.
Il checkpoint GitHub 2116c62 precede questa revisione; questa sezione ne registra le verifiche.

## Inserimento dalle frecce e forme dei blocchi

- [x] Associare alle frecce un punto di inserimento nella sequenza, nel ramo o nel corpo del ciclo corretti.
  - [x] Inizio/Fine, collegamenti fra blocchi, rami vuoti/popolati e ritorno del ciclo.
  - [x] Riutilizzare la stessa operazione di inserimento per palette e frecce; mantenere Annulla e autosalvataggio.
- [x] Aprire sulla freccia un menu con nome e miniatura SVG di ogni blocco.
  - [x] Mostrare le miniature anche nel dropdown Nuovo blocco della palette.
  - [x] Rendere frecce e menu utilizzabili da tastiera, chiudibili con Escape e inattivi durante la traccia.
- [x] Disegnare il for come esagono allungato, con inizializzazione, condizione e incremento su righe distinte.
  - [x] Adattare misure, frecce, scorrimento e colori delle condizioni.
- [x] Scrivere INIZIO nome() e FINE nome() negli ovali di ciascuna subroutine.
- [x] Verificare posizioni di inserimento e layout nei test; provare menu ed esecuzione nel browser.
- [x] Aggiornare guida/documentazione e consegnare l'anteprima se il controllo Chrome è disponibile.

Ambito: layout/core Flowchart, editor SVG, menu dei blocchi, stile, test e guida.
Nessuna modifica a compilazione, runtime C++, API o documenti salvati. I collegamenti
di salto return/break/continue non rappresentano una nuova istruzione da eseguire
fra salto e destinazione; l'inserimento avviene sulle frecce delle sequenze strutturate.
Non sono richieste dipendenze esterne. Il generatore C++ e la semantica restano quelli
già verificati; il nuovo for cambia rappresentazione, non esecuzione.

Richieste aggiuntive durante la verifica:
- [x] Rinominare Decisione in IF e usare FOR, WHILE, DO...WHILE nei menu e nelle proprietà.
- [x] Rendere esplicita l'uscita verticale dal vertice basso del WHILE anche a corpo vuoto.
- [x] Verificare l'ingresso verticale nel vertice alto del DO...WHILE, vuoto e popolato.
- [x] Ridurre il cerchio visibile del + mantenendo un'area di clic più ampia e le punte delle frecce leggibili.

Verifica del 2026-10-23: Node verifica inserimento da inizio/fine, fra blocchi,
rami vuoti/popolati, in testa e in coda al corpo, uscita Falso del ciclo, sottoprogrammi,
posizioni non valide e rollback al limite di 200 blocchi; controllo di punti di
attacco, esagono a misure dinamiche e presenza dei tre campi anche con testi lunghi.
Verificati uscita inferiore WHILE e ingresso superiore DO...WHILE con corpi vuoti
e popolati. Il C++ generato non cambia passando dal layout. Node --check e
git diff --check superati. Motore/API/runtime non modificati in questo intervento.

Chrome su origine separata: costruiti programmi cliccando solo le frecce; provati
menu con 12 icone, scelta dalla palette, tastiera (Invio, frecce, End, Escape),
Annulla e autosave al ricaricamento. Eseguiti FOR con somma finale 3, rami Vero/Falso
e output «Ramo vero / 0 / 1 / 2 / 3», poi WHILE e DO...WHILE nella procedura cicli()
con fotografia finale n=1. Il diagramma segue chiamata e ritorno; le frecce di
inserimento scompaiono durante la traccia. Verificati IF/FOR/WHILE/DO...WHILE e cerchi
visibili di raggio 7 con bersaglio trasparente di raggio 12. Esagono verde e testi
leggibili controllati a schermo. Anteprime: flowchart-frecce-menu.png,
flowchart-for-esagono.png e flowchart-while-do.png. Nei log Chrome sono comparsi
messaggi di chiusura del canale asincrono di provenienza non verificata, che non
hanno impedito le prove sopra; un controllo conclusivo su Home si è poi fermato
per timeout del controllo browser. La suite C++ completa non è stata ripetuta:
modifiche a editor/layout e verifica di esecuzione direttamente nel browser.

Aggiornati README, guida e PROGETTO. Basta ricaricare il visualizzatore; il server
abituale resta il PID 33123 sulla porta 8765. Nessun riavvio o pubblicazione GitHub
eseguito per questo intervento.

## Frecce esplicite e FOR su una riga con tooltip

- [x] Rendere visibili le punte verticali: WHILE dal vertice basso, DO...WHILE verso il vertice alto.
  - [x] Usare punte SVG esplicite per questi collegamenti e lasciare spazio fra punta e +.
  - [x] Verificare corpo vuoto/popolato e fase di esecuzione.
- [x] Mostrare nel FOR «inizializzazione; condizione; incremento» su un'unica riga.
  - [x] Rimuovere le tre etichette dal testo e adattare la larghezza dell'esagono.
  - [x] Aggiungere tre porzioni con tooltip distinti, visibili su mouse/focus.
- [x] Verificare layout, punto di attacco delle frecce e metadati dei tooltip nei test.
- [x] Provare il risultato nel browser, acquisire anteprime e aggiornare guida/README.

Evidenza: il layout precedente collega i vertici ma mostra soltanto la punta a fine
tratto con un marker SVG. Il WHILE non ha una punta immediatamente sotto il rombo;
i comandi di inserimento condividono lo stesso breve tratto. Si rendono esplicite
le punte richieste, senza cambiare semantica né posizioni di inserimento. Intervento
limitato a layout, renderer, stile, test e documentazione; nessun cambiamento al
generatore C++, all'API o ai documenti del docente.

### Richieste durante la correzione

- [x] Aggiungere velocità di riproduzione regolabile, ricordata e modificabile durante l'animazione.
- [x] Evidenziare le frecce realmente attraversate tra blocchi, anche con Mostra condizioni spento.
  - [x] Distinguere percorsi IF/WHILE/FOR/DO...WHILE, raccordi, salti e chiamate.
- [x] Esportare in PNG l'intero diagramma della subroutine scelta, con testo e colori.
  - [x] Escludere i controlli di modifica dal PNG, validare dimensioni e gestire gli errori.
- [x] Chiarire la conversione: Flowchart→C++ già presente; richiesta al docente la scelta sull'importazione C++→Flowchart.

Nuovo ambito: controlli di riproduzione in app/index, renderer/core per i percorsi,
esportazione locale SVG→canvas→PNG e CSP immagini blob. Nessun servizio remoto.
La conversione C++→Flowchart è stata confermata dal docente ed è inclusa qui sotto.

Confermata dal docente anche la conversione C++→Flowchart:
- [x] Importare tramite AST di Clang funzioni, parametri, dichiarazioni, console,
  assegnamenti, IF, FOR, WHILE, DO...WHILE, chiamate, return/break/continue.
- [x] Conservare ambiti C++ nei diagrammi importati (dichiarazioni nel blocco e
  contatore locale al FOR), distinguendoli dai diagrammi scritti in stile AlgoBuild.
- [x] Aggiungere API locale autenticata e pulsante nell'editor C++; conservare il
  sorgente e rendere annullabile la sostituzione del diagramma precedente.
- [x] Rifiutare con riga e spiegazione i costrutti non rappresentabili, evitando
  conversioni parziali o cambi di significato; verificare equivalenza nei test.

L'importazione iniziale non include globali/statiche, switch, overload o parametri
con valore predefinito. Gli errori non sostituiscono né sorgente né diagramma.

Pubblicazione richiesta dal docente: al termine delle verifiche, commit e push sul ramo main.
Il risultato della pubblicazione verrà comunicato con il relativo hash Git.


Verifica conclusiva del 2026-10-23:
- Suite completa conclusiva: 67 test Python superati in 114,702 secondi
  (motore C++, ruoli, server, Flowchart e importazione); include const, nome endl,
  console, ambiti e cin concatenato. Anche il controllo mirato di 25 test è passato.
- Suite Node superata per generazione, validazione, inserimenti, layout, tooltip,
  punte esplicite e percorsi. Controlli sintattici JS e git diff --check superati.
- Chrome: FOR su una riga con tre tooltip su focus; WHILE/DO con punte esplicite;
  frecce attraversate anche a condizioni spente, rami vuoti, ritorni e ciclo vuoto.
  Velocità modificata durante la riproduzione e ricordata al ricaricamento.
- Esportato e ispezionato un PNG reale di 1080×2378 pixel: tutto il diagramma,
  frecce e testo leggibili, senza controlli di inserimento. Verificato anche il PNG
  della funzione in esecuzione. Anteprime: flowchart-for-tooltip.png,
  flowchart-esportato.png e flowchart-percorso.png.
- Chrome: importazione area() e main(), annullamento della sostituzione, conservazione
  del sorgente; rifiuto di globali con riga e diagramma precedente conservato.
  Esecuzione importata: console «4 6\nArea: 24\n»; b/h copiati nella funzione,
  risultato a assente durante il calcolo e creato al ritorno.
- Formato documenti versione 3: migrazione 1/2, scope C++ per gli importati,
  getline e cin concatenato conservati. Nessuna dipendenza o servizio aggiunto.
- Server abituale riavviato sulla porta 8765 (PID 36463). Verificata via API locale
  l'intera conversione/generazione/esecuzione e la CSP per l'esportazione PNG.

Le precedenti caselle sulla riapertura di file dal browser restano annotazioni
storiche di prove impedite dall'estensione; validazione, migrazione e round-trip JSON
sono coperti dai test. Le nuove anteprime sopra sostituiscono quelle provvisorie.

# Scelte di progetto

## Motore

Scelta: C++17 compilato da Clang, con strumentazione ricavata dal suo AST JSON.
Un interprete scritto appositamente richiederebbe di riprodurre conversioni,
overloading, durata delle variabili e riferimenti; il compilatore mantiene queste
regole. LLDB richiederebbe permessi di debug e non distingue da solo tutte le
inizializzazioni. La strumentazione registra dichiarazioni, letture, scritture,
accessi agli array, chiamate e ritorni.

Il sorgente viene collocato in un namespace riservato solo durante l'analisi e la
compilazione; gli include ammessi restano esterni. Le qualificazioni globali sono
adattate a questo namespace. L'editor conserva il codice originale e i suoi numeri
di riga. L'AST del namespace evita di caricare quello delle librerie standard.

Gli indirizzi mostrati sono quelli reali della singola esecuzione. Ogni frame ha
un'identità distinta; un riferimento è un alias verso l'indirizzo originale.
Le celle non inizializzate non vengono lette per generare la visualizzazione.

La navigazione usa fotografie registrate: tornare indietro non riesegue il programma.
Gli input si inseriscono prima dell'avvio in un campo dedicato. La modifica del
codice o dell'input invalida la traccia. Sono previsti inizio, precedente, successivo,
fine, cursore dei passi e riproduzione automatica interrompibile.

Il buffer conserva i dati originali e la posizione di lettura. Un wrapper della
singola espressione di input registra il testo consumato e aggiunge INVIO alla
console: due istruzioni cin separate producono due risposte anche da input `4 6`.
I wrapper annidati di una lettura concatenata producono una sola eco; getline
preserva gli spazi. La trascrizione include input e stdout; lo stdout originale
rimane separato per i confronti con C++ nativo. Ogni fotografia contiene entrambe
le rappresentazioni e la posizione di lettura.

Ogni variabile registra anche l'offset della propria dichiarazione e se è un
parametro. roles.py analizza l'AST e riassume gli effetti delle funzioni: input e
output della console, ritorni, letture del valore iniziale e scritture nella memoria
del chiamante. Le scritture certe sono intersecate tra rami e ritorni; i riepiloghi
delle chiamate vengono stabilizzati anche per la ricorsione. Array e alias sono
seguiti con approssimazioni conservative per indici calcolati, cicli e riassegnazioni
dei puntatori. Il motore aggiunge il ruolo a ogni variabile delle fotografie, senza
modificare il runtime C++. L'interfaccia mantiene i riquadri originali e applica
soltanto i colori, senza selettori o assegnazioni salvate nel browser.

La politica di pulizia della memoria è una preferenza dell'interfaccia: può
svuotare il pannello al passo finale oppure mostrarvi l'ultima fotografia con
`main` ancora presente, marcandola come esecuzione terminata. La seconda modalità
è iniziale. La fotografia conservata resta durante la modifica del codice e viene
scartata all'avvio della successiva esecuzione; le durate reali delle variabili nel
motore C++ restano invariate. La preferenza persiste, la fotografia no.

Le chiamate sono avvolte in cv::invoke con un identificatore AST e un contesto
temporaneo ripristinato tramite RAII. Il contesto registra il chiamante prima della
valutazione nativa degli argomenti e identifica la funzione entrante anche con
chiamate annidate negli argomenti, ricorsione e più chiamate sulla stessa riga.
Non si rilegge un argomento con effetti collaterali per costruire un collegamento.
Il motore associa a ciascun parametro l'espressione sorgente, l'eventuale cella
identificabile e il valore iniziale registrato nella fotografia d'ingresso.

Ogni passo indica inoltre l'ultima chiamata conclusa tramite frame e indice della
sua ultima fotografia, senza duplicarne le celle in tutte le fotografie. Main è
escluso perché dispone già della fotografia finale. L'interfaccia raccoglie i record
distinti fino al passo corrente e mostra tutte le chiamate concluse in ordine di
conclusione. Ogni voce è richiudibile e conserva il proprio stato di apertura;
statiche e globali restano distinte. L'archivio segue il passo corrente e la politica di pulizia. I collegamenti delle
copie sono tratteggiati e immutabili, quelli dei puntatori mostrano la destinazione
corrente; si aprono selezionando i nomi, con selezione iniziale del primo parametro.

## Esecuzione locale

I controlli usano un contesto temporaneo annidabile: cv::test_condition valuta una
lambda una sola volta e raccoglie i valori restituiti dalle letture strumentate e
dagli incrementi. Gli offset AST permettono di sostituire i valori nell'espressione
senza rileggere le variabili dopo eventuali effetti collaterali. Le parti non
valutate restano codice. Un contesto distinto identifica break/continue del ciclo;
lo stack lessicale distingue break di switch e continue del ciclo esterno.
Il flag dell'interfaccia controlla soltanto la visualizzazione, non la semantica
o il numero di valutazioni. Esiti e percorsi sono ricostruiti dai passi registrati.

Server Python con libreria standard, in ascolto solo su `127.0.0.1`. Nessuna
dipendenza Python o JavaScript aggiuntiva, nessun servizio cloud. Il programma
nativo è eseguito su macOS tramite `sandbox-exec`: letture limitate alle risorse di
sistema necessarie e alla cartella temporanea, scritture nella stessa cartella,
nessuna rete e nessun processo figlio. Se l'isolamento non è disponibile,
l'esecuzione viene rifiutata. Sorgente e input hanno dimensione massima; compilazione,
durata dell'esecuzione, file e numero di stati hanno limiti. Gli header e le
operazioni del sorgente sono limitati al perimetro didattico.

Interfaccia e API sono servite dalla stessa origine. Le richieste che avviano
compilazioni richiedono un token locale generato dal server; origini esterne sono
rifiutate. La cartella del progetto non viene esposta come file server.

## Interfaccia

La modalità Flowchart usa documenti JSON versionati e blocchi strutturati con
connessioni SVG automatiche. Il generatore mantiene una mappa riga→blocco; la stessa
traccia nativa pilota evidenziazione, condizioni, memoria e apertura della subroutine
attiva. Input/output/assegnamenti sono multilinea, con tipo iniziale opzionale
nell'input e distinzione OUT/OUTLN. La migrazione dal formato 1 al 2 converte gli
output con operatori di stream conservando identificatori e collegamenti.

Le frecce delle sequenze e dei controlli indicano anche la posizione di inserimento
(subroutine, contenitore, ramo, indice). Palette e menu sulla freccia riusano la
stessa operazione con validazione e annullamento. Il menu mostra miniature SVG delle
forme; un piccolo + visibile ha un'area di clic separata, più grande. I salti non
introducono punti di inserimento. FOR usa un esagono allungato con tre campi e
misure dinamiche; WHILE e DO...WHILE conservano i rombi e le rispettive connessioni
verticali dal basso e dall'alto. INIZIO/FINE comprendono il nome della subroutine.

FOR mostra le tre espressioni su una riga con tre porzioni SVG focalizzabili e
tooltip su mouse/focus; la larghezza viene adattata al testo. WHILE e DO...WHILE
usano punte di freccia esplicite nei vertici richiesti. Il percorso appena seguito
è ricavato dalla traccia e dai raccordi del grafo, usando l'esito effettivo anche
per rami vuoti; non attraversa istruzioni intermedie mai eseguite. La velocità
regola il timer di riproduzione, mantenendo i passi registrati invariati.

Il PNG è generato localmente dal diagramma SVG completo, con stili incorporati e
senza controlli di modifica, poi rasterizzato su canvas con fondo bianco e limiti
di dimensione. La CSP abilita soltanto immagini self/blob per questa operazione.

L'importazione C++ usa l'AST di Clang senza eseguire il programma, tramite API
locale autenticata. Il documento formato 3 conserva l'ambito C++: nessuna inferenza
o anticipazione delle dichiarazioni, omonimie lessicali e contatore locale al FOR.
Il C++ originale è conservato; la sostituzione del diagramma è annullabile. Le
inizializzazioni da funzione restano un'unica dichiarazione/chiamata, così il
risultato non compare prematuramente durante il calcolo. Cin concatenato e getline
mantengono la forma di lettura originale. Gli esclusi producono diagnosi, non
traduzioni approssimate. I diagrammi manuali mantengono la durata di subroutine.

L'inferenza usa std::decay_t<decltype(espressione)> e il tipo canonico di Clang,
senza rivalutare l'espressione. Gli scalari nati dentro rami/cicli hanno storage
nativo anticipato prima della struttura che li contiene, per mantenere durata di
subroutine. Metadati opzionali e validati dell'API identificano queste dichiarazioni:
non generano passi e i monitor restano inattivi finché una scrittura o dichiarazione
eseguita li attiva. Le letture non inizializzate sono comunque controllate. Questa
distinzione tra storage tecnico del C++ generato e creazione logica riguarda solo
il flowchart: il C++ scritto dal docente conserva i propri ambiti e durate.
Array, costanti e riferimenti espliciti si dichiarano nel corpo della subroutine,
prima delle strutture di controllo. Il motore ordinario non riceve metadati flow.

Direzione: banco di laboratorio, con editor a sinistra e memoria a destra; pila
delle chiamate e console restano visibili. Nessuna pagina promozionale.

```text
Codice C++                         Memoria / Pila delle chiamate
editor + righe                     frame, variabili, celle, alias
input del programma                spiegazione del passo
Avvia / passi / cursore            console
```

Colori: carta fredda `#f3f6fa`, inchiostro `#17263c`, blu `#245bb2`, verde
`#146b58`, ambra `#a35b12`, bordo `#cbd5e1`. Font di sistema per i controlli,
Menlo/Consolas per codice e valori. Allineamento a sinistra, contrasto elevato,
dimensione del testo regolabile. Il colore segnala una modifica insieme a un
indicatore testuale; i collegamenti hanno anche un'etichetta e una destinazione
cliccabile. Su schermi stretti i pannelli si dispongono in colonna.

## Condizione di completamento

Gli esempi della dispensa e programmi originali devono attraversare compilazione,
registrazione e interfaccia. Prove automatiche per il motore e una prova nel browser
devono confermare valore/riferimento, array, ambiti, errori e navigazione. I limiti
osservati vanno aggiornati in COSTRUTTI.md, senza dichiarare supporto solo perché
un programma compila.

# Dentro il codice

Visualizzatore didattico C++17 per le lezioni di Informatica SIA. Il docente può
scrivere un programma al momento, eseguirlo e osservare valori, array, riferimenti,
puntatori e pila delle chiamate. L'esecuzione è locale e non richiede account o rete.

## Flowchart: versione in sviluppo

La modalità **Flowchart** permette di costruire diagrammi a blocchi con collegamenti
automatici, dichiarazioni, input/output, decisioni, cicli e chiamate a subroutine.
Il diagramma genera C++ ed è eseguito dal medesimo motore locale: memoria, console,
parametri e passi restano disponibili. Codice C++ e diagramma hanno salvataggi
separati nel browser; il diagramma può essere salvato e riaperto come file JSON.

Questo è un salvataggio intermedio: i campi utilizzano ancora espressioni C++.
L'adattamento a una sintassi simile ad AlgoBuild, comprese dichiarazioni esplicite
e creazione automatica delle variabili, è in fase di definizione con il docente.
Le decisioni e le verifiche completate sono registrate in [PIANO.md](PIANO.md).
L'esecuzione richiede il server locale descritto sotto.

## Avvio su macOS

Servono Python 3.9 o successivo, Clang e `sandbox-exec`. Gli strumenti di sviluppo
di Xcode sono già presenti sul computer usato per la verifica. Per installarli su
un altro Mac, usare `xcode-select --install`; Python deve essere disponibile come
comando `python3`.

Fare doppio clic su **avvia.command**, oppure eseguire dalla cartella del progetto:

```sh
python3 server.py
```

Aprire **http://127.0.0.1:8765** nel browser. Tenere aperto il terminale e premere
Ctrl+C per fermare il server. Se la porta è occupata: `python3 server.py --port 8766`.
Non servono installazioni npm, pip o connessioni a servizi esterni.

Dopo un aggiornamento dei file del visualizzatore, fermare il server con **Ctrl+C**,
riavviare `avvia.command` (oppure `python3 server.py`) e ricaricare la pagina.
La sola ricarica della pagina non aggiorna il motore Python già in esecuzione.
Codice e input salvati nel browser restano disponibili. Un errore tecnico su
`cv::watch` o `cv::input` con numero di argomenti diverso può indicare un server
precedente all'aggiornamento.

Se compare **Server locale non raggiungibile**, avviare `avvia.command`, tenere
aperto il terminale e ricaricare la pagina. È un problema di connessione prima
della compilazione, distinto dagli errori nel programma C++. Codice e input
rimangono salvati nel browser.

## Una lezione

1. Scrivere/incollare codice nell'editor vuoto, oppure scegliere uno dei sei esempi facoltativi. **Nuovo programma** svuota editor e input e permette di ripartire da zero.
2. Inserire nel campo **Input del programma** tutti i valori richiesti da `cin`, separati da spazi o INVIO. Ogni istruzione di lettura mostra nella console i dati che consuma, seguiti da INVIO: due `cin` separati mostrano due risposte anche con input `4 6`. Una lettura concatenata (`cin >> a >> b`) mostra un'unica risposta; `getline` mantiene spazi e righe.
3. Premere **Visualizza esecuzione**.
4. Usare **Avanti**, **Indietro**, il cursore o la riproduzione automatica.
5. Osservare la riga evidenziata, le celle e i frame. **Indirizzi** mostra gli
   indirizzi reali; un collegamento cliccabile porta all'oggetto di un riferimento
   o di un puntatore. Un valore modificato ha anche l'etichetta **cambiato**.
6. Usare **Modifica codice** per cambiare il programma e avviare una nuova traccia.

Le fotografie comprendono anche console e quantità di input già letta. Tornare
indietro non riesegue il programma. I riferimenti C++ condividono l'indirizzo della
variabile originale; i parametri per valore hanno una propria cella. `?` indica
una cella non inizializzata. Le variabili locali scompaiono alla fine del loro ambito.

La **Console** mostra prompt, input digitato, INVIO e output nel loro ordine. Anche
`getline` e gli spazi presenti nei dati mantengono il comportamento C++. I dati si
inseriscono prima dell'avvio; il campo della console non è un terminale interattivo.

Il menu **Svuota memoria** permette di scegliere:

- **All'avvio della prossima esecuzione** (impostazione iniziale): alla fine resta
  una fotografia delle variabili di `main`, globali e statiche ancora presenti
  nell'ultimo stato di `main`. Le variabili di blocchi e funzioni già conclusi non
  ricompaiono. La fotografia resta anche modificando il codice o preparando un
  nuovo programma, e viene rimossa quando si preme **Visualizza esecuzione**.
- **Alla fine del programma**: raggiunto l'ultimo passo, memoria e pila si svuotano.

La preferenza è ricordata nel browser. La fotografia è etichettata **Esecuzione
terminata**: non rappresenta variabili ancora allocate nel processo. Cambiare la
scelta all'ultimo passo aggiorna subito la visualizzazione. Tornando indietro si
possono sempre esaminare gli stati precedenti. Le fotografie restano nella sessione
aperta della pagina; non sono salvate per la riapertura del browser.

Il software riconosce automaticamente il ruolo di variabili e parametri:

- **Input**, blu: dato in ingresso al programma o alla funzione.
- **Output**, verde: risultato prodotto.
- **Input/Output**, viola: dato in ingresso che viene aggiornato.
- **Lavoro**, ocra: variabile di appoggio al calcolo.

Le variabili hanno l'aspetto compatto originale, con il solo colore del riquadro
diverso. La legenda spiega i colori; passando il mouse su una variabile si legge
anche il ruolo, disponibile alle tecnologie assistive. Non ci sono selettori.

Per le variabili, `cin` e `getline` individuano l'input; stampe e valori restituiti
individuano l'output. Una variabile presente in entrambe le categorie è input/output;
contatori e appoggi interni sono di lavoro. Il `return` di `main` non è considerato
output didattico. I collegamenti attraverso alias e funzioni vengono seguiti.

Per i parametri la classificazione è relativa alla funzione: il valore in ingresso
letto prima di essere sicuramente sovrascritto è input; la scrittura nella memoria
del chiamante tramite riferimento, puntatore o array è output. Entrambe le operazioni
danno input/output. Modificare una copia passata per valore non la rende un parametro
di output. Per esempio, `r=7; r++;` su un riferimento è solo output; `r+=7;` è
input/output. Un parametro inutilizzato o sovrascritto solo nella copia è di lavoro.

L'analisi del codice considera tutti i rami, anche quelli non percorsi dai dati
inseriti. Il colore resta stabile nei passi, nelle chiamate ricorsive e nella
fotografia finale; per un array riguarda l'intero array. Nei casi in cui non può
provare che una scrittura preceda sempre una lettura, considera possibile l'input:
per esempio cicli, switch, indici calcolati e puntatori riassegnati possono produrre
una classificazione conservativa. Non è una deduzione dell'intenzione del docente.

**Testo grande** aumenta la leggibilità in proiezione. Codice e input vengono
ricordati nello storage locale del browser; **Scarica .cpp** salva il sorgente.
Al primo avvio l'editor è vuoto; nelle aperture successive viene recuperato il codice
salvato. Caricare un esempio o scegliere **Nuovo programma** sostituisce il contenuto
dell'editor: scaricare prima il codice che si desidera conservare.

## Copie, puntatori e chiamate concluse

Selezionare il **nome di una variabile** nel pannello memoria per osservare i suoi
collegamenti. All'ingresso in una funzione viene selezionato il primo parametro;
gli altri restano selezionabili. Selezionare la variabile del chiamante mostra le
copie che ne derivano nelle chiamate ancora attive. I collegamenti sono locali al
pannello, così le frecce non attraversano tutta la schermata.

- **Copia del valore**, tratteggiata: origine → parametro, con il valore ricevuto
  al momento della chiamata. Le due celle sono distinte; il dato iniziale resta
  indicato anche se il parametro viene modificato.
- **Copia dell'indirizzo**, tratteggiata: `&x`, un array o un puntatore del chiamante
  → parametro puntatore. Il puntatore ha una propria cella. Una seconda indicazione
  continua mostra la **destinazione attuale**: assegnare `nullptr` al parametro
  cambia questa destinazione, mentre la copia iniziale resta documentata.
- **Riferimento**, continuo: alias della stessa cella. Non è presentato come copia.

Le destinazioni sono cliccabili e vengono evidenziate nella memoria attiva. Il
valore e l'indirizzo passati sono quelli effettivi del C++; gli argomenti non sono
valutati una seconda volta per costruire i collegamenti. Per espressioni e argomenti
predefiniti si mostra il valore ricevuto; il collegamento a una cella sorgente è
disponibile per variabili, indirizzi e indici letterali identificabili senza
rivalutazione. Un'espressione come `v[i++]` resta etichettata come espressione.

**Chiamate concluse** è un archivio inizialmente richiuso sotto la memoria attiva.
Contiene una voce richiudibile per ogni chiamata, ordinata per conclusione, con
nome della subroutine, numero di chiamata e passo di conclusione. Chiamate ripetute
e ricorsive hanno fotografie distinte. Aprendo una voce si vedono in grigio gli ultimi valori dei parametri e dei locali
automatici ancora presenti al ritorno. I nomi sono barrati e gli alias sono indicati
come conclusi. È una fotografia: non ripristina la memoria e non mantiene frecce
attive verso celle che potrebbero essere state riutilizzate. Globali e statiche
continuano a comparire nella memoria attiva secondo la propria durata.

Si conservano tutte le chiamate concluse fino al passo scelto: tornando indietro
non compaiono chiamate future; una nuova conclusione aggiunge una voce all'elenco.
Le voci aperte rimangono aperte durante l'avanzamento e il cambio degli indirizzi.
Con la fotografia finale l'archivio resta anche durante la modifica del codice e
si svuota avviando un'altra esecuzione. Scegliendo la pulizia alla fine del programma
si svuota anche l'archivio; i passi precedenti restano consultabili. Non viene
archiviata una seconda copia di `main`, già coperta dalla fotografia finale.

## Condizioni facoltative

**Mostra condizioni**, accanto a **Indirizzi**, è inizialmente disattivato. La scelta
è ricordata nel browser; si può cambiare in qualsiasi passo senza rieseguire il
programma. Quando è attivo, nei controlli di `for`, `while`, `do…while` e `if` si
vedono espressione, valori realmente letti e risultato: **VERA** in verde,
**FALSA** in rosso. Il pannello indica se entrare/ripetere il corpo, uscire dal ciclo
o seguire un ramo; al passo successivo evidenzia la riga effettivamente raggiunta.

Il numero del controllo conta le valutazioni di quella condizione nella chiamata
corrente: non è il numero di iterazioni del corpo. Una condizione subito falsa ha
un controllo e zero iterazioni. `do…while` controlla dopo il corpo. `break` e
`continue` hanno indicazioni proprie e non vengono presentati come condizione falsa;
un `break` dello `switch` non viene confuso con l'uscita dal ciclo esterno.

Le condizioni sono valutate una sola volta. Per `i++ < 3` è registrato il valore
prima dell'incremento; per `++i < 3` quello dopo. Nelle espressioni con cortocircuito
si riportano soltanto le parti realmente lette. L'espressione con i valori
sostituiti è una spiegazione testuale: chiamate, operazioni di libreria e parti non
lette possono restare nella loro forma originale. Non vengono eseguite di nuovo
per completare la spiegazione. Il pannello compare sul controllo e sul primo passo
successivo, così non resta un risultato vecchio durante il resto dell'esecuzione.

## Supporto e limiti

Il dettaglio è in [COSTRUTTI.md](COSTRUTTI.md). Sono coperti i costrutti del nucleo
iniziale: tipi semplici, stringhe di base, array monodimensionali, condizioni e
cicli, funzioni, riferimenti, puntatori di base, ambiti e console.

- Questa distribuzione esegue programmi su **macOS**. Windows e Linux richiedono
  un isolamento del processo diverso e non sono stati verificati.
- Gli include ammessi sono `<iostream>`, `<string>`, `<iomanip>`. Macro e altre
  direttive del preprocessore non sono supportate.
- Matrici, struct, file, stringhe C, memoria dinamica e contenitori STL non sono
  inclusi. Gli array di caratteri sono utilizzabili per singoli elementi.
- Le inizializzazioni globali con chiamate a funzione, i ritorni per riferimento
  o puntatore, l'aritmetica dei puntatori e le dichiarazioni dentro la condizione
  di `if`/`while` non sono inclusi. `main` deve avere forma `int main()`.
- Gli input vanno forniti prima dell'avvio; se finiscono, la traccia si arresta
  con un messaggio e si può completare il campo e riavviare.
- Limiti: 30.000 byte di codice, 10.000 byte di input, 100 celle per array,
  800 stati, 40 chiamate annidate e 20.000 caratteri di output. Il contenuto delle
  stringhe nella memoria visualizzata è troncato a 2.000 caratteri per cella.
- Sono controllate letture non inizializzate, accessi agli array e dereferenziazioni
  nel perimetro previsto. UBSan aggiunge controlli su alcune operazioni non valide;
  questo non è un rilevatore completo di tutti i comportamenti indefiniti del C++.
- Il sorgente viene temporaneamente inserito in un namespace riservato e
  strumentato: gli indirizzi sono reali della versione osservata e cambiano tra
  esecuzioni. La traccia mostra punti prima e dopo le istruzioni, non ogni singola
  operazione della CPU o ogni sottoespressione.

Il server accetta solo richieste locali. Il programma C++ è avviato con un sandbox
che blocca file esterni, connessioni e processi figli; non viene eseguito se questo
isolamento non è disponibile. Sono presenti limiti di tempo e dimensione dei file,
ma non un limite rigido alla RAM su macOS. È uno strumento locale per codice
didattico del docente, non un servizio pubblico per eseguire sorgenti anonimi.

## Verifiche

```sh
python3 -m unittest test_engine test_server test_roles -v
node --check app.js
```

I test del motore compilano programmi C++ e avviano `sandbox-exec`: devono essere
eseguiti da un normale terminale macOS, fuori da un sandbox che impedisca di
crearne un secondo. Comprendono il confronto dei sei esempi con il C++ originale
e una prova dell'isolamento su un file sentinella, connessione locale e `fork`.

Pianificazione e scelte: [PIANO.md](PIANO.md), [PROGETTO.md](PROGETTO.md),
[ANALISI_DIDATTICA.md](ANALISI_DIDATTICA.md).

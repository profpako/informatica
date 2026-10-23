# Costrutti C++ — supporto e verifiche

## Stato

La prima versione locale è implementata e verificata su macOS con Apple Clang 21.
Il motore usa l'AST e il compilatore C++17 reali, con punti di osservazione per
registrare memoria, console e chiamate. I test del motore e le prove nel browser
sono riportati sotto; non viene promessa compatibilità con tutto il C++.

Le convenzioni sono ricavate da [ANALISI_DIDATTICA.md](ANALISI_DIDATTICA.md).
Il motore usa C++17. Non è richiesta una
riscrittura del codice del docente in un linguaggio di simulazione.

## Nucleo della prima versione

| Gruppo | Forme implementate nel perimetro | Visualizzazione |
| --- | --- | --- |
| Struttura | `#include` delle librerie previste, `using namespace std;`, `int main()`, commenti | Righe del programma collegate ai passi |
| Tipi semplici | `int`, `float`, `double`, `char`, `bool`, `const` | Nome, tipo, valore, ambito e identità dell'oggetto |
| Dichiarazioni | Con/senza inizializzazione; più dichiaratori, es. `int x = 5, y = 10;` | Nascita di ogni variabile; stato non inizializzato distinto da zero |
| Espressioni | Aritmetica, confronto, logica, assegnamenti composti, `++`/`--`, ternario | Valori e modifiche coerenti; divisione intera distinta da quella reale |
| Conversioni | Cast numerici C-style e `static_cast` | Risultato convertito secondo i tipi C++ |
| Selezione | `if`, `else if`, `else`, `switch`, `case`, `default` | Ramo eseguito |
| Ripetizione | `for`, `while`, `do-while`, cicli annidati, `break`, `continue` | Iterazione e ambito degli indici |
| Funzioni/procedure | Prototipi, definizioni prima/dopo `main`, `void`, ritorni, chiamate in espressioni | Frame della chiamata, parametri, locali e restituzione del risultato |
| Parametri | Per valore, `T&`, `const T&`, combinazioni | Copia per valore; riferimento come alias della stessa variabile |
| Chiamate ripetute | Chiamate annidate e ricorsione | Un frame distinto per ogni invocazione, anche della stessa funzione |
| Risoluzione delle chiamate | Overloading semplice su tipi numerici; parametri predefiniti | Funzione e valori effettivamente selezionati |
| Ambiti e durata | Globali, locali di funzione e blocco, omonimia, `::nome`, locali `static` | Oggetti distinti; durata corretta, inclusa persistenza delle statiche |
| Array monodimensionali | Tipi semplici e `string`; dimensione costante/dedotta, inizializzazione completa/parziale, indicizzazione, `sizeof` | Celle contigue, indici, valori e modifiche |
| Parametri array | `T arr[]`, `const T arr[]`, dimensione separata | Parametro adattato a puntatore, elementi condivisi con il chiamante |
| Puntatori di base | `T*`, `&`, `*`, `nullptr`, puntatore a variabile o elemento di array | Indirizzo contenuto nel puntatore e oggetto raggiunto |
| Stringhe di base | `string`, assegnazione, confronto, concatenazione, array di stringhe | Contenuto testuale leggibile; dettagli interni della libreria esclusi |
| Console | `cin >>`, `cout <<`, `endl`, `getline`, `cin.ignore()`, `fixed`, `setprecision`, `setw` | Trascrizione di prompt, input con INVIO e output, coerente con il passo corrente |

La lista non promette tutte le combinazioni possibili del linguaggio. Sono stati
provati i casi didattici descritti nei test; un caso non gestito viene rifiutato con
una diagnosi. In particolare: sono ammessi solo gli header iostream/string/iomanip/type_traits;
sono esclusi macro, inizializzazioni globali con chiamate, ritorni per riferimento
o puntatore, aritmetica dei puntatori e dichiarazioni nelle condizioni. Gli array
di char si usano per singoli elementi, senza le operazioni sulle stringhe C.
I limiti operativi completi sono nel [README.md](README.md).

## Estensioni successive

| Costrutto osservato | Esito della valutazione preliminare |
| --- | --- |
| Matrici e parametri `T m[][N]` | Verificati nel compilatore; visualizzazione bidimensionale rinviata alla fase successiva |
| Struct, struct annidate, array di struct | Caso base verificato nel compilatore; visualizzazione dei campi rinviata alla fase successiva |
| Stringhe C e operazioni di `<cstring>` | Gestione dei buffer e terminatore da progettare; una stringa letterale nell'output resta prevista nel nucleo |
| File di testo e binari | Esclusi dalla prima versione; richiedono gestione dei dati e degli effetti esterni |
| `vector`, `map`, algoritmi, lambda e metodi | Esclusi dalla prima versione; compilabilità e visualizzazione delle strutture sono verifiche distinte |
| Heap, `new`/`delete`, puntatori avanzati | Esclusi dalla prima versione; i puntatori di base del nucleo si riferiscono a variabili e array esistenti |
| Inizializzatori con designatori `.campo = ...` | Esclusi dalla base C++17; sono un costrutto standard da C++20 |
| Classi avanzate, ereditarietà, eccezioni, template scritti dal docente, concorrenza | Fuori dal perimetro iniziale |

Un compilatore reale può accettare costrutti esterni al perimetro. Questo non
autorizza l'interfaccia a presentarli come correttamente visualizzati.

## Verifica preliminare sul compilatore

- Ambiente: Apple Clang 21.0.0, `arm64-apple-darwin25.6.0`.
- Sorgente: [verifiche/costrutti.cpp](verifiche/costrutti.cpp).
- Compilazione senza diagnostiche; esecuzione conclusa con codice 0.
- Superati 10 gruppi di controlli `assert`: tipi; operatori/conversioni;
  condizioni/cicli; valore/riferimenti; funzioni; ambiti/statiche; array/puntatori;
  input/stringhe/output; matrici; struct.
- Controllata anche l'identità dei riferimenti e, con `static_assert`, l'adattamento
  dei parametri array a puntatore e dei parametri matrice a puntatore a riga.
- L'input della prova proviene da un buffer di testo collegato a `cin`; non è
  stata verificata un'interazione da tastiera nell'applicazione.

Comandi riproducibili dalla cartella del progetto, con Clang installato:

```sh
rtk proxy clang++ -std=c++17 -Wall -Wextra -pedantic-errors -O0 -g verifiche/costrutti.cpp -o /private/tmp/cpp-visualizer-verifica-costrutti
rtk proxy /private/tmp/cpp-visualizer-verifica-costrutti
```

## Condizioni verificate nel visualizzatore

- [x] Riferimenti e puntatori collegano gli oggetti corretti tra frame diversi.
- [x] Dichiarazioni e uscite dall'ambito aggiornano la memoria rappresentata nei casi provati.
- [x] Una variabile non inizializzata non riceve un valore inventato; le letture
  invalide e gli accessi fuori dai limiti vengono segnalati.
- [x] L'avanzamento mostra punti prima e dopo un'istruzione; le chiamate che essa contiene
  restano esplorabili. Non è promessa la scomposizione di ogni sottoespressione.
- [x] Tornare indietro ripristina lo stato registrato, inclusi console e input, senza
  ripetere effetti della precedente esecuzione.
- [x] Il codice nuovo del docente viene analizzato ed eseguito indipendentemente dagli
  esempi precaricati; modificandolo si invalida la traccia precedente.
- [x] Errori, costrutti esclusi e limiti di esecuzione ricevono messaggi espliciti.

## Esiti dell'implementazione

- `python3 -m unittest test_engine test_server test_roles -v`: 45 test superati, inclusi eco, ruoli, parametri, fotografie delle chiamate e valori reali delle condizioni.
- Nei test, i sei esempi inclusi producono lo stesso output della loro versione
  C++ originale, compilata separatamente senza strumentazione.
- Verificati valori e tipi scalari, riferimenti a variabili e celle, parametri
  misti, ricorsione, overloading, default, scope, statiche, array, puntatori,
  stringhe, input, conversioni, cicli e controlli su casi non validi.
- Verificati nel sandbox: blocco della lettura di un file sentinella esterno,
  delle connessioni di rete e di fork. Verificate le protezioni di origine,
  token e host dell'API e la mancata esposizione dei file sorgenti del server.
- `node --check app.js` e `bash -n avvia.command`: superati.
- Prova in Chrome: scrittura di un programma originale con input, array e parametro
  `int &`, output 8 con input 5 e output 9 dopo riavvio con input 6.
- Prova in Chrome: ritorno al passo con variabile non inizializzata, input ancora
  non letto e console ripristinata; alias cliccabile verso la cella corretta;
  modalità testo grande e assenza di scorrimento orizzontale della pagina a 390 px.
- Anteprima verificata: [anteprima.jpg](anteprima.jpg).
- Eco dell'input verificato con prompt successivi, valori sulla stessa riga,
  `getline`, spazi iniziali, testo UTF-8 e input non valido. Lo stdout mantiene gli
  stessi risultati dei programmi C++ originali.
- Verificata la fotografia finale senza variabili di scope conclusi; nel browser
  provate entrambe le politiche di pulizia, persistenza della preferenza, ripristino
  della console nei passi precedenti, conservazione durante la scrittura e rimozione
  della vecchia fotografia all'avvio di una nuova esecuzione.
- I ruoli didattici sono riconosciuti automaticamente dall'AST: input/output della
  console, ritorni e direzione dei parametri. Colori nei riquadri originali, senza
  selettori; array classificato nel suo insieme, omonimi indipendenti e colori stabili
  nei passi. L'analisi è conservativa per cicli, switch e alias con indici o destinazioni
  variabili; il dettaglio delle regole è nel README.
- Corretto il caso `cin >> base; cin >> altezza;` con input `4 6`: la console mostra
  ciascun dato dopo il proprio prompt e INVIO, mantenendo invariato stdout.

I controlli sugli errori operano nel sottoinsieme previsto e non rilevano tutti i
possibili comportamenti indefiniti del C++. Portabilità su altri sistemi e limiti
rigidi alla RAM non sono stati implementati.

L'archivio dell'interfaccia conserva tutte le chiamate concluse fino al passo
selezionato, comprese ripetizioni e ricorsione. Verificati nel browser ordine,
assenza di duplicati, fotografie distinte, navigazione, aperture e pulizia.

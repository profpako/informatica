# Analisi della dispensa del docente

## Fonti e metodo

- Documento: `Corso C++.pdf`, fornito dal docente.
- Percorso: `/Users/pasquale/Library/CloudStorage/GoogleDrive-pasquale.demichele@iisminzoni.edu.it/Il mio Drive/Classroom/INFORMATICA - 4CT - 2026-2027 4CT/Corso C++.pdf`.
- Analisi del testo estratto e controllo visivo di pagine significative.
- I numeri di pagina riportati sotto sono quelli stampati nel documento.
- Playlist lezioni, facoltativa: https://www.youtube.com/playlist?list=PLCWNunM9iUTNtrQp--7URgV2O5Z_Rr3eg
- Playlist esercizi, facoltativa: https://www.youtube.com/playlist?list=PLCWNunM9iUTNsH9xOl2d0W4qbLyiNSjAp
- I video non sono stati consultati: il PDF è sufficiente per ricavare le convenzioni iniziali.

## Convenzioni osservate

| Aspetto | Evidenza nella dispensa | Indicazione per il tool |
| --- | --- | --- |
| Impostazione | Programmi console, `#include <iostream>`, `using namespace std;`, `int main()` | Accettare questa forma senza richiedere riscritture |
| Nomi e commenti | Identificatori prevalentemente italiani, commenti esplicativi, esempi su voti e temperature | Riprendere nomi e contesti negli esempi guidati |
| Tipi | `int`, `float`, `double`, `char`, `bool`, costanti `const` | Delimitare il supporto a ciascun tipo, senza ridurre tutto a numeri interi |
| Dichiarazioni | Anche più variabili nella stessa istruzione, es. `int x = 5, y = 10;` | Non imporre una sola dichiarazione per riga |
| Input/output | `cin`, `cout`, `endl`, stringhe, `getline`, manipolatori di output | Valutare questi casi prima di scegliere il motore |
| Controllo | `if`/`else`, `switch`, ternario, `for`, `while`, `do-while`, `break`, `continue` | Definire e verificare il sottoinsieme supportato |
| Funzioni | Prototipi prima del `main`, definizioni anche successive; ritorni numerici, booleani e `void` | Le chiamate devono funzionare anche con questa disposizione |
| Parametri | Valore, `int &nome`, parametri misti e valori predefiniti | Distinguere copia e alias; delimitare i casi avanzati |
| Ambiti | Globali, locali, omonimia e operatore `::` | Identificare gli oggetti tramite il loro ambito, oltre al nome |
| Array | `T nome[N]`, dimensione dedotta, `const` per dimensioni, inizializzazione parziale, `sizeof` | Mantenere gli array tradizionali usati nelle lezioni |
| Array nelle funzioni | `int arr[]`, `const int arr[]`, dimensione passata separatamente | Mostrare che gli elementi appartengono all'array del chiamante |

La parte conclusiva comprende anche matrici, struct e array di struct, stringhe C,
file di testo e binari, `vector`, `map` e algoritmi. Sono argomenti osservati nella
fonte, non funzionalità già promesse per la prima versione.

## Esigenze didattiche ricavate

1. Una dichiarazione locale come `int numero;` deve essere distinguibile da una
   variabile inizializzata a zero. La successiva lettura con `cin` cambia il suo stato.
2. Un parametro per valore è un oggetto distinto. Le sue modifiche devono essere
   visibili durante la chiamata, senza modificare la variabile del chiamante.
3. Un parametro `int &a` è un alias della variabile originale: non va rappresentato
   come una seconda variabile indipendente contenente lo stesso valore.
4. La visualizzazione deve rendere chiari ingresso nella funzione, parametri
   effettivi e formali, variabili locali, ritorno e fine della chiamata.
5. Le variabili di un blocco e gli indici dichiarati nei cicli hanno il proprio ambito;
   variabili con lo stesso nome non vanno confuse.
6. Gli array richiedono celle indicizzate e aggiornamenti del singolo elemento.
   Per `int sequenza[5] = {1, 2};`, gli altri tre elementi valgono zero.
7. Nelle chiamate con array, leggere e modificare gli elementi deve rimandare alla
   stessa memoria del chiamante, mantenendo distinto il parametro dimensione.
8. La console deve restare coerente con lo stato visualizzato durante la navigazione.

Queste sono indicazioni per la progettazione: interfaccia e architettura non sono
ancora state scelte.

## Esempi da usare come criteri di accettazione

| Esempio della dispensa | Pagine stampate | Risultato da verificare nel tool |
| --- | --- | --- |
| `somma`, `calcolaMedia`, `saluta`, `isPari` | 13-14 | Prototipi, ritorni diversi, funzione `void`, ritorno usato in espressioni |
| `scambioErrato` / `scambioCorretto` | 15-16 | Con `x = 5`, `y = 10`, il primo lascia gli originali invariati; il secondo produce `x = 10`, `y = 5` |
| `incrementa` / `moltiplica` | 16 | `valore` passa da 5 a 8, poi a 16; solo il primo parametro è un riferimento |
| Contatore globale e locale | 21-22 | Il globale arriva a 2 dopo due chiamate; il locale di `main` vale 100; `::contatore` seleziona il globale |
| Inizializzazione degli array | 24-25 | Celle non inizializzate distinte dalle inizializzazioni complete, dedotte e parziali |
| `sommaArray` / `raddoppiaElementi` | 28-29 | Per `{1, 2, 3, 4, 5}`, somma 15 e array finale `{2, 4, 6, 8, 10}` |
| Gestione dei voti | 30-31 | Array, scansione con `for`, conversione per la media, modifica con limite massimo |
| Ricerca e Bubble Sort | 32-35 | Cicli annidati, ritorno anticipato e scambio di elementi |
| Funzioni su matrici | 43-45 | Caso da includere nel perimetro solo dopo valutazione esplicita |

I risultati sono aspettative ricavate dal codice: non sono esiti di test già eseguiti.

## Cautele prima di trasformare gli esempi in codice eseguibile

- L'estrazione testuale del PDF sostituisce alcuni operatori e parentesi con glifi
  speciali e conserva interruzioni di riga editoriali. Trascrivere confrontando la
  pagina visibile, poi compilare; non usare il testo estratto come sorgente grezzo.
- Nei parametri `T arr[]`, C++ adatta il tipo a `T*`; per le matrici `T m[][N]`, a
  puntatore a riga `T (*)[N]`. Il comportamento descritto nella dispensa come
  passaggio per riferimento degli array va distinto dai riferimenti nativi `T&`.
- Il modulo struct mostra assegnazioni come `studente1.nome = "Mario"` con un
  campo `char nome[30]`: non sono assegnazioni valide a un array C++. Negli eventuali
  esempi eseguibili occorrerà usare una copia appropriata o un campo `string`,
  esplicitando l'adattamento senza modificare la fonte.
- L'inizializzazione con designatori `.nome = ...` riportata nel modulo struct è
  standard da C++20, non da C++11. Scegliere e dichiarare lo standard prima di usarla.

## Passaggio all'implementazione

Il perimetro implementato e le verifiche sono registrati in
[COSTRUTTI.md](COSTRUTTI.md). La scelta del motore è documentata in
[PROGETTO.md](PROGETTO.md); le istruzioni d'uso sono nel [README.md](README.md).
Le playlist restano disponibili se servirà chiarire terminologia o svolgimento
delle spiegazioni che non emerge dal PDF.

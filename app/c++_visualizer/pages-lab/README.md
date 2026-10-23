# Motore online GitHub Pages + Clang WASM

Integrato in main con sorgenti condivisi e pubblicazione automatica dopo i test.
La prova originaria è conservata nel branch experiment/github-pages-wasm.
Il tag locale-stabile-2026-10-23 (9500f6f) conserva la base locale precedente.

## Come funziona

Il sito distribuisce solo file statici, compresi i componenti del compilatore.
Un Worker esegue Clang/LLD, il runtime WASI e Pyodide. L'analisi, la
strumentazione, i ruoli automatici e le conversioni riusano engine.py,
roles.py e flowchart_import.py; non viene introdotto un parser C++ alternativo.
L'interfaccia usa direttamente i file condivisi: app.js non viene riscritto.
Lo storage della prova usa un prefisso distinto, per non modificare eventuali
programmi salvati da altre versioni sullo stesso dominio GitHub Pages.

Gli endpoint /api della UI sono gestiti da un adattatore interno al browser:
non avvengono chiamate a un server Python né invii del codice a un compilatore
remoto. Tutti i componenti sono serviti dalla stessa origine. Non sono richiesti
SharedArrayBuffer, COOP/COEP o servizi a pagamento.

## Build e verifica

Dalla cartella app/c++_visualizer su main:

```sh
python3 pages-lab/build.py
python3 pages-lab/test_bridge.py
node test_flowchart.cjs
node test_program_files.cjs
node pages-lab/test_wasm.mjs
python3 -m http.server 18785 --bind 127.0.0.1 --directory pages-lab/dist
```

La prima build scarica dipendenze fissate e controllate con SHA-512; non esegue
script npm. dist e .cache sono ignorati da Git. Il risultato statico occupa
circa 104 MiB non compressi. Il primo avvio nel browser è più lento; i file
possono essere riutilizzati dalla cache HTTP. Non è stata implementata una
garanzia di funzionamento offline.

## Limiti da risolvere prima di considerarla la versione definitiva

- La prova offre C++17, C++20 e C++23, entro i costrutti supportati dal motore.
  Selezionare uno standard non abilita automaticamente nuovi costrutti didattici.
- Gli indirizzi sono reali indirizzi della memoria WASM a 32 bit, non del Mac.
- Il runtime conserva i controlli didattici su variabili, array e puntatori.
  Undefined/bounds sanitizer è attivo anche in WASM tramite trap, senza libreria
  nativa aggiuntiva: divisione per zero, overflow e shift non valido interrompono
  la traccia. I dettagli della diagnosi possono differire dalla versione locale.
- L'input manuale riproduce lo stesso modulo con le risposte già fornite,
  fermandosi alla successiva lettura. Mantiene console e traccia coerenti nel
  sottoinsieme deterministico ammesso, ma non è la ripresa dello stesso processo
  della versione locale. Prima di introdurre effetti esterni o sorgenti non
  deterministiche occorre sostituirlo con sospensione/ripresa reale (es. Asyncify).
- Sono previsti limiti di codice/input/passi e un arresto del Worker per tempi
  eccessivi. Non è stata verificata la parità completa della suite nativa.
- Prestazioni e memoria devono essere provate sui PC scolastici e sugli altri
  browser; la prima verifica riguarda Chrome desktop.

Nessuna modifica al formato .cpp/.flow.json. La pipeline Pages include la build
in sito/cpp-visualizer dopo i test. URL condiviso: https://profpako.github.io/informatica/cpp-visualizer/.
Il vecchio sito di prova conserva solo il rinvio. Non sono necessari token fra repository.
Gli asset applicativi hanno un hash di versione per evitare combinazioni di file
vecchi e nuovi nella cache; i pacchetti del compilatore hanno URL con versione fissata.
Dopo un aggiornamento ricaricare eventuali schede rimaste aperte sulla vecchia build.

Licenze e attribuzioni: THIRD_PARTY.md e file LICENSE inclusi nella distribuzione.

## Prima prova (storico)

Prototipo online: https://profpako.github.io/informatica-wasm-lab/.
Compilazione, traccia, console, memoria e fotografia della procedura verificati
su Pages con valore/riferimento/puntatore/array e risultato 6 7 8. Sul server
statico verificati inoltre input preparati/manuali, C++17/20/23 e flowchart area.
Piano e risultati dettagliati: ../PIANO_PAGES.md. Schermata: verifica-pages.png.

La scadenza giornaliera dell’artefatto di pubblicazione elimina solo il file
temporaneo di trasporto; non cancella il sito e non richiede ripubblicazioni
giornaliere. Il sito non ha una scadenza di un giorno.

## Verifiche condivise e aggiornamenti

84 test nativi superati su macOS, inclusi i tre standard e le sessioni manuali.
La suite WASM verifica 38 casi: esempi, standard effettivo, parametri, array,
condizioni, ricorsione, ruoli, UTF-8, input/correzioni/annullamenti, errori e limiti,
conversioni bidirezionali e tipi generati. Tre test del bridge confrontano anche
la strumentazione con il motore locale. La pipeline esegue sempre i controlli
rapidi Node, sito e tema, e ricostruisce la distribuzione da sorgente.
I gate bridge/WASM riusano soltanto un esito positivo per la stessa impronta di
codice JavaScript/Python/C++, test, pacchetti JSON e workflow, con le stesse
versioni di Node, Python e Clang e la stessa piattaforma. HTML, CSS, documenti,
immagini e pagine del sito non invalidano questo collaudo del motore.
La cache viene salvata solo dopo i test riusciti: un push precedentemente fallito
non abilita il percorso rapido. Cache assente/non disponibile o avvio manuale
eseguono il collaudo completo; un fallimento dei controlli blocca la pubblicazione.

Gli aggiornamenti richiedono un push su main: una modifica non pubblicata sul PC
non cambia il sito. Le parti comuni sono uniche; gli adattatori di esecuzione
sono distinti per le capacità differenti di macOS e del browser.

Verifica su Pages del 23 ottobre 2026: pipeline build/deploy verde; input manuali
4 e 6 con eco su righe separate, funzione area 24, procedura perimetro 20 e
archivio delle due chiamate. Vecchio URL verificato con rinvio automatico al
nuovo percorso; i dati del browser sono stati conservati. Prova visiva:
[verifica-condivisa.png](verifica-condivisa.png).

Gli output del flowchart producono C++ essenziale: `cout << "Risultato" << endl;`.
Il raggruppamento resta per confronti, shift, logica e altre espressioni che
cambierebbero significato senza parentesi. Verificati 12 test nativi dedicati,
compresi array/puntatori e la precedenza con output concatenati.

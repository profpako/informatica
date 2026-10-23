# Prova GitHub Pages + Clang WASM

Esperimento reversibile nel branch `experiment/github-pages-wasm`.
Base locale: tag `locale-stabile-2026-10-23`, commit `9500f6f`.
La cartella abituale e il branch main restano sulla versione locale.

## Come funziona

Il sito distribuisce solo file statici, compresi i componenti del compilatore.
Un Worker esegue Clang/LLD, il runtime WASI e Pyodide. L'analisi, la
strumentazione, i ruoli automatici e le conversioni riusano engine.py,
roles.py e flowchart_import.py; non viene introdotto un parser C++ alternativo.
L'interfaccia è prodotta dai file della versione locale.

Gli endpoint /api della UI sono gestiti da un adattatore interno al browser:
non avvengono chiamate a un server Python né invii del codice a un compilatore
remoto. Tutti i componenti sono serviti dalla stessa origine. Non sono richiesti
SharedArrayBuffer, COOP/COEP o servizi a pagamento.

## Build e verifica

Dalla cartella app/c++_visualizer del branch di prova:

```sh
python3 pages-lab/build.py
python3 pages-lab/test_bridge.py
node test_flowchart.cjs
node test_program_files.cjs
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
- Il runtime conserva controlli didattici su variabili, array e puntatori;
  la build sperimentale non usa i sanitizer undefined/bounds della build nativa.
- L'input manuale riproduce lo stesso modulo con le risposte già fornite,
  fermandosi alla successiva lettura. Mantiene console e traccia coerenti nel
  sottoinsieme deterministico ammesso, ma non è la ripresa dello stesso processo
  della versione locale. Prima di introdurre effetti esterni o sorgenti non
  deterministiche occorre sostituirlo con sospensione/ripresa reale (es. Asyncify).
- Sono previsti limiti di codice/input/passi e un arresto del Worker per tempi
  eccessivi. Non è stata verificata la parità completa della suite nativa.
- Prestazioni e memoria devono essere provate sui PC scolastici e sugli altri
  browser; la prima verifica riguarda Chrome desktop.

Nessuna modifica al formato .cpp/.flow.json. Il prototipo deve essere pubblicato
su un repository/sito di prova distinto da profpako/informatica, per evitare di
sostituire il sito delle lezioni già online.

Licenze e attribuzioni: THIRD_PARTY.md e file LICENSE inclusi nella distribuzione.

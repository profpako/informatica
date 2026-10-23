# Prova reversibile GitHub Pages + Clang WebAssembly

Base stabile: `9500f6f85fb6d2f45aefe00b3ae4e562d2890309`.
Tag pubblicato: `locale-stabile-2026-10-23`.
Branch: `experiment/github-pages-wasm`.
Worktree: `/private/tmp/cppviz-pages-lab`.

## Obiettivo della prima prova
Dimostrare su un sito statico gratuito la compilazione C++17/C++20,
analisi AST Clang e raccolta di una traccia delle variabili con il runtime
esistente. Nessun cambio al sito pubblico attuale o al server locale.

## Task
- [x] Salvare il tag stabile e creare worktree/branch separati.
- [x] Selezionare e fissare una toolchain gratuita riproducibile.
  - [x] Controllare licenze, download, dimensioni e requisiti del browser.
  - [x] Verificare compilazione C++ e AST JSON con le librerie necessarie.
- [x] Preparare una pagina sperimentale statica isolata.
  - [x] Compilazione/esecuzione in Worker, console ed errori visibili.
  - [x] Provare input preparati, array, riferimenti e puntatori.
  - [x] Provare runtime di osservazione e input manuale.
- [ ] Verificare su GitHub Pages senza sostituire il sito esistente.
- [ ] Documentare esiti, limiti e lavoro necessario per la parità funzionale.
- [ ] Pubblicare il branch di prova e verificare main invariato.

## Criterio di arresto
Questa fase termina con una dimostrazione verificata e una decisione motivata
sulla fattibilità. Il trasferimento completo dellapplicazione richiederà
un passo successivo: niente duplicazione dellinterfaccia o riscrittura
integrale prima che i punti critici siano provati.

## Ripristino
La cartella abituale resta su main. Per ripartire dalla base usare il tag;
non sono necessari reset distruttivi. I file .cpp/.flow.json non cambiano.

Prove locali sul server di soli file statici (porta 18785):
- Clang AST JSON e motore Python originale in Pyodide; nessuna API server.
- Area con input preparati 4 e 6: console e memoria finali 24.
- Input manuale: abc rifiutato, correzione 4 e risposta 6, risultato 24.
- C++20 valore/riferimento: 5 10 dopo valore, 10 5 dopo riferimento.
- C++23 puntatori/array: numero 11, secondo voto 8.
- Importazione C++ in flowchart riuscita; verifica dei tipi generati in corso.
- Test adapter Python (3), test Node flowchart/file e sintassi superati.
- Componenti fissati, hash verificati e licenze incluse.

Repository pubblico di sola prova creato: profpako/informatica-wasm-lab.
Non viene modificata la configurazione Pages di profpako/informatica.
Limiti della prova descritti in pages-lab/README.md, compresi input tramite
riproduzione deterministica e assenza dei sanitizer della versione nativa.

# Matrici e struct in C++

## Stato iniziale

Il compilatore accettava matrici e struct, ma la validazione del visualizzatore
le rifiutava. Locale e browser condividono `engine.py`, `roles.py`, `runtime.hpp`
e `app.js`: l'estensione appartiene a questi file, senza un secondo motore.

## Piano e implementazione

1. **Analisi e strumentazione.** Accettare array a due dimensioni e struct con
   campi dati pubblici; generare dall'AST i descrittori dei campi. Escludere i
   metodi impliciti del compilatore dall'analisi del programma del docente.
2. **Memoria osservata.** Registrare le celle finali con percorso, tipo e indirizzo;
   conservare inizializzazione, copie, alias e durata. Controllare separatamente
   le due dimensioni, anche attraverso parametri e puntatori a righe.
3. **Interfaccia comune.** Mostrare matrici per righe/colonne con scorrimento
   interno, campi con percorsi e tipi, modifiche e collegamenti. Riutilizzare la
   stessa rappresentazione nelle fotografie delle chiamate concluse.
4. **Consegna e verifica.** Aggiungere gli esempi “Matrici e parametri” e “Struct
   e array di struct”, aggiornare la guida, ricostruire la distribuzione statica
   e provare il motore nativo e WASM. Conservare le prove precedenti del Flowchart.

I quattro interventi sono implementati. Le definizioni delle struct devono
essere esterne alle funzioni; i tipi dei campi annidati si definiscono prima.
L'editor e la conversione Flowchart mantengono il proprio sottoinsieme.

## Criteri di accettazione

- `int a[100][50];` produce 5.000 celle distinguibili; scrivere in una non
  inizializza le altre. Le matrici appaiono in una griglia scorrevole.
- Inizializzazioni parziali, dimensioni dedotte, parametri matrice const e
  riferimenti mantengono valori e indirizzi C++.
- Struct annidate, campi array/string/puntatore e array di struct mostrano percorsi
  come `[1].indirizzo.cap`; le copie hanno identità distinte, i riferimenti no.
- Input preparati/manuali, ritorni per valore e designatori C++20/23 funzionano
  in entrambi gli ambienti. Letture non inizializzate, nullptr e indici invalidi
  interrompono la traccia con una diagnosi.
- Il limite condiviso di 12 MiB arresta esplicitamente le tracce grandi, prima
  del limite del file nativo. Massimo 100 elementi per dimensione e 5.000 celle
  finali per variabile composta. I limiti completi sono nel README.

## Comandi di collaudo

```sh
rtk proxy python3 -m unittest discover -v
rtk proxy python3 pages-lab/test_bridge.py
rtk proxy node test_flowchart.cjs
rtk proxy node test_program_files.cjs
rtk proxy node --check app.js
rtk proxy python3 pages-lab/build.py
rtk proxy node pages-lab/test_wasm.mjs
```

La prova visiva in Chrome verifica la griglia, i percorsi dei campi, l'output e
le fotografie in locale; la build statica esegue nel browser l'esempio di struct
con copia indipendente e campi annidati. La pubblicazione online segue la
pipeline del repository dopo il push; la build locale non aggiorna il sito pubblico.

Collaudo del 27 ottobre 2026: verificati 101 casi nativi (suite completa e
riesecuzioni mirate dopo le correzioni, compreso il conteggio degli otto esempi),
58 prove della suite WASM e 4 test del bridge. Verificato anche in WASM l'arresto
prima di main per un aggregato globale oltre 5.000 celle. Superati i due script
Node, il controllo sintattico di app.js e `git diff --check`.
Chrome mostra effettivamente 5.000 celle per `int a[100][50];`, ultima cella
`[99][49] = 7`, scorrimento interno in entrambe le direzioni e nessun allargamento
della pagina alla larghezza desktop verificata di 1440 px.

# Componenti gratuiti della prova

Le versioni e gli hash SHA-512 dei pacchetti sono fissati in packages.lock.json.
La build scarica archivi ufficiali npm, ne controlla l'integrità e copia i file;
non esegue script di installazione. Il sito distribuisce gli asset dalla propria
origine: codice degli studenti e input non vengono inviati a servizi di compilazione.

- browsercc 0.1.1: MIT, licenza in vendor/browsercc/LICENSE.
- Clang/LLD/libc++ LLVM 20.1.2: Apache-2.0 WITH LLVM-exception,
  testo incluso in LLVM-LICENSE.txt. Il sysroot WASI SDK 25 include librerie
  e header con le rispettive attribuzioni. Sorgenti/build:
  https://github.com/BertalanD/browsercc/tree/main
  https://github.com/llvm/llvm-project/tree/llvmorg-20.1.2
  https://github.com/WebAssembly/wasi-sdk/tree/wasi-sdk-25
- @bjorn3/browser_wasi_shim 0.4.2: MIT OR Apache-2.0, entrambi i testi in vendor/wasi.
- Pyodide 314.0.7: MPL-2.0, testo incluso in PYODIDE-LICENSE.txt;
  sorgenti https://github.com/pyodide/pyodide/tree/314.0.7.
- CPython 3.14.2: licenza e attribuzioni in PYTHON-LICENSE.txt;
  sorgenti https://github.com/python/cpython/tree/v3.14.2.

Gli aggiornamenti della toolchain richiedono una nuova verifica di compatibilità.

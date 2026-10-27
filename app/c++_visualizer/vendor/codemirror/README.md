# CodeMirror 5.65.21

Editor C++ distribuito localmente, licenza MIT in `LICENSE`.
Nessuna richiesta a CDN o servizi di completamento durante l'uso.

Fonte: https://registry.npmjs.org/codemirror/-/codemirror-5.65.21.tgz

Integrità dell'archivio verificata prima dell'estrazione:
`sha512-6teYk0bA0nR3QP0ihGMoxuKzpl5W80FpnHpBJpgy66NK3cZv5b/d/HY8PnRvfSsCG1MTfr92u2WUl+wT0E40mQ==`

`codemirror.js` concatena senza modifiche, nell'ordine indicato dai commenti:

- `lib/codemirror.js`
- `mode/clike/clike.js`
- `addon/edit/closebrackets.js`
- `addon/edit/matchbrackets.js`
- `addon/comment/comment.js`
- `addon/hint/show-hint.js`
- `addon/search/searchcursor.js`
- `addon/search/search.js`
- `addon/dialog/dialog.js`
- `addon/display/placeholder.js`

`codemirror.css` concatena `lib/codemirror.css`, `addon/hint/show-hint.css` e
`addon/dialog/dialog.css`. Gli stili dell'applicazione sono in `style.css`;
la configurazione e il completamento lessicale sono in `code-editor.js`.
Per aggiornare il vendor usare un archivio con versione e integrità verificate,
ricreare i due bundle con lo stesso elenco e ripetere i test dell'editor e la build.

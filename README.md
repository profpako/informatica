# Lezioni di Informatica · Pasquale De Michele

Pagina iniziale statica, utilizzabile anche aprendo `index.html` direttamente.

## Aggiungere una lezione

Inserisci la lezione in una cartella con un file `index.html`. Sono supportate
anche le sottocartelle, per esempio `reti/indirizzi-ip/index.html`.
Ogni `index.html` nelle cartelle delle lezioni diventa un collegamento nell'indice.
Le cartelle nascoste e quelle tecniche (`scripts`, `tests`, `assets`,
`node_modules`, `__pycache__`, `_site`, `dist`, `build`) sono escluse.

Il titolo viene letto dal primo contenuto `<h1>` (oppure dal `<title>`).
La descrizione viene letta da `<meta name="description" content="…">`.
Le cartelle superiori compaiono come percorso della lezione.

Per aggiornare l'indice locale, senza installare dipendenze:

```sh
python3 scripts/build_index.py
```

Per verificare il generatore:

```sh
python3 scripts/check_index.py
```

## Stile e tema

L'indice e le lezioni usano `assets/site.css` per colori, caratteri e intestazione,
e `assets/theme.js` per il selettore **Tema → Chiaro / Scuro**. La prima visita
segue il tema del dispositivo; la scelta manuale viene ricordata dal browser
anche navigando tra indice e lezioni. Se il salvataggio è bloccato, il selettore
continua a funzionare nella pagina corrente.

Le nuove lezioni possono riusare gli stessi file nel `<head>`:

```html
<link rel="stylesheet" href="../assets/site.css">
<script src="../assets/theme.js"></script>
```

Per una lezione in una sottocartella di secondo livello usa `../../assets/`.
Inserisci nell'intestazione questo selettore:

```html
<label class="theme-control">Tema
  <select data-theme-select aria-label="Tema della pagina">
    <option value="light">Chiaro</option>
    <option value="dark">Scuro</option>
  </select>
</label>
```

Per verificare il tema e i controlli aritmetici del laboratorio, usa Node:

```sh
node scripts/check_theme.js
```

## GitHub Pages

1. Carica questa directory in un repository GitHub, mantenendo le sottocartelle
   e il file `.github/workflows/pages.yml`.
2. In **Settings → Pages → Build and deployment → Source**, seleziona
   **GitHub Actions**.
3. Il workflow pubblica il sito a ogni push su `main` o `master`. Puoi anche
   avviarlo dalla scheda **Actions → Pubblica le lezioni → Run workflow**.

L'indice viene rigenerato prima di ogni pubblicazione: basta aggiungere o
rimuovere una cartella di lezione e caricarla su GitHub. I link relativi funzionano
anche quando il sito si trova sotto il nome del repository.

Se preferisci pubblicare direttamente da un branch, esegui il generatore
prima di caricare `index.html`: in quella modalità l'indice non si aggiorna da solo.

Riferimento: [workflow personalizzati per GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

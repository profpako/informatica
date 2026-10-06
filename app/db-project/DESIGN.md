---
name: Trama · Editor ER
description: Un foglio di progettazione per schemi ER didattici.
colors:
  paper: "#f5f7f4"
  surface: "#ffffff"
  ink: "#243c36"
  muted: "#62716b"
  line: "#dce3dc"
  accent: "#23594f"
  accent-hover: "#17463d"
  accent-soft: "#e9f0e9"
  error: "#9b302c"
  error-soft: "#fbefed"
  field-border: "#cad5cd"
  toolbar-surface: "#fafbf9"
  diagram-line: "#53666b"
  diagram-ink: "#203532"
  diagram-attribute: "#334642"
  diagram-role: "#4a605a"
  diagram-dot: "#364d48"
  diagram-selected: "#067e63"
  relational-fk: "#245d85"
typography:
  title:
    fontFamily: '"Avenir Next", Avenir, "Segoe UI", sans-serif'
    fontSize: "21px"
    fontWeight: 600
    letterSpacing: "-0.65px"
  body:
    fontFamily: '"Avenir Next", Avenir, "Segoe UI", sans-serif'
    fontSize: "14px"
  label:
    fontFamily: '"Avenir Next", Avenir, "Segoe UI", sans-serif'
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.4
  caption:
    fontFamily: '"Avenir Next", Avenir, "Segoe UI", sans-serif'
    fontSize: "11px"
  syntax:
    fontFamily: '"SFMono-Regular", Consolas, monospace'
    fontSize: "11px"
    lineHeight: 1.8
  diagram-node:
    fontFamily: '"Avenir Next", Arial, sans-serif'
    fontSize: "20px"
    fontWeight: 600
  diagram-attribute:
    fontFamily: '"Avenir Next", Arial, sans-serif'
    fontSize: "17px"
  relational-compact:
    fontFamily: '"SFMono-Regular", Consolas, monospace'
    fontSize: "14px"
    lineHeight: 2.4
rounded:
  diagram: "2px"
  badge: "4px"
  row: "5px"
  control: "6px"
  menu: "8px"
  dialog: "12px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "28px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "8px 13px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-subtle:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "8px 13px"
  button-subtle-hover:
    backgroundColor: "{colors.accent-soft}"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "10px"
    width: "100%"
  schema-row:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.row}"
    padding: "12px 7px"
    width: "100%"
  schema-row-selected:
    backgroundColor: "{colors.accent-soft}"
  tabs:
    backgroundColor: "transparent"
    rounded: "0"
    padding: "12px 8px"
  stage-bar:
    backgroundColor: "{colors.surface}"
    padding: "10px 24px"
  selection-checkbox:
    width: "17px"
    height: "17px"
  compact-schema:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.relational-compact}"
    rounded: "0"
    padding: "18px 22px"
  relation-table:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "20px"
---

# Design System: Trama · Editor ER

## Overview

**Creative North Star: "Foglio di progettazione"**

Un editor didattico con carta appena tinta, inchiostro verde scuro e controlli web familiari. L’interfaccia lascia spazio al disegno e mantiene gli input leggibili, senza composizioni promozionali. La notazione del PDF indicato in PRODUCT.md vincola le forme dello schema.

**Key Characteristics:**
- Superfici chiare, bordi sottili e azioni verdi.
- Un carattere sans per l’interfaccia; monospace per sintassi e dati testuali.
- Modifica guidata e disegno SVG con trascinamento diretto.

## Colors

### Primary
Il verde azione distingue esportazione, applicazione e generazione; il verde tenue segnala righe selezionate e hover secondari. Il diagramma usa un verde più brillante per selezione e focus, mantenendo separati stato interattivo e tratto ordinario.

### Secondary
Il blu dedicato distingue la doppia sottolineatura delle chiavi esterne nella notazione relazionale compatta richiesta dal PDF.

**The FK Rule.** Le FK hanno doppia sottolineatura blu. Una PK composta ha una sola sottolineatura continua sull’intero gruppo, virgole comprese, anche quando i componenti sono FK. Una PK di una sola colonna che è anche FK usa la doppia sottolineatura della FK.

### Neutral
Carta per il piano di lavoro, bianco per moduli e nodi, fondo tenue per toolbar e sezioni inferiori. Inchiostro e testo secondario costruiscono la gerarchia; i separatori restano discreti. Le linee del diagramma hanno un tono grigio verde dedicato.

Gli errori usano testo rosso su fondo pallido, accompagnato da un messaggio esplicito.

## Typography

La famiglia sans di sistema mantiene una voce uniforme nei controlli. Titoli compatti, etichette semibold e didascalie più piccole distinguono contenuto e istruzioni. Il marchio è una scritta sans, non un secondo carattere display.

La sintassi strutturata usa monospace; gli attributi nei moduli usano la stessa famiglia a una dimensione leggermente maggiore. Le dimensioni del diagramma sono unità SVG e scalano con lo zoom; non vanno applicate alle etichette dell’interfaccia. Lo SVG incorpora il proprio stile per conservarlo nell’esportazione.

La notazione relazionale compatta riusa il monospace a dimensione maggiore e interlinea ampia, con nomi di relazione in grassetto. Passa a (13px) su mobile e (12px) in stampa.

## Layout

Desktop: header (80px), indice laterale (310px) e disegno flessibile. La toolbar precede il canvas e la legenda lo chiude; l’indice scorre indipendentemente. La finestra di lavoro occupa l’altezza residua dello schermo con un minimo (580px).

La sidebar passa a (280px) sotto (1100px) e a (340px) da (1650px). Sotto (760px), l’header va a capo e il diagramma precede i moduli: altezza (60dvh), minimo (420px). L’indice diventa una sezione in pagina. I comandi zoom restano sul canvas; toolbar e legenda si compattano.

Le spaziature del frontmatter descrivono il ritmo ricorrente, non una griglia obbligatoria. Il canvas ha una trama puntinata (20px), esclusa dalle immagini esportate e dalla stampa.

La barra delle fasi segue la toolbar e va a capo su mobile. Nella vista relazionale il canvas diventa una pagina scorrevole, senza trama, con contenuto centrato e larghezza massima (1100px); su mobile l’altezza segue il contenuto. Notazione compatta e tabelle consentono l’andata a capo dei nomi lunghi. In stampa i controlli vengono nascosti e il contenuto relazionale resta nel flusso della pagina.

## Elevation & Depth

Il piano principale è piatto: bordi e variazioni di fondo separano le zone. Ombre leggere sono riservate al menu di esportazione e ai comandi zoom. Il dialogo nativo usa un fondale scuro trasparente. Valori di ombra, focus e movimento sono conservati nel sidecar.

## Shapes

Controlli con angoli piccoli e regolari; badge e righe hanno curvature più strette, menu e dialogo più ampie. Icone lineari, senza riempimenti decorativi. Nel diagramma, rettangoli per entità, rombi per associazioni e cerchi vuoti/pieni per attributi/identificatori preservano la notazione del PDF.

I composti collegano i sottoattributi al cerchio del gruppo. Le gerarchie usano una freccia triangolare vuota rivolta al padre, collegamenti a gomito e una descrizione testuale di copertura e appartenenza; lo stile del triangolo è incluso nello SVG esportato.

## Components

### Buttons
Azioni principali verdi con testo bianco; azioni secondarie trasparenti con hover tenue. I pulsanti con icona mantengono un nome accessibile. Focus visibile con contorno verde; stato disabilitato attenuato. Il feedback di colore dura (160ms) ed è disattivato con reduced motion.

### Inputs / Fields
Campi bianchi con bordo sottile e padding uniforme, etichetta esplicita e focus verde. Select, textarea e dialogo restano elementi nativi. I messaggi di errore compaiono vicino al relativo input.

Le selezioni di entità figlie e attributi usano checkbox native con accento verde e nomi espliciti. La lista degli attributi ha altezza massima (200px), scorrimento e rientri per i sottoattributi. Il fieldset Posizione degli attributi unifica checkbox, Seleziona tutti / Deseleziona tutti e un solo select Sposta la selezione. Il menu parte da Scegli un lato ed è disabilitato senza selezione; scegliere sopra, sotto, a sinistra o a destra include anche le componenti dei gruppi selezionati.

Per un elemento esistente, la scelta del lato mostra subito un’anteprima nel diagramma; per un nuovo elemento imposta la posizione senza disegnarlo prima dell’applicazione. Applica allo schema o Applica disposizione salva le modifiche; tornare all’indice scartandole ripristina il disegno salvato. Durante l’anteprima il trascinamento e le frecce degli elementi attendono l’applicazione o lo scarto, mentre pan e zoom della vista restano disponibili. Il flusso vale per ER iniziale e disposizione del derivato.

Cambiare o azzerare la selezione mantiene il promemoria dell’anteprima da applicare, affiancato alle istruzioni per la selezione successiva.

### Navigation
Le schede Struttura / Da testo usano un tratto inferiore verde per lo stato attivo. Le righe dell’indice hanno nome, dettaglio e icona geometrica; selezione e hover condividono il fondo verde tenue. La modifica avviene nella sidebar con ritorno all’indice.

La barra delle fasi riusa select e pulsanti nativi per ER iniziale, ER ristrutturato e schema relazionale. Stato e rapporto di trasformazione restano testo e details nel flusso. L’iniziale viene conservato; nel derivato nomi e struttura sono in sola lettura, mentre la disposizione resta modificabile. Le strategie delle gerarchie riusano i select: mantieni padre e figlie, accorpa nel padre o accorpa nelle figlie quando totale.

### Diagramma interattivo
Il canvas live è un gruppo SVG con nodi e attributi raggiungibili da tastiera. Trascinare un nodo ridisegna i collegamenti; porte separate e corsie a gomito distinguono più collegamenti sullo stesso lato. Tratti disgiunti possono condividere una corsia. Cardinalità e ruoli sono collocati insieme vicino ai segmenti, cercando spazio libero da nodi, attributi e altre etichette. I ruoli distinguono le associazioni ricorsive.

Riordina confronta griglie di centri allineati e scambia le posizioni delle entità per ridurre collegamenti diagonali, incroci e passaggi attraverso altri nodi, rispettando i livelli delle gerarchie. Sceglie i lati degli attributi liberi dai collegamenti e valuta anche la suddivisione dei ventagli lunghi, mantenendo interi i gruppi composti. La griglia riserva gli ingombri di nodi, attributi e rombi; le associazioni binarie sono centrate o spostate lungo l’asse equidistante dai partecipanti. La ricerca è deterministica e limitata: schemi densi possono richiedere correzioni manuali. La misura del testo usa stime conservative condivise; la ricerca locale delle etichette non equivale a un instradamento completo attorno agli ostacoli.

Il trascinamento dello sfondo sposta la vista. Invio apre il modulo, le frecce spostano la selezione.

Lo SVG esportato è un’immagine con titolo e fondo bianco; conserva la geometria e lo stile del disegno.

### Schema relazionale
La notazione compatta è la vista iniziale: nome della relazione seguito dagli attributi tra parentesi, gruppo PK con una sola sottolineatura continua, FK con doppia sottolineatura blu e campi opzionali con asterisco. La PK composta di segue(follower_id, seguito_da_id) ha una sola linea solida sotto entrambi i nomi e la virgola; le due FK restano distinte nei dettagli, nel testo esportato e nelle descrizioni per lettori di schermo. Una PK di una sola colonna che è anche FK usa la doppia sottolineatura. Riferimenti FK e vincoli UNIQUE sono espandibili con details nativi.

Il dettaglio alternativo usa contenitori bianchi piatti, bordati e con il raggio dei controlli, titoli sans e tabelle semantiche. Le colonne descrivono attributo, chiavi e nullabilità; vincoli residui e regole applicate restano testo esplicito. Nessuna ombra aggiuntiva distingue queste superfici.

## Do's and Don'ts

### Do:
- **Do** preservare le forme e le cardinalità della notazione didattica.
- **Do** mantenere focus visibile, etichette dei campi e nomi accessibili delle icone.
- **Do** usare il verde per azioni e selezione, e bordi sottili per separare le superfici.

### Don't:
- **Don't** aggiungere caratteri display o decorazioni promozionali all’editor.
- **Don't** sostituire i simboli ER con card generiche.
- **Don't** introdurre animazioni di ingresso o movimento indispensabile alla comprensione.

# Prodotto

<!-- impeccable:product-schema 1 -->

## Platform
web

## Stack
Scelta delegata dall’utente. HTML, CSS, JavaScript e SVG nativi: prima funzione locale, senza backend o dipendenze di esecuzione.

## Users
Uso didattico confermato dall’utente: esercizi di progettazione delle basi di dati, con moduli semplici e notazione come nel PDF fornito.

## Product Purpose
Ricevere descrizioni di entità, attributi, associazioni e gerarchie, disegnare uno schema ER modificabile, ristrutturarlo conservando l’originale e generarne lo schema relazionale.

## Operating Context
Il riferimento è /Users/pasquale/Downloads/Esercizio svolto TikTok.pdf, pagina 6: rettangoli, rombi, attributi a cerchio e cardinalità minime/massime.

## Capabilities and Constraints
Input guidato e testo strutturato. Costruzione diretta dell’editor funzionante confermata dall’utente. L’utente ha autorizzato attributi composti/multipli, gerarchie totali/parziali ed esclusive/sovrapposte, strategie di accorpamento, conservazione di ER iniziale/ristrutturato e successiva generazione relazionale. Ha chiesto lati modificabili per attributi singoli, gruppi o tutti gli attributi e riduzione degli incroci quando possibile. FK dedotte dalle associazioni; vincoli residui conservati come testo, senza esecuzione. Schema fisico e SQL rinviati.

## Evidence on Hand
Due schemi ER TikTok nel PDF: originale e ristrutturato. Gli esempi riprendono i dati forniti; non sono una verifica della correttezza dell’intero esercizio.

Il relazionale deve essere visualizzabile anche nella notazione compatta a pagina 7: nome della relazione seguito da attributi tra parentesi, PK sottolineate, FK evidenziate e opzionali con asterisco. Il dettaglio tabellare rimane una rappresentazione alternativa.

Correzione esplicita dell’utente: le FK hanno doppia sottolineatura. Le PK composte, comprese quelle delle associazioni molti a molti, hanno una sola sottolineatura sull’intero gruppo: la coppia di `segue` forma una sola PK, pur conservando due FK distinte.

L’utente ha segnalato confusione tra i due menu per spostare tutti gli attributi o una selezione. Il flusso usa ora una sola selezione e un solo menu del lato, con selezione totale e anteprima prima di applicare il modulo.

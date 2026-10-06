# Prodotto

<!-- impeccable:product-schema 1 -->

## Platform
web

## Stack
Scelta delegata dall’utente. HTML, CSS, JavaScript e SVG nativi per l’editor; backend Python locale con PyMySQL e SQLGlot per il laboratorio delle query, Ollama per i dati sintetici.

## Users
Uso didattico confermato dall’utente: esercizi di progettazione delle basi di dati, con moduli semplici e notazione come nel PDF fornito.

## Product Purpose
Ricevere descrizioni di entità, attributi, associazioni e gerarchie, disegnare uno schema ER modificabile, ristrutturarlo conservando l’originale e generarne lo schema relazionale e lo schema fisico MySQL. Popolare un database locale da prompt e spiegare graficamente tabelle, colonne e passaggi delle SELECT.

## Operating Context
Il riferimento è /Users/pasquale/Downloads/Esercizio svolto TikTok.pdf, pagina 6: rettangoli, rombi, attributi a cerchio e cardinalità minime/massime.

## Capabilities and Constraints
Input guidato e testo strutturato. Costruzione diretta dell’editor funzionante confermata dall’utente. L’utente ha autorizzato attributi composti/multipli, gerarchie totali/parziali ed esclusive/sovrapposte, strategie di accorpamento, conservazione di ER iniziale/ristrutturato e successiva generazione relazionale. Ha chiesto lati modificabili per attributi singoli, gruppi o tutti gli attributi e riduzione degli incroci quando possibile. FK dedotte dalle associazioni; vincoli residui conservati come testo, senza esecuzione. Lo schema fisico MySQL propone tipi e opzioni secondo il PDF TikTok, modificabili insieme a DEFAULT, azioni FK e CHECK per tabella. Esporta CREATE TABLE. Il laboratorio si collega al server locale scelto dall’utente e può creare solo in database vuoti; non migra tabelle esistenti.

## Evidence on Hand
Due schemi ER TikTok nel PDF: originale e ristrutturato. Gli esempi riprendono i dati forniti; non sono una verifica della correttezza dell’intero esercizio.

Il relazionale deve essere visualizzabile anche nella notazione compatta a pagina 7: nome della relazione seguito da attributi tra parentesi, PK sottolineate, FK evidenziate e opzionali con asterisco. Il dettaglio tabellare rimane una rappresentazione alternativa.

Correzione esplicita dell’utente: le FK hanno doppia sottolineatura. Le PK composte, comprese quelle delle associazioni molti a molti, hanno una sola sottolineatura sull’intero gruppo: la coppia di `segue` forma una sola PK, pur conservando due FK distinte.

L’utente ha segnalato confusione tra i due menu per spostare tutti gli attributi o una selezione. Il flusso usa ora una sola selezione e un solo menu del lato, con selezione totale e anteprima prima di applicare il modulo.

Correzioni richieste per la fase fisica: multivalore con id proprio e valore separato, relazioni al plurale rispetto alle entità, ENGINE e CHARSET facoltativi tramite spunte, azioni FK omissibili e spiegazione dei quattro comportamenti. Riordina deve allineare anche le tre ramificazioni dello schema farmacia con quattro entità.

L’utente ha scelto un database MySQL locale reale e richiede AI utilizzabile anche su Mac Apple Silicon con 8 GB. Il modello iniziale è Qwen3.5 2B quantizzato, con contesto e quantità di dati limitati. L’AI propone JSON, la verifica usa i vincoli del database e l’utente può correggere i valori prima di inserirli. La spiegazione mostra l’ordine logico FROM/JOIN/WHERE/GROUP/SELECT, distinto dal piano dell’ottimizzatore.

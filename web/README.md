# web — l'interfaccia

Milestone 5. Quattro schermate: classifica, giornate, rosa e formazione.

```bash
npm run crea-lega -- fixtures/rose.csv --nome "Lega degli amici"   # una volta sola
npm run dev                                                        # il sito su :3000
npm run gioca -- lega-degli-amici                                  # il job serale
```

## Next.js senza niente attorno

Le uniche dipendenze sono `next`, `react` e `react-dom`. Niente libreria di
componenti, niente framework CSS, niente stato globale: c'è un foglio di stile
scritto a mano e una sola pagina interattiva. Per quattro schermate, ogni
dipendenza in più costerebbe più di quanto rende, e il proprietario del progetto
conosce il CSS.

Quasi tutto è **calcolato sul server**. L'unico componente che gira nel browser
è lo schieramento, perché è l'unico posto dove serve uno stato: quale giocatore
sta in quale casella mentre lo stai spostando.

`/engine` e `/fanta` si importano direttamente, con lo stesso percorso relativo
e la stessa estensione `.ts` che usano fra loro gli altri pacchetti. Turbopack li
compila come compila il resto dell'app: non serve nessuna configurazione, e
soprattutto non serve una copia del motore per il browser.

## Non si ricalcola la classifica: si ricalcola tutto

Ogni richiesta rigioca da capo tutte le giornate fin qui. Non è uno spreco per
distrazione, è la stessa scelta della regola 6 vista da vicino: il risultato di
una giornata è una funzione pura del seme del mondo e delle formazioni salvate,
quindi **non esiste** una classifica da tenere aggiornata che possa andare fuori
sincrono con i risultati.

Costa qualche decimo di secondo per una stagione intera. Si tiene in memoria
l'ultimo esito, con chiave lo stato salvato: finché nessuno schiera e nessuno
gioca, la risposta è già pronta; appena qualcosa cambia, la chiave cambia e si
ricalcola. Non c'è nessuna invalidazione scritta a mano, che è sempre il punto
in cui una cache sbaglia.

## La regola di chi può giocare dove non è nel browser

Nella schermata di schieramento, ogni casella mostra solo i giocatori che
possono occuparla, e segnala quelli fuori posizione. Quella regola arriva **già
calcolata dal server**, casella per casella e modulo per modulo.

È deliberato. La matrice Mantra ha eccezioni che dipendono dal modulo — W e T
sono intercambiabili con malus, tranne nel 4-1-4-1 dove non lo sono nemmeno con
malus — e una seconda copia in JavaScript prima o poi divergerebbe dalla prima.
Il giorno in cui divergesse, la schermata direbbe una cosa e il punteggio ne
farebbe un'altra, ed è esattamente il tipo di bug che diventa una lite nella
chat della lega.

Per lo stesso motivo il pulsante «riempi da solo» è un'azione sul server: usa
l'algoritmo ungherese di `/fanta`, lo stesso della sostituzione automatica.
Quello che vedi è quello che succederebbe se non toccassi niente.

## Si schiera sempre per la prossima giornata

La schermata di formazione lavora sulla giornata `giocate + 1`, sempre. Una
giornata già giocata non si tocca: il suo risultato l'hanno già letto tutti, e
poterla cambiare vorrebbe dire riscrivere il passato.

Chi non schiera non resta senza formazione: vale l'ultima salvata. Chi non ne ha
mai salvata nessuna scende in campo con la migliore che la rosa esprime.

## Struttura

```
app/layout.tsx                          guscio e navigazione
app/page.tsx                            classifica
app/giornate/                           elenco e dettaglio di una giornata
app/squadre/                            elenco, rosa
app/squadre/[id]/formazione/            schieramento: pagina, azioni, componente
app/globals.css                         il foglio di stile, tutto qui
src/dati.ts                             lo strato dati: archivio, contesto, viste
```

## Cosa manca

- **L'autenticazione.** SPEC §9 prevede il link magico via email, che richiede
  Supabase Auth. Oggi chiunque apra il sito può schierare per chiunque: va bene
  in locale, non va bene appena il sito sta su internet. È il primo pezzo da
  fare prima di mettere online qualcosa.
- **Supabase.** Lo stato sta in un file JSON dietro il contratto `Archivio`
  (`/jobs/src/archivio.ts`). La seconda implementazione è una classe che
  risponde a tre metodi, e nient'altro cambia — ma serve un progetto Supabase,
  che deve creare il proprietario.
- Il job serale gira a mano da riga di comando; il cron di Vercel arriva col
  deploy.
- Scambi, chat e cronache: milestone 6 e 7.

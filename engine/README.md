# engine — il motore di simulazione

Milestone 1. Simula il campionato: calendario, formazioni, partite, statistiche,
voti, infortuni e cartellini. È un pacchetto **puro**: non importa nulla da
Next.js, da Supabase o dalla rete, non tocca il filesystem e non usa
`Math.random()`. Riceve il mondo come dato e un generatore casuale come
dipendenza.

## Come si usa

```bash
npm test                            # i test, comprese le distribuzioni
npm run calibra                     # 30 stagioni, rapporto sulle metriche
npm run calibra -- --stagioni 300   # più precisione, più tempo
npm run calibra -- --standardizzazione
```

Una stagione completa (380 partite) richiede circa 0,2 secondi, quindi anche
trecento stagioni sono meno di un minuto.

## La calibrazione è il punto

`CLAUDE.md` mette il motore e la sua taratura **prima di qualunque schermata**,
e ha ragione: un campionato sbilanciato scoperto dopo tre settimane di gioco
costa molto più di un giorno di taratura, e una volta che la lega è partita i
numeri non si possono più cambiare senza falsare la stagione.

`npm run calibra` stampa un rapporto con un verdetto accanto a ogni metrica.
Stato attuale su 120 stagioni — tutti i bersagli della specifica sono centrati:

| metrica | valore | bersaglio |
|---|---|---|
| gol a partita | 2,68 | 2,4–3,0 |
| vittorie in casa | 0,42 | 0,40–0,48 |
| pareggi | 0,24 | 0,22–0,30 |
| media dei voti | 5,97 | 5,9–6,1 |
| deviazione standard dei voti | 0,69 | 0,6–0,7 |
| voti ≥ 8 | 1,1% | 1–2% |
| voti ≤ 4,5 | 2,1% | 2–3% |
| ammonizioni a partita | 4,57 | 4,0–5,5 |
| espulsioni a partita | 0,29 | 0,15–0,35 |
| varianza fra i ruoli | 0,86 | ≥ 0,75 |

L'ultima riga merita una parola: la specifica avverte di non lasciare che un
ruolo abbia una varianza sistematicamente più bassa degli altri, coi portieri
come indiziato numero uno. Se il portiere prende sempre 6, il ruolo diventa
irrilevante all'asta.

## Dove si tarano i numeri

| file | a cosa serve |
|---|---|
| `config/motore.json` | forze, gol attesi, condizione, forma, morale, disciplina, medie delle statistiche |
| `config/voto.json` | la formula del voto: pesi per ruolo, standardizzazione, azioni decisive |

Nessun peso vive nel codice. Si cambia un numero, si rilancia `npm run calibra`,
si guarda il rapporto.

**Due parametri vanno rigenerati, non inventati.**

- `voto.standardizzazione` — media e deviazione dell'indice di ruolo. Si
  ottengono con `npm run calibra -- --standardizzazione` e si incollano nel
  file. Vanno rifatte **ogni volta che cambiano i pesi del voto o le medie
  delle statistiche**, altrimenti i voti si spostano tutti insieme.
- `forze.rapportoDiEquilibrio` — il rapporto attacco/difesa fra due squadre
  medie. Serve perché i due aggregati nascono da pesi diversi su aree diverse e
  non sarebbero confrontabili; senza questa normalizzazione `golAttesiBase` non
  vorrebbe dire niente e si tarerebbero i gol muovendo un numero privo di
  significato.

## Determinismo

Stesso seme, stesso risultato. Serve per i test, per la calibrazione e per
dirimere le contestazioni: se un utente contesta un risultato, lo si rigenera e
si guarda.

Ogni partita riceve il **proprio** generatore, seminato su
`(lega, stagione, giornata, indice della partita)`. Non c'è uno stato casuale
che scorre da una partita all'altra, quindi simulare la giornata 12 non dipende
dall'aver simulato la 11. È la premessa perché il job serale possa essere
idempotente davvero, e c'è un test che la sorveglia.

## Il confine col livello fanta

Il motore produce **voti e statistiche**, che appartengono al mondo e sono
uguali per tutte le leghe che ci girano sopra. Non produce fantavoti: bonus,
malus e modificatori appartengono alla lega e vivono altrove. Questo pacchetto
non sa cosa sia un bonus, né un credito, né un fantallenatore, e non conosce la
differenza fra una lega classic e una Mantra.

## Struttura

```
src/casuale.ts        generatore deterministico, Poisson, estrazione pesata
src/mondo.ts          tipi e validazione del mondo, indici
src/ruoli.ts          i dodici ruoli in sei famiglie, una sola tassonomia
src/configurazione.ts tipi e validazione dei due file di config
src/calendario.ts     girone all'italiana, turni infrasettimanali e di coppa
src/stati.ts          condizione, forma, morale, rating effettivo
src/allenatore.ts     schieramento automatico dei club, forze di reparto
src/partita.ts        il contratto simulaPartita e la sua implementazione
src/voto.ts           il voto statistico
src/stagione.ts       il giro completo di 38 giornate
src/calibrazione.ts   lo script di taratura
```

`simulaPartita` è un **contratto**, non un'implementazione unica: il giorno in
cui servisse un motore minuto per minuto si scrive un'altra funzione con la
stessa firma e non si tocca nient'altro.

## Cosa manca

- Autogol e rigori sbagliati sono previsti dai tipi e dalla formula del voto ma
  il motore non li genera ancora: usciranno quando si affinerà l'attribuzione.
- Le grandi occasioni fallite e le parate decisive sono generate come
  statistiche indipendenti, non derivate dalle occasioni realmente create.
- La politica di turnover dell'allenatore è volutamente semplice: sceglie il
  modulo meglio coperto e i migliori per condizione. Non ha una gerarchia
  esplicita né una nozione di importanza della partita.

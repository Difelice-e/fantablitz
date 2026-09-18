# seed — dal listone al mondo simulato

Milestone 0 della roadmap. Questo pacchetto legge il listone ufficiale Mantra di
Fantacalcio.it e ne ricava il mondo simulato di partenza: venti club, cinquecento
e passa giocatori con rating, età e propensioni.

## Come si usa

Dalla cartella `seed/`:

```bash
npm run seed              # genera il seed in out/
npm run seed:anonimo      # come sopra, ma con nomi inventati, in out-anonimo/
npm run seed:controlla    # non scrive: verifica che out/ sia aggiornato
npm test                  # i test
```

Serve Node 22.18 o successivo. Non ci sono dipendenze da installare: il progetto
usa solo la libreria standard di Node, che sa già leggere gli archivi ZIP di cui
un file `.xlsx` è fatto.

## Cosa produce

| file | cosa contiene |
|---|---|
| `out/mondo.json` | il mondo simulato: club e giocatori con i loro rating |
| `out/riferimenti-esterni.json` | la corrispondenza fra gli id interni e gli `Id` di Fantacalcio.it |
| `out/RAPPORTO.md` | il riepilogo leggibile, da aprire per controllare il risultato |

I due file sono separati apposta. Il mondo simulato non contiene **nessun**
identificativo di Fantacalcio.it: la chiave del dominio è l'id interno, e l'id
esterno serve solo agli import delle rose. È la regola 2 di `CLAUDE.md`, e c'è un
test che la sorveglia.

**Il rapporto è la cosa da guardare.** Un JSON da cinquecento giocatori non si
controlla a occhio; il rapporto sì. Si apre, si guarda se i migliori attaccanti
sono davvero i migliori attaccanti, se le età hanno senso, se le squadre più
forti sono quelle giuste. Trenta secondi e si sa se la derivazione ha funzionato.

## Come nascono i rating

Il listone non contiene rating: contiene prezzi. La catena è questa.

1. **Segnale.** `FVM M` (peso 0.7) e `Qt.A M` (peso 0.3), entrambi in scala
   logaritmica. Il logaritmo serve perché `FVM M` è violentemente storto: mediana
   14, massimo 450. In scala lineare il novanta per cento del listone si
   schiaccerebbe nel primo decimo della scala.

2. **Qualità 0–1**, normalizzata **dentro il ruolo classico**, non sull'intero
   listone. È la scelta meno ovvia e vale la pena spiegarla: metà dei portieri ha
   `FVM M = 1`, perché il mercato non paga le riserve. Normalizzando su tutti,
   ogni portiere di scorta finirebbe al livello del peggior giocatore del
   campionato. Dentro il proprio ruolo la scala si riapre.
   La qualità mescola due letture dello stesso segnale: la posizione in classifica
   (rango) e la distanza in valore (magnitudine), in proporzione `mixRango`.

3. **Overall**, nella fascia prevista per il ruolo. I portieri hanno una forbice
   più stretta e un pavimento più alto: fra il miglior portiere della Serie A e un
   titolare qualsiasi la distanza reale è molto minore che fra il miglior
   attaccante e una punta di metà classifica.

4. **Quattro rating di area** (attacco, difesa, tecnica, fisico), distribuiti
   secondo i ruoli Mantra dichiarati, col primo ruolo che pesa il doppio degli
   altri. La formula parte dal livello del giocatore medio:
   `area = 50 + (overall − 50) × peso_di_ruolo`. Così un grande attaccante non
   diventa un pessimo difensore, diventa un difensore nella media — che è quello
   che volevamo dire.

5. **Propensioni** a gol, assist, cartellino e infortunio, dal ruolo, corrette
   per qualità.

**Età, età del picco e potenziale non sono nel listone** e vengono generati con
una distribuzione plausibile. Sono verosimili, non veri: se un giocatore noto
esce con un'età sbagliata, si corregge a mano in
`config/override-giocatori.json`, senza toccare il codice.

## Dove si tarano i numeri

Tutti i pesi, le soglie e i coefficienti stanno in `config/`, mai nel codice.

| file | a cosa serve |
|---|---|
| `config/parametri.json` | pesi dei segnali, fasce per ruolo, profili dei ruoli Mantra, età, coppe |
| `config/club.json` | corrispondenza nome esteso ↔ sigla a tre lettere, colori |
| `config/override-giocatori.json` | correzioni manuali sui singoli giocatori |

Si cambia un numero, si rilancia `npm run seed`, si riapre il rapporto. Nessun
deploy, nessuna ricompilazione.

## Riproducibilità

Stesso listone e stessa configurazione producono lo stesso seed, byte per byte.
Non c'è nessun `Math.random()` e non c'è nessuna data di generazione nel file: il
seed porta invece l'impronta SHA-256 del listone da cui è nato. Ogni giocatore ha
un generatore casuale seminato sul proprio identificativo, quindi aggiungere o
togliere qualcuno dal listone **non sposta l'età di tutti gli altri**.

`npm run seed:controlla` verifica che i file su disco corrispondano a quelli che
la configurazione attuale genererebbe: utile in futuro come controllo automatico.

## `--anonimizza` non è un giochino

La regola 1 di `CLAUDE.md` dice che deve essere possibile sostituire l'intero
database con nomi di fantasia cambiando solo il seed. `npm run seed:anonimo` è la
prova che il vincolo regge: genera lo stesso identico mondo — stessi id, stessi
rating, stesse età — con nomi inventati. Se un giorno qualcosa a valle dipendesse
da un nome reale, il seed anonimo lo farebbe emergere subito invece che fra sei
mesi.

## Struttura

```
src/xlsx.ts           lettore .xlsx minimale (l'unico file che conosce Excel)
src/listone.ts        dal foglio alle righe validate, esclusione dei ceduti
src/ruoli.ts          ruoli Mantra: tipi e parsing (";" e "," entrambi)
src/derivazione.ts    segnale → qualità → overall → aree e propensioni
src/costruisci.ts     assemblaggio del seed e dei riferimenti esterni
src/fantasia.ts       nomi inventati per l'anonimizzazione
src/rapporto.ts       il rapporto leggibile
src/cli.ts            riga di comando
```

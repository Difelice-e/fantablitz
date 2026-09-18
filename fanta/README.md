# fanta — il livello di lega

Milestone 2. Qui vivono le regole della lega: moduli, schieramento, sostituzioni
automatiche. È il lato opposto del confine rispetto a `/engine`: voti e
statistiche appartengono al mondo simulato e sono uguali per tutti, gli
schieramenti appartengono alla lega.

Il pacchetto è puro come il motore: nessuna dipendenza da Next.js, da Supabase o
dalla rete, nessun accesso al filesystem.

```bash
npm test
```

## I due contratti

La modalità e il livello di sostituzione sono due assi indipendenti, e tenerli
separati è la ragione per cui non c'è duplicazione:

| contratto | dipende da | implementazioni |
|---|---|---|
| `RegoleSchieramento` | la **modalità** | `classic`, `mantra` |
| `StrategiaSostituzione` | il **livello** | `basic` (poi Easy e Master) |

Due più tre implementazioni invece di due per tre. La strategia non sa in quale
modalità sta girando: si limita a chiedere alle regole se una soluzione è valida
e quanto costa.

Che la separazione sia quella giusta si vede da un dettaglio. In `classic` il
malus di adattamento non esiste, quindi il passo 3 della ricerca — la soluzione
adattata — non produce mai nulla e la ricerca si ferma da sola. Non è servito
scrivere un ramo dedicato, e c'è un test che lo verifica su cinque scenari.

## L'ordine di ricerca

Da `SPEC.md` §6.3, uguale in entrambe le modalità:

1. soluzione **perfetta** nel modulo schierato
2. soluzione **efficiente** con un altro modulo, senza malus
3. soluzione **adattata**, col minor numero possibile di fuori posizione

Se nemmeno il terzo passo basta, si scende in campo **incompleti** scegliendo il
modulo che lascia meno caselle scoperte, invece di fallire. Il chiamante riceve
l'elenco degli slot vuoti e può avvisare l'utente.

A parità di soluzione vince chi l'utente ha messo più in alto in panchina, e si
resta nel modulo già schierato: la formazione è persistente e non deve cambiare
più del necessario.

## Perché l'algoritmo ungherese e non un ciclo

L'accoppiamento giocatori-caselle è un problema di assegnazione, e va risolto
all'ottimo. Un algoritmo goloso — riempio le caselle una alla volta prendendo
ogni volta il migliore disponibile — sbaglia in un caso concreto e frequente:

> Tre caselle, e un solo giocatore può occupare la terza. Se il goloso lo
> sistema nella prima casella, che potevano occupare anche altri, poi dichiara
> la terza impossibile da riempire. Ma la formazione era schierabile.

In una lega fra amici una risposta del genere è una lite garantita, quindi qui
dentro c'è l'ottimo vero. Con undici caselle e venticinque giocatori è
istantaneo. Il caso ha il suo test in `test/assegnazione.test.ts`.

## I tre pesi

L'assegnazione minimizza un costo composto da tre criteri su scale separate:

| criterio | peso | cosa decide |
|---|---|---|
| adattamento | 1 | una scelta di gioco |
| continuità con la formazione precedente | 0,001 | solo fra soluzioni equivalenti |
| priorità della panchina | 0,00001 | solo fra soluzioni equivalenti anche in continuità |

Gli ordini di grandezza sono la cosa importante: nessuno dei due criteri minori
può mai far preferire una formazione con un adattamento in più. Sarebbe un bug
difficile da vedere e facilissimo da contestare.

## Modalità `classic`

Matrice diagonale, nessun malus: o si è del ruolo o non si gioca. Sette moduli,
rosa di **esattamente 25 con quote 3-8-8-6**.

Quella composizione ha una conseguenza che vale la pena sapere: con otto
difensori e otto centrocampisti **tutti e sette i moduli sono schierabili senza
adattamenti**, sempre. C'è un test che lo dimostra.

## Modalità `mantra`

Undici moduli, matrice ruolo × casella con tre livelli — al proprio posto,
adattato, adattato con aggravio — ed eccezioni che dipendono dal **modulo** e
non solo dalla casella. È per questo che `valuta` riceve anche il modulo: W e T
sono intercambiabili con aggravio, tranne nel 4-1-4-1 dove non lo sono nemmeno
con malus.

Un giocatore con due ruoli entra col **migliore** dei due, non col primo
dichiarato.

### ⚠️ La matrice va verificata prima che la lega parta

`config/mantra.json` contiene una **ricostruzione** della matrice ruolo × casella,
non una trascrizione del regolamento ufficiale di Fantacalcio.it.

- Il **meccanismo** è completo e testato: costi, aggravi, eccezioni per modulo,
  ordine di ricerca, doppio ruolo.
- **Quali ruoli esattamente ogni casella accetti** va confrontato col
  regolamento.

Correggere la matrice non richiede di toccare una riga di codice: è esattamente
perché sta in configurazione. I test verificano il meccanismo, non i contenuti
della matrice, quindi continueranno a valere anche dopo la correzione.

Un controllo strutturale aiuta: ogni modulo deve avere cinque caselle di stampo
difensivo e cinque offensive oltre al portiere (`SPEC.md` §6.2). La validazione
lo impone e si rifiuta di caricare una configurazione che non lo rispetti — ha
già trovato un errore nella prima stesura.

## Copertura dei moduli

`coperturaModuli` dice, per ogni schema, se la rosa lo copre perfettamente, solo
con adattamenti, o per niente. `SPEC.md` §6.1 chiede di mostrarla subito dopo
l'import: con rose da venticinque la copertura è tipicamente parziale, ed è
l'informazione che l'utente vuole vedere per prima.

## Struttura

```
src/tipi.ts          i tipi condivisi, incluso il minimo che serve di un giocatore
src/assegnazione.ts  algoritmo ungherese, l'unico pezzo di matematica
src/regole.ts        il contratto RegoleSchieramento
src/classic.ts       regole classic
src/mantra.ts        regole Mantra, matrice ed eccezioni
src/schieramento.ts  disposizione, copertura, validazione di una formazione
src/sostituzione.ts  il contratto StrategiaSostituzione e la strategia Basic
```

## Cosa manca

- Easy e Master, che arriveranno dietro il flag `sostituzioni_easy_master`. La
  strategia Basic è già sostituibile: sono due implementazioni in più, non una
  riscrittura.
- Il malus in punti (default −0.5) non si applica qui: questo pacchetto conta
  gli adattamenti in unità astratte, e la conversione in punti è del fantavoto,
  che arriva con la milestone 4.

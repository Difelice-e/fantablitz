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

`config/mantra.json` è la **trascrizione del materiale ufficiale** «Mantra
Experience — Edizione 2026/2027»: gli schemi degli undici moduli, la tabella
delle sostituzioni e la tabella dei ruoli con le linee di gioco. Niente è
dedotto, perché non serve più dedurre.

La configurazione usa le **sigle e la notazione degli schemi ufficiali**
(`DC/B`, `M/C`, `E/W`, `T/A/PC`) apposta: così si confronta a occhio con le
immagini del regolamento, riga per riga. Anche la matrice conserva il suo
alfabeto originale — `OK`, `-1`, `NO`, `*`, `**`, `***` — invece di essere già
interpretata: la trascrizione resta verificabile, e l'interpretazione sta nel
codice.

### La tabella delle sostituzioni è la regola

La riga è il ruolo della **casella da coprire**, la colonna il ruolo di **chi la
copre**. Il verso conta: un difensore può coprire una punta con un malus, una
punta non può coprire un difensore. Ne segue che all'asta conviene valutare un
giocatore nel suo **ruolo più arretrato**, perché è quello che gli apre più
caselle.

Tre simboli dipendono dallo **schema**, non solo dai due ruoli:

| simbolo | significato |
|---|---|
| `OK` | nessun malus |
| `-1` | ammesso con un adattamento |
| `NO` | non ammesso |
| `*` | `OK` se la casella elenca i due ruoli in alternativa, altrimenti `NO` |
| `**` | `OK` se in alternativa, altrimenti un adattamento |
| `***` | `OK` se in alternativa, `NO` nel 4-1-4-1, altrimenti un adattamento |

È la ragione per cui `valuta` riceve anche il modulo: senza, metà della tabella
non sarebbe esprimibile. Nel codice i tre simboli si risolvono sempre sul
ripiego, perché il caso «in alternativa» è già stato deciso prima — se il ruolo
è fra i nativi della casella, il giocatore è al suo posto e basta.

### Il malus è −1, e non esistono aggravi

La tabella ufficiale ha solo tre esiti: `OK`, `-1` e `NO`. Non c'è nessun
secondo livello di malus. Il `***` — che avevamo letto come «aggravio» — non è
un malus più pesante: è la nota che vieta lo scambio W/T **nel solo 4-1-4-1**.

`SPEC.md` §4 è allineata al regolamento: −1, un solo livello.

### Linea e stampo sono due cose diverse

La **linea** raggruppa i ruoli sul campo — difesa (`DS, DC, DD, B`), centrocampo
(`E, M, C`), trequarti (`W, T`), attacco (`A, PC`). Lo **stampo** divide i cinque
difensivi (`Dd, Ds, Dc, B, E, M`) dai cinque offensivi (`C, T, W, A, Pc`) che
ogni schema impiega. Non coincidono: nel centrocampo convivono entrambi, con `E`
e `M` difensivi e `C` offensivo.

Il vincolo dei cinque e cinque è verificato come **raggiungibile**, non come
già deciso: le caselle che mettono in alternativa ruoli di stampo diverso, come
`M/C`, lasciano la scelta al fantallenatore.

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
src/fantavoto.ts     dal voto al fantavoto, bonus, malus e modificatori
src/soglie.ts        dai fantapunti ai gol
src/calendarioFanta.ts  il calendario della lega
src/classifica.ts    scontri diretti e classifica
```

## Il punteggio della lega

Il **voto** appartiene al mondo simulato ed è lo stesso per tutte le leghe che
ci girano sopra. Il **fantavoto** appartiene alla lega: due leghe sullo stesso
mondo possono pagare la stessa identica partita in modo diverso. Per questo il
motore non compare da nessuna parte in `fantavoto.ts`: gli eventi arrivano come
dato, in una forma che il chiamante costruisce.

I valori stanno tutti in `config/lega.json` (`SPEC.md` §4): gol +3, rigore
segnato +3, assist +1, rigore parato +3, porta inviolata +1, ammonizione −0.5,
espulsione −1, rigore sbagliato −3, autogol −2, gol subito −1.

### Il modificatore di difesa è acceso, a sei fasce

Media dei voti **puri** — esclusi bonus e malus — del portiere più i **3
migliori difensori**, e solo con una difesa da almeno 4 uomini. Un punto ogni
quarto di voto: 6.00 vale +1, 6.25 +2, 6.50 +3, 6.75 +4, 7.00 +5, 7.25 +6.

Due scelte meritano una riga ciascuna.

**Si usano i voti puri, non i fantavoti.** Un difensore che segna non rende la
difesa più solida: pagarglielo due volte sarebbe un regalo a chi ha in rosa un
terzino che tira le punizioni.

**Se anche uno solo dei giocatori considerati non porta voto, non si applica
affatto.** Non si ripiega su una media parziale, che sarebbe più generosa
proprio con chi ha schierato meno gente.

Resta un'impostazione di lega: spegnerlo è una riga di configurazione, non
cambia i fantavoti individuali, e c'è un test che lo verifica. Il modificatore
portiere esiste, ha i suoi test ed è spento: la lega usa per ora il solo
modificatore di difesa, e accenderlo un domani non deve essere una modifica al
codice (regola 5).

## Cosa manca

- Easy e Master, che arriveranno dietro il flag `sostituzioni_easy_master`. La
  strategia Basic è già sostituibile: sono due implementazioni in più, non una
  riscrittura.
- Il malus in punti non si applica nello schieramento: `schieramento.ts` conta
  gli adattamenti in unità astratte ed è `fantavoto.ts` a convertirli in punti.
  Col malus a −1 il cambio è uno a uno, ma tenerli separati significa che
  ritoccare il malus non tocca l'algoritmo di schieramento.

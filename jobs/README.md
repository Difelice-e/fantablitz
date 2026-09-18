# jobs — importatore e ciclo di gioco

Milestone 3 e 4: l'**importatore delle rose da Fantalab** e il **ciclo serale**.
Più avanti ci vivranno anche i generatori AI (`SPEC.md` §9).

```bash
npm run importa -- fixtures/rose.csv          # importa le rose
npm run importa -- rose.csv --scrivi out.json
npm run ciclo   -- fixtures/rose.csv          # gioca una stagione di lega
npm run ciclo   -- fixtures/rose.csv --giornate 5
npm test
```

Opzioni: `--modalita classic|mantra` (default classic), `--budget` (500),
`--squadre` per pretendere un numero esatto di squadre, `--seed` per puntare a
una cartella di seed diversa, `--scrivi` per salvare le rose importate.

## L'import è atomico

O passa tutto, o non passa niente. `importaRose` non restituisce mai un
risultato parziale e **non scrive da nessuna parte**: valida e produce l'esito,
e chi la chiama scrive solo se l'esito è riuscito. Nove squadre importate su
dieci non sono un risultato accettabile — sarebbe un'asta da rifare a metà.

Per lo stesso motivo raccoglie **tutti** gli errori invece di fermarsi al primo:
chi deve correggere l'export vuole l'elenco completo, non scoprirne uno alla
volta a ogni tentativo.

## La chiave è il `Fantacalcio_Id`, e basta

Il listone interno è lo stesso di Fantacalcio.it, quindi l'abbinamento è esatto
e **non serve nessun confronto per somiglianza sui nomi**. I nomi restano un
dato di visualizzazione: quando non corrispondono si produce un avviso, non un
errore.

Questo è anche il motivo per cui l'id esterno vive in
`seed/out/riferimenti-esterni.json` e non dentro il mondo simulato: è un
riferimento verso l'esterno, non la chiave del dominio (regola 2).

## Errori contro avvisi

**Bloccano** l'import: formato non riconosciuto, id non presente nel listone,
id duplicato nell'intero file, prezzo sotto un credito, spesa oltre il budget,
composizione della rosa non valida per la modalità, numero di squadre diverso da
quello atteso.

**Non bloccano**, ma vengono segnalati: nome, ruolo, club o quotazione che nel
file differiscono dal listone. Sono i campi ridondanti, che servono a validare,
non a identificare.

### L'unico disallineamento previsto

`SPEC.md` §6.1 ne prevede uno solo: un id che sta nella rosa ma non nel listone,
perché il listone è più recente dell'export. Blocca l'import e il messaggio dice
il rimedio. Se l'id risulta fra i **ceduti** lo si dice esplicitamente, perché il
rimedio è diverso: lì il giocatore ha lasciato la Serie A dopo l'asta e va
rimosso o sostituito, non è un problema di versioni.

## Due formati, un solo importatore

| formato | contenuto |
|---|---|
| `rose.csv` | completo: squadra, nome, club, ruolo, ruoli Mantra, prezzo, quotazioni, id |
| `file_per_fantaleghe.csv` | minimale: squadra, id, prezzo, separati da righe `$,$,$` |

Entrambi finiscono nella stessa forma, così a valle non si sa da quale si è
partiti — e c'è un test che verifica che i due producano **le stesse identiche
rose**. Il formato si riconosce dal contenuto, non dal nome del file.

## I casi limite che vengono dai file veri

`CLAUDE.md` chiede di coprire i casi limite veri, non quelli immaginati. Questi
vengono dai due export reali in `/fixtures`, e ciascuno ha il suo test.

- **Si confrontano insiemi di ruoli, mai sequenze.** Fantalab riordina i ruoli
  Mantra in ordine canonico, il listone mette per primo il ruolo principale, e
  su **16 righe su 250** i due ordini differiscono pur descrivendo gli stessi
  ruoli. Confrontare le sequenze produrrebbe sedici avvisi falsi a ogni import.
- **Il formato minimale si spezza sugli ultimi due separatori, non sul primo.**
  Il nome della squadra non è quotato e contiene spazi e `&` (`Pulpone & Loris`).
  Spezzando sul primo separatore, una squadra con una virgola nel nome manderebbe
  tutto fuori posto senza che nessuno se ne accorga.
- **In Mantra si confronta la quotazione Mantra**, non quella classic: le due
  divergono su 142 giocatori su 533, e confrontare quella sbagliata produrrebbe
  decine di avvisi falsi.
- I file sono **CRLF, senza BOM e senza ritorno a capo finale**; i nomi hanno
  accenti (`Calò`, `Soulè`) e abbreviazioni per gli omonimi (`Martinez L.`,
  `Martinez Jo.`); il minimale può finire con una riga tronca `$,`.

Sui file reali l'import passa **senza un solo avviso**: è la conferma che il
join è esatto e che i confronti sono quelli giusti.

## Copertura dei moduli

`SPEC.md` §6.1 chiede di mostrarla subito dopo l'import, ed è l'informazione che
l'utente vuole vedere per prima. In `classic` le rose 3-8-8-6 coprono tutti e
sette i moduli senza adattamenti, sempre. In `mantra` la copertura è tipicamente
parziale, e si vede: sulle rose reali una squadra copre 2 schemi su 11 senza
adattamenti, un'altra tutti e 11.

## Struttura

```
src/csv.ts        lettore CSV minimale, con i numeri di riga per i messaggi
src/fantalab.ts   i due formati di export verso una forma sola
src/importa.ts    riconciliazione, validazioni, atomicità
src/ciclo.ts      il ciclo serale: mondo, schieramenti, scontri, classifica
src/cli.ts        riga di comando dell'import
src/cliCiclo.ts   riga di comando del ciclo
```

`/jobs` dipende da `/fanta` per le regole della modalità: la composizione della
rosa e la copertura dei moduli le decide la modalità, non l'importatore, ed è
per questo che ce n'è uno solo per entrambe.

## Il ciclo di gioco

`npm run ciclo` mette in fila le tre cose che succedono ogni sera: il mondo
simula una o più giornate, ogni squadra fanta schiera e prende i voti, gli
scontri diretti si risolvono e la classifica si aggiorna.

### Si sostituisce anche chi non prende voto

È il passaggio meno ovvio. Nel fantacalcio non si sostituisce solo
l'infortunato o lo squalificato: si sostituisce anche chi **non ha preso voto**,
perché non ha giocato abbastanza — ed è il caso di gran lunga più frequente.

I due casi si trattano allo stesso modo, con lo stesso algoritmo della milestone
2: si passano come indisponibili tutti quelli che non portano un voto, e le
regole della modalità fanno il resto. Non è servita una riga di codice dedicata.

### L'idempotenza è per costruzione

`SPEC.md` §9 chiede che rieseguire il job sulla stessa giornata non duplichi
niente. Qui non c'è nessuna guardia che controlla se la giornata è già stata
fatta — quella verrebbe aggirata al primo bug. L'esito di una giornata è una
**funzione pura** dello stato iniziale e del numero di giornata: rigiocarla
produce lo stesso identico risultato, e riscriverlo sovrascrive con gli stessi
valori.

È lo stesso motivo per cui il motore semina il generatore su
`(lega, stagione, giornata, partita)` invece di far scorrere uno stato casuale.
Due test lo verificano: rieseguire la stessa giornata dà lo stesso esito, e il
risultato della giornata 5 è identico sia partendo dalla 1 sia partendo dalla 5.

Per lo stesso motivo la classifica si **ricalcola** dai risultati, mai per
accumulo incrementale: una classifica accumulata si sporca al primo doppio
salvataggio, una ricalcolata è sempre la somma esatta di quello che è successo.

## Cosa manca

- I generatori AI, che vivranno qui (milestone 7).
- La scrittura su Supabase: oggi l'esito riuscito si può salvare come JSON con
  `--scrivi`, e basta. Le tabelle `imports` e `import_rows` di `SPEC.md` §9
  arriveranno col database.
- Il motore non distingue ancora i gol su rigore dai gol su azione e non produce
  autogol: i bonus relativi esistono e sono testati, ma restano a zero finché il
  motore non li genera. Quando lo farà, cambia solo `eventiDaPrestazione`.

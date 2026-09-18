# Istruzioni per Claude Code

Leggi `SPEC.md` prima di scrivere codice. Questo file contiene le regole di lavoro; la specifica contiene le decisioni di prodotto.

## Contesto

**FantaBlitz** — fantacalcio Mantra su un campionato di Serie A **interamente simulato**, giocato a ritmo accelerato (una o più giornate al giorno). Progetto privato, giocato da dieci amici, sviluppato interamente con Claude Code. Il proprietario conosce PHP e JavaScript ma non scriverà codice: spiega le scelte tecniche in modo comprensibile e non dare per scontata la familiarità con lo stack.

## Stack

- Next.js + TypeScript, Supabase (Postgres, Auth, Realtime), Vercel
- **Un solo linguaggio: TypeScript ovunque.** Non introdurre Python o altri runtime
- Struttura: `/engine` (motore puro), `/web` (Next.js), `/jobs` (ciclo, import, AI), `/seed` (dati iniziali), `/fixtures` (file reali per i test)

## File forniti

- `/seed/Quotazioni_Fantacalcio_Stagione_2026_27.xlsx` — listone ufficiale Mantra, fonte del seed. Struttura e regole di lettura in `SPEC.md` §5.1
- `/fixtures/rose.csv` — export Fantalab completo di una lega reale a 10 squadre
- `/fixtures/file_per_fantaleghe.csv` — export Fantalab minimale della stessa lega

Non sono esempi inventati: sono i file veri che l'app dovrà digerire. Ogni test dell'importatore parte da qui.

## Regole architetturali non negoziabili

1. **I nomi sono dati, mai codice.** Nomi di giocatori e squadre vivono solo nel database e nei file di seed. Nessuna logica deve dipendere da un nome specifico. Deve essere possibile sostituire l'intero database con nomi di fantasia cambiando solo il seed. Questo vincolo ha una ragione legale, non estetica: non negoziarlo.

2. **Niente immagini, loghi, maglie o foto** di club e calciatori reali. Solo testo e colori generici.

   Corollario pratico: i giocatori hanno un id interno; il `Fantacalcio_Id` è un **riferimento esterno** conservato a parte e usato solo per gli import. Non deve diventare la chiave primaria del dominio, altrimenti il vincolo del punto 1 salta.

3. **Il motore in `/engine` è puro e deterministico.** Nessun import da Next.js, da Supabase o dalla rete. Stesso seed e stesso input producono sempre lo stesso output. RNG esplicito passato come dipendenza: `Math.random()` è vietato dentro `/engine`.

4. **Interfacce sostituibili** per i tre pezzi destinati a cambiare: il motore partita (`simulaPartita`), la strategia di sostituzione Mantra (Basic ora, Easy e Master dopo), il provider AI. Progettali come contratti, non come implementazioni uniche.

5. **Le differenze tra fase 1 e fase 2 sono feature flag di lega**, mai codice mancante o commentato. L'elenco è in `SPEC.md`.

6. **Il job serale è idempotente.** Eseguirlo due volte sulla stessa giornata non deve duplicare partite, voti, testi o notifiche.

7. **Mondo simulato e livello fanta restano separati.** Voti e statistiche appartengono al mondo e sono uguali per tutti; bonus, malus e modificatori appartengono alla lega. Non mescolarli nelle stesse tabelle né nelle stesse funzioni.

8. **Nessuna monetizzazione**, nessun tracciamento pubblicitario, nessuna registrazione aperta. L'accesso è su invito.

9. **Pesi, coefficienti e soglie stanno in configurazione, mai nel codice.** Vale per la formula del voto statistico (`SPEC.md` §5.6), per i parametri del motore partita e per bonus e malus di lega. Sono numeri destinati a essere cambiati decine di volte in calibrazione: se richiedono un deploy, la calibrazione non si fa.

## Ordine di lavoro

Segui la roadmap di `SPEC.md`. In particolare: **il motore e la sua calibrazione vengono prima dell'interfaccia.** Prima che esista una sola schermata, deve esistere uno script che simula centinaia di stagioni e riporta media gol a partita, distribuzione dei voti, infortuni, cartellini e minuti giocati per squadra. Un campionato sbilanciato scoperto dopo tre settimane di gioco costa molto più di un giorno di taratura.

## Test attesi

- **Motore**: test di distribuzione sulle metriche calibrate, non solo unit test sulle funzioni
- **Mantra**: la matrice ruolo/slot/modulo e l'algoritmo di sostituzione vanno testati caso per caso, comprese le eccezioni del regolamento. È il punto dove ogni bug diventa una lite nella chat della lega
- **Import Fantalab**: usa i file di esempio reali come fixture. Copri i casi limite veri, non quelli immaginati
- **Soglie e fantavoto**: test sui valori di confine (65, 66, 71, 72, ...)

## Come lavorare

- Fai domande quando la specifica è ambigua, invece di scegliere in silenzio. Le decisioni di prodotto le prende il proprietario
- Proponi le alternative con i loro compromessi, poi consiglia
- Commit piccoli e messaggi chiari
- Aggiorna `SPEC.md` quando una decisione cambia: la specifica è la fonte di verità, non la cronologia della chat
- Non aggiungere dipendenze senza dirlo e senza motivarlo
- Non introdurre servizi a pagamento: il budget è sotto i 10 euro al mese, l'obiettivo è restare sui piani gratuiti

## Chiavi e segreti

Mai in chiaro nel codice o nei commit. Variabili d'ambiente, con un `.env.example` aggiornato.

# Handoff — continuare FantaBlitz in locale

Questo file serve a una sessione nuova di Claude Code (VS Code o terminale) per
riprendere il progetto senza rileggersi tutta la cronologia. È scritto per
essere letto per primo, dopo `CLAUDE.md` e `SPEC.md`.

**Ordine di lettura:** `CLAUDE.md` (le regole di lavoro) → `SPEC.md` (le
decisioni di prodotto, è la fonte di verità) → questo file (dove siamo).

---

## 1. Scaricare e avviare

```bash
git clone https://github.com/Difelice-e/fantablitz.git
cd fantablitz
npm install                 # Node 22.18 o superiore
npm test                    # 443 test, devono passare tutti
npm run typecheck
```

Non c'è un passo di build per i pacchetti TypeScript: si usa
`node --experimental-strip-types`, quindi niente `tsc` da lanciare e nessuna
dipendenza a runtime fuori da Next.js.

### Far girare una lega in locale, senza database

```bash
npm run crea-lega -- fixtures/rose.csv --nome "Lega degli amici"
npm run gioca -- lega-degli-amici --quante 3
npm run dev                 # il sito su localhost:3000
```

Lo stato finisce in `dati/leghe/*.json`, che è fuori da git. È l'implementazione
su file del contratto `Archivio`: serve a lavorare senza database, non è un
ripiego da buttare.

### Altri comandi

```bash
npm run seed                # rigenera seed/out/ dal listone .xlsx
npm run calibra             # tara il motore su N stagioni
npm run calibra -- --stagioni 30
npm run importa -- fixtures/rose.csv
```

---

## 2. Dove siamo

| Milestone | Stato |
|---|---|
| 0 — Seed dal listone | ✅ `/seed` |
| 1 — Motore + calibrazione | ✅ `/engine` |
| 2 — Schieramento classic e Mantra | ✅ `/fanta` |
| 3 — Import Fantalab | ✅ `/jobs` |
| 4 — Ciclo di gioco, fantavoto | ✅ `/jobs` + `/fanta` |
| 5 — Interfaccia | ✅ `/web` — **manca l'autenticazione** |
| 6 — Bot: valutazione e scambi | ⬜ |
| 7 — Strato AI | ⬜ |
| 8 — Fine stagione | ⬜ |

**Il lavoro in corso è l'autenticazione.** Il database è pronto, il codice del
sito no: oggi chiunque apra il sito può schierare per chiunque. In locale va
bene, in rete no.

---

## 3. Supabase — cosa è già fatto

Progetto **`FantaBlitz`**, ref `wkguodnqawalabhmqrpp`, regione `eu-west-1`,
Postgres 17.6, piano gratuito.

**Lo schema è già applicato**, con due migrazioni:

1. `schema_lega` — le quattro tabelle `leghe`, `squadre`, `rose`, `formazioni`,
   con RLS attiva su tutte e le policy.
2. `funzioni_in_schema_privato` — le tre funzioni di supporto spostate da
   `public` a uno schema `private`.

I sorgenti stanno in `supabase/migrazioni/`, con i nomi allineati uno a uno
alle migrazioni applicate: `list_migrations` sul connettore deve elencare
esattamente quelle. Vedi il README della cartella.

`get_advisors` per la sicurezza torna **pulito**, zero segnalazioni.

### Perché quattro tabelle e non un JSON

La tentazione, visto che lo stato è piccolo, era una riga per lega con tutto
dentro un `jsonb`. Sarebbe stato più corto e sbagliato: la sera prima di una
giornata schierano tutti insieme, e due che salvano nello stesso momento si
sovrascriverebbero. Per lo stesso motivo il contratto `Archivio` ha
`salvaFormazione` (tocca una riga sola) e `segnaGiornateGiocate` (scrive un
numero); `scrivi` serve solo a creare una lega.

La chiave primaria di `rose` è `(lega_id, giocatore_id)`: è **Postgres** a
garantire che lo stesso giocatore non stia in due rose.

### L'invito coincide con le squadre

`SPEC.md` regola 8: accesso su invito. Le policy RLS lasciano passare solo chi
ha una mail in `squadre.proprietario` di quella lega. Chi si autentica con una
mail non assegnata supera il login e **non vede niente**. Non c'è una tabella
degli invitati da tenere allineata, che sarebbe una seconda verità.

In scrittura si tocca solo la propria squadra e solo per una giornata non
ancora giocata.

### Le chiavi

Non sono nel repo e non devono finirci. Si prendono da
*Project Settings → API Keys*, oppure con il connettore Supabase
(`get_publishable_keys` per quella pubblica; la `service_role` solo dal
pannello). Vanno in un `.env` nella **radice** del progetto — vedi
`.env.example`, che spiega quale chiave è pubblica e quale no.

---

## 4. Vercel — cosa resta da fare

Team `difelicees-projects` (piano hobby), progetto `fantablitz`, collegato al
repo GitHub.

**Il deploy attuale non pubblica niente.** Risulta `READY` ma ha costruito
`main` prima che `/web` esistesse: i log dicono
*"Build Completed in /vercel/output [119ms]"*, nessun file caricato.

Da fare a mano nel pannello — il connettore Vercel è di sola lettura e non può
farlo:

1. **Settings → General → Root Directory: `web`**
   È la cosa che fa partire tutto. `web/vercel.json` (col cron serale) viene
   letto solo se la Root Directory è `web`: Vercel legge il `vercel.json` della
   Root Directory, uno nella radice del repo verrebbe ignorato.
2. **Settings → Environment Variables**, le quattro di `.env.example`:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`.
3. Rilanciare il deploy su `main` dopo aver unito il branch di lavoro.

### Una trappola già disinnescata

Il mondo simulato si legge a runtime con un percorso calcolato, e il
tracciamento dei file di Next non lo seguiva: il pacchetto pubblicato non
avrebbe contenuto `seed/out/mondo.json`, e il sito online avrebbe risposto
«file non trovato» a ogni pagina mentre in locale funzionava tutto.

Risolto in `web/next.config.ts` con `outputFileTracingRoot` e
`outputFileTracingIncludes`. **Verificato** nei manifest `.nft.json`: i sette
file di seed e configurazione ci sono. Se un domani le pagine online danno
ENOENT su un file di configurazione, si guarda lì.

---

## 5. Il prossimo pezzo: l'autenticazione

Il disegno è già deciso, manca il codice.

- **Link magico via email**, nessuna password (`SPEC.md` §9). Supabase Auth.
- Librerie già installate: `@supabase/ssr` e `@supabase/supabase-js` in `/web`.
- Serve un client Supabase per-richiesta che porti i cookie di sessione, così
  le policy RLS vedano la mail di chi sta chiedendo. Oggi
  `web/src/dati.ts` usa un archivio con la chiave di servizio, che **scavalca**
  la RLS: va bene per il job serale, non per le pagine.
- Serve un comando per assegnare le squadre: `squadre.proprietario` è la mail,
  e oggi è `null` ovunque. Senza, nessuno vede niente. L'abbinamento
  squadra → email lo fornisce il proprietario in locale, non va chiesto in chat.
- La pagina di schieramento deve permettere di schierare **solo** la propria
  squadra. La RLS lo impedisce già lato database, ma l'interfaccia non deve
  nemmeno proporlo.

---

## 6. Decisioni aperte

Sono in fondo a `SPEC.md` §11. Le due che contano adesso:

- **Le coppe non producono rotazione misurabile su una stagione.** Il
  meccanismo funziona ed è coperto da un test esatto, ma l'effetto non
  sopravvive a fine stagione, e triplicando `costoImpegnoEuropeo` va nella
  direzione opposta. È una domanda di calibrazione, non un test da riscrivere a
  tentativi.
- **Bot.** Nella prima lega saranno dieci umani, ma il proprietario vuole i bot
  **per i suoi test**. Nel modello il posto c'è già: `proprietario: null` su una
  squadra significa «non la gestisce nessuno». La milestone 6 si riduce quindi a
  valutazione + scambi fra utenti, più bot abbastanza buoni da fare da sparring.

---

## 7. Cose da sapere prima di toccare qualcosa

- **Il repo GitHub è pubblico.** Contiene `seed/out/mondo.json` coi nomi veri di
  533 giocatori e 20 club, il listone in `fixtures/`, e i nomi delle squadre
  degli amici. L'architettura rispetta la regola 1 — si sostituisce il seed e
  diventa tutto di fantasia — ma quella regola ha una ragione legale, e un repo
  pubblico pubblica comunque il file derivato. **Decisione del proprietario**,
  non toccata.
- **Non si modifica una migrazione già applicata**, se ne aggiunge un’altra. I
  file in `supabase/migrazioni/` corrispondono uno a uno a quelle sul database,
  e devono restare così.
- **Non esiste una copia dell'algoritmo di schieramento nel browser**, ed è
  deliberato: la matrice Mantra ha eccezioni che dipendono dal modulo, e una
  seconda copia divergerebbe. La schermata riceve dal server, casella per
  casella, chi può occuparla.
- **L'idempotenza non è una guardia.** L'esito di una giornata è una funzione
  pura del seme e delle formazioni salvate. Non aggiungere controlli del tipo
  «questa giornata è già stata fatta»: verrebbero aggirati al primo bug, e non
  servono.
- **Un bug già corretto, per non rifarlo:** quando a una squadra restavano meno
  di undici giocatori col voto, la disposizione si arrendeva in blocco e
  mandava in campo *zero* uomini invece di dieci. Ora `assegnazioneOttima`
  imbottisce la matrice con candidati fittizi. C'è un test che sorveglia
  l'intera stagione.

---

## 8. Struttura

```
/engine     motore di simulazione, puro e deterministico. Niente Math.random()
/fanta      livello di lega: moduli, schieramento, fantavoto, soglie
/jobs       import, ciclo serale, archivio (contratto + file + Supabase)
/web        Next.js: classifica, giornate, rosa, schieramento
/seed       lo script che converte il listone .xlsx, e il seed prodotto
/fixtures   i due export reali di Fantalab, usati come fixture nei test
/supabase   le migrazioni SQL
/dati       stato delle leghe in locale (fuori da git)
```

`/engine` e `/fanta` stanno sui due lati della regola 7: voti e statistiche
appartengono al mondo, schieramenti e malus alla lega. Ogni pacchetto ha il suo
`README.md`, che spiega le scelte non ovvie — vale la pena leggerli prima di
modificare.

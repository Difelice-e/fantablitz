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
| 5 — Interfaccia | ✅ `/web`, autenticazione compresa |
| 6 — Bot: valutazione e scambi | ⬜ |
| 7 — Strato AI | ⬜ |
| 8 — Fine stagione | ⬜ |

**L'autenticazione è in codice** (link magico, Supabase Auth, RLS): vedi §5
qui sotto per come funziona e §4 per i passi manuali che restano prima del
primo deploy vero.

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
2. **Settings → Environment Variables**, le cinque di `.env.example`:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `ADMIN_EMAIL` (la tua mail:
   è quella che vede la voce "Amministrazione" nel sito).
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

## 5. L'autenticazione, come funziona

Link magico via email, nessuna password (`SPEC.md` §9), su Supabase Auth.

- `web/proxy.ts` (si chiamava `middleware.ts` prima di Next 16, rinominato:
  vedi la trappola in §7) rinfresca la sessione a ogni richiesta e rimanda a
  `/login` chi non ha fatto login. `/api/gioca` è escluso dal matcher: si
  protegge da solo con `CRON_SECRET` e non ha un utente.
- `/login` manda il link magico (`web/app/login/`); `/auth/callback` lo
  riceve e scambia il codice per una sessione; `/auth/signout` esce.
- `web/src/supabase/server.ts` costruisce il client Supabase **della
  richiesta corrente**, coi cookie di sessione: le policy RLS vedono la mail
  di chi chiede, invece di essere scavalcate.
- `web/src/dati.ts` distingue due archivi: `archivioServizio` (chiave di
  servizio, solo per `/api/gioca`) e `archivioPerRichiesta()` (per-richiesta,
  usato da tutte le pagine e dalle azioni del sito). Confonderli riaprirebbe
  esattamente il buco che l'autenticazione doveva chiudere.
- Il salvataggio della formazione (`web/app/squadre/[id]/formazione/azioni.ts`)
  ora chiama `archivio.salvaFormazione` (una riga sola) invece di
  `archivio.scrivi` sull'intero stato: con l'archivio per-richiesta la RLS
  non concede scritture su `leghe`/`squadre`/`rose` a un utente autenticato,
  solo su `formazioni`.
- Chi apre la formazione di una squadra che non è la sua la vede in sola
  lettura: l'interfaccia non propone nemmeno i controlli di modifica, anche
  se la RLS li bloccherebbe comunque lato database. Se la squadra non ha
  proprietario il messaggio lo dice esplicitamente (è un bot, non "di un
  altro"), e un'etichetta BOT compare ovunque la squadra è nominata
  (classifica, giornate, rosa, formazione).

### L'amministrazione (`/admin`)

Creare una lega, importare le rose e assegnare le squadre sono ora schermate
del sito, non solo comandi da terminale (i comandi restano, per chi preferisce
lavorare da riga di comando o senza browser).

- `ADMIN_EMAIL` (una sola mail, in `.env`) decide chi vede la voce
  "Amministrazione" nel menu e può usare `/admin`. Non è per-lega: con dieci
  amici e una lega alla volta un ruolo per lega sarebbe over-engineering. La
  colonna `leghe.amministratore` nello schema Supabase resta inutilizzata,
  per quando (e se) servirà davvero un admin diverso per lega.
- `web/app/admin/` — form per creare una lega da un export Fantalab (CSV
  caricato dal browser, stesso parser della CLI) e l'elenco delle leghe
  esistenti.
- `web/app/admin/squadre/[legaId]/` — una riga per squadra con la mail del
  proprietario: vuota vuol dire bot. È l'invito (regola 8): senza
  un'assegnazione qui, quella mail non vede niente.
- Le azioni di `/admin` girano con `archivioServizio` (chiave di servizio),
  non con l'archivio della richiesta: sono operazioni di chi gestisce il
  sito, gated da `sonoAmministratore()` invece che dalla RLS — la RLS non
  concede comunque scritture su `leghe`/`squadre`/`rose` a un utente
  autenticato qualsiasi, quindi l'amministrazione non potrebbe funzionare
  sull'archivio per-richiesta nemmeno volendo.
- **Non testato in un browser vero in questa sessione:** l'estensione Chrome
  non era connessa. Verificato invece: build di produzione riuscita (il
  compilatore delle Server Actions di Next accetta i file), tipi corretti, e
  la stessa identica logica di importazione già provata con successo dalla
  CLI sullo stesso file (`fixtures/rose.csv`). La prima cosa da fare aprendo
  il sito è provare a creare una lega da `/admin` con un file vero.

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
- **Su Windows, `next dev`/`next build` con Turbopack non partivano affatto:**
  `web/next.config.ts` costruiva i percorsi con `new URL(...).pathname`, che
  su Windows dà `/C:/Utenti/...` — la barra davanti alla lettera del disco fa
  fallire la canonicalizzazione di Turbopack ("os error 123"). Corretto con
  `fileURLToPath` da `node:url`. Se il sito non parte più con un errore
  simile, si guarda lì prima che altrove.

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

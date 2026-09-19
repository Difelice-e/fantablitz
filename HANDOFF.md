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
| 6 — Bot: valutazione e scambi | 🚧 proposta/accettazione/rifiuto/ritiro e valutazione fatte; bot che propongono per primi no — vedi §6 |
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

## 4. Vercel — è online

Team `difelicees-projects` (piano hobby), progetto `fantablitz`, collegato al
repo GitHub. **Il sito è in produzione**: https://fantablitz.vercel.app
risponde, rimanda a `/login` chi non ha sessione, e `/api/gioca` è collegato
al vero database Supabase (verificato: risponde "nessuna lega in archivio",
corretto perché non ne è stata ancora creata una vera lì).

Root Directory (`web`) e le cinque variabili d'ambiente
(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `ADMIN_EMAIL`) sono impostate. Il
connettore Vercel **non è più di sola lettura** da quando il plugin è stato
installato per intero: le ha impostate lui, non serve più passare dal
pannello per questo.

**Il primo passo vero, ora**: aprire `/admin` con la mail in `ADMIN_EMAIL`,
creare la prima lega da un export Fantalab, e assegnare le squadre.

### Tre trappole di Vercel già disinnescate, non ovvie dal pannello

Il primo deploy con Root Directory impostata falliva tre volte di fila, ogni
volta con un errore diverso. Utile saperlo se un domani un altro progetto
Vercel su questo monorepo ripete lo stesso percorso:

1. **L'installazione delle dipendenze non vede il resto del monorepo.** Con
   Root Directory `web`, Vercel per default lancia `npm install` dentro
   `web/` come se fosse un progetto a se stante: non trova `typescript` e
   `@types/node`, che sono `devDependencies` della radice condivisi da tutti
   i workspace (`npm run build` falliva con *"It looks like you're trying to
   use TypeScript but do not have the required package(s) installed"*, pur
   avendo un `tsconfig.json` a posto). Risolto impostando l'**Install
   Command** su `cd .. && npm install`, cosi' l'installazione vede
   `package.json` alla radice e i suoi workspace.
2. **`sourceFilesOutsideRootDirectory: true`** va comunque tenuto attivo:
   senza, i file fuori da `web/` (`/engine`, `/fanta`, `/jobs`, `/seed`) non
   arriverebbero nel contenitore di build, e l'install command del punto 1
   non troverebbe nemmeno la radice da cui partire.
3. **Il campo "framework" del progetto era rimasto `null`** da quando il
   primo deploy (prima che `/web` esistesse) non aveva trovato niente da
   riconoscere. Con `framework: null`, Vercel esegue comunque `next build`
   ma poi si aspetta l'output di un sito statico in una cartella `public/`,
   e fallisce con *"No Output Directory named 'public' found"* anche se la
   build e' andata a buon fine. Risolto impostando `framework: "nextjs"` sul
   progetto: a quel punto Vercel confeziona l'output di Next.js per le
   funzioni serverless invece che aspettarsi file statici.

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

Mail e password su Supabase Auth (`SPEC.md` §9). **Non più link magico**: è
stato tolto, non solo affiancato — la decisione è stata "la password lo
sostituisce".

- `web/proxy.ts` (si chiamava `middleware.ts` prima di Next 16, rinominato:
  vedi la trappola in §7) rinfresca la sessione a ogni richiesta e rimanda a
  `/login` chi non ha fatto login. `/api/gioca` è escluso dal matcher: si
  protegge da solo con `CRON_SECRET` e non ha un utente.
- `/login` (`web/app/login/`) ha tre modalità sulla stessa pagina, scelte da
  `?modo=`: **accedi** (default), **registrati**, **reset**. Tre azioni
  distinte in `azioni.ts`: `accedi`, `registrati`, `richiediReset`.
- **La registrazione è aperta** (chiunque può creare un account): è
  l'evoluzione della regola 8 annotata in `SPEC.md` §1 — un account da solo
  non vede né tocca nessuna lega, serve comunque un invito.
- `/auth/callback` scambia il codice PKCE per una sessione — lo stesso
  meccanismo serve sia per confermare la mail di una registrazione sia per il
  link di reset password, distinti dal parametro `next` nell'URL di
  reindirizzamento. `/auth/nuova-password` è dove si sceglie la nuova
  password dopo un reset. `/auth/signout` esce.
- `web/src/supabase/server.ts` costruisce il client Supabase **della
  richiesta corrente**, coi cookie di sessione: le policy RLS vedono la mail
  di chi chiede, invece di essere scavalcate.
- `web/src/dati.ts` distingue due archivi: `archivioServizio` (chiave di
  servizio, per `/api/gioca` e per l'amministrazione) e
  `archivioPerRichiesta()` (per-richiesta, usato dalle pagine e dalle azioni
  che un giocatore normale può toccare). Confonderli riaprirebbe esattamente
  il buco che l'autenticazione doveva chiudere.
- Il salvataggio della formazione (`web/app/squadre/[id]/formazione/azioni.ts`)
  chiama `archivio.salvaFormazione` (una riga sola) invece di `archivio.scrivi`
  sull'intero stato: con l'archivio per-richiesta la RLS non concede
  scritture su `leghe`/`squadre`/`rose` a un utente autenticato, solo su
  `formazioni`.
- Chi apre la formazione di una squadra che non è la sua la vede in sola
  lettura: l'interfaccia non propone nemmeno i controlli di modifica, anche
  se la RLS li bloccherebbe comunque lato database. Se la squadra non ha
  proprietario il messaggio lo dice esplicitamente (è un bot, non "di un
  altro"), e un'etichetta BOT compare ovunque la squadra è nominata
  (classifica, giornate, rosa, formazione).

### L'amministrazione (`/admin`) e l'ingresso autonomo (`/entra`)

Creare una lega, importare le rose e assegnare le squadre sono schermate del
sito, non solo comandi da terminale (i comandi restano, per chi preferisce
lavorare da riga di comando o senza browser). C'è anche un secondo modo di
entrare in una squadra, in stile Fantaleghe: nome lega + parola d'ordine,
scelta autonoma fra le squadre libere.

- **Due livelli di amministrazione**, in `web/src/admin.ts`:
  `sonoAmministratore()` è globale (`ADMIN_EMAIL`, una sola mail: oggi è
  l'unica che può creare leghe). `amministraLega(stato)` è per lega
  (`leghe.amministratore`, popolato alla creazione con la mail di chi l'ha
  creata): può assegnarne le squadre e impostarne la parola d'ordine.
  `ADMIN_EMAIL` passa comunque entrambi i controlli, su qualunque lega.
  Oggi coincidono sempre — solo lui crea leghe — ma il secondo è già pronto
  per quando altri potranno creare le proprie.
- `web/app/admin/` — form per creare una lega da un export Fantalab (CSV
  caricato dal browser, stesso parser della CLI) e l'elenco delle leghe.
- `web/app/admin/squadre/[legaId]/` — una riga per squadra con la mail del
  proprietario (vuota vuol dire bot), e un campo per impostare la parola
  d'ordine della lega.
- **La parola d'ordine non passa mai dall'archivio generico.** Vive solo in
  Supabase (`leghe.parola_ordine_hash`, mai in chiaro — hash bcrypt via
  pgcrypto, `imposta_parola_lega`), perché è un meccanismo specifico di RLS,
  non uno stato "deciso da una persona" nel senso del contratto `Archivio`.
  Impostarla richiede la chiave di servizio (`clientServizio()` in
  `web/src/dati.ts`): nessun'altra chiave ha i permessi.
- `web/app/entra/` — chi conosce nome lega e parola d'ordine vede le squadre
  libere di quella lega (`squadre_libere`) e ne sceglie una
  (`rivendica_squadra`). Le due funzioni sono `security definer` in
  `public` (non `private`): a differenza delle funzioni di supporto delle
  policy RLS, il sito le deve chiamare via RPC per conto di un utente
  autenticato che non è ancora entrato in nessuna lega — per questo *devono*
  stare in `public`, dove PostgREST le espone. Restano fuori portata di
  `anon`: **due migrazioni** sono servite a toglierne l'accesso davvero
  (revocare da `PUBLIC` non basta: Supabase concede l'esecuzione ai ruoli
  `anon`/`authenticated` direttamente, non allo pseudo-ruolo `PUBLIC` — vedi
  `supabase/migrazioni/20260919010326_...`).
- **Testato end-to-end senza browser** (l'estensione Chrome non era
  connessa): un utente vero registrato via API, confermato con la chiave di
  servizio, autenticato, e usato per chiamare `squadre_libere` e
  `rivendica_squadra` direttamente contro Supabase — password sbagliata
  vuota, `anon` negato, password giusta trova la squadra libera e la
  assegna, e dopo la RLS normale (`e_della_lega`) la lascia vedere la lega.
  **Non testato**: il form `/entra` e il form di creazione lega/imposta
  password in un browser vero — build di produzione riuscita, tipi corretti,
  logica identica a quella già provata da terminale o via API.

---

## 6. Scambi e valutazione bot, come funzionano

`SPEC.md` §6.5 e §7.1. Sta in `/jobs` (`valutazione.ts`, `scambi.ts`) e non in
`/fanta`, deliberatamente: valutare un giocatore serve sia il prezzo pagato
all'asta (dato di lega) sia come si è comportato nel mondo simulato (dato di
mondo), e `/fanta` non deve poter guardare il secondo (regola 7).

- **Il ciclo di vita** è in `StatoLega.scambi`: `proposto` → `accettato` /
  `rifiutato` / `ritirato`. Verso una squadra con un proprietario umano resta
  `proposto` finché non risponde lui; verso un bot si valuta e si risolve
  nello stesso momento — un bot non ha una sera in cui pensarci.
- **Il valore di un giocatore** è la quota del budget della sua squadra
  (`valoreGiocatore` in `valutazione.ts`): parte dal prezzo pagato all'asta e
  si sposta verso la resa osservata in campo (media del **voto** del mondo
  simulato, non il fantavoto: è il dato uniforme per tutte le leghe) con una
  rampa lineare sulle giornate giocate (`giornateAllaPienaFiducia` in
  `fanta/config/scambi.json`). Tutte le squadre partono con lo stesso budget,
  quindi la quota è già confrontabile fra squadre diverse senza un'altra
  conversione in crediti assoluti — è la "percentuale sul budget circolante"
  che chiede SPEC 7.1, solo espressa in un'unità più comoda. C'è anche una
  correzione di scarsità sul ruolo Mantra più raro fra quelli del giocatore.
- **Le regole anti-exploit valgono solo se una delle due squadre è un bot** —
  decisione esplicita del proprietario: fra due persone uno scambio passa
  sempre, è una loro scelta. Per un bot: rumore di valutazione e margine
  richiesto dipendono dalla sua **personalità**, seminata su (seme di lega,
  squadra) e quindi stabile per tutta la stagione, non su un orologio; sotto
  la soglia di rifiuto automatico (`sogliaRifiutoAutomatico`) nessun rumore
  può far accettare un'offerta palesemente sbilanciata; oltre il tetto
  stagionale (`tettoScambiPerStagione`) il bot rifiuta senza nemmeno valutare.
- `web/app/squadre/[id]/scambi/` — propone (checkbox sui propri giocatori e su
  quelli della controparte scelta), risponde alle proposte ricevute, ritira le
  proprie in attesa, mostra lo storico. Le scritture passano da
  `archivioServizio` (chiave di servizio), non dall'archivio della richiesta:
  uno scambio accettato tocca le rose di *due* squadre, e la RLS su `rose` non
  lascia scrivere niente dal sito nemmeno per la propria — solo il job e
  l'amministrazione hanno quella chiave. L'autorizzazione ("è davvero la tua
  squadra?") si controlla in TypeScript, come per l'amministrazione di lega.
- Tabella `scambi` su Supabase: solo lettura via RLS (`e_della_lega`, come
  formazioni e rose), nessuna policy di scrittura — stessa scelta di
  `leghe`/`squadre`/`rose`.
- **Non implementato**: correzione di valore per buchi in rosa e crediti
  residui (SPEC 7.1 punto 3, parte restante — i crediti residui non hanno un
  uso reale finché il mercato intra-stagione resta chiuso), bot che propongono
  scambi per primi (oggi rispondono soltanto), il livello sociale di SPEC 7.2.
- **Non testato in un browser reale** (l'estensione Chrome non era connessa
  in questa sessione): build di produzione riuscita, tipi corretti, e la
  logica di dominio (`valutazione.ts`, `scambi.ts`) provata a fondo in
  `jobs/test/` con le rose reali di `/fixtures` — non la schermata.

---

## 7. Decisioni aperte

Sono in fondo a `SPEC.md` §11. Quelle che contano adesso:

- **Le coppe non producono rotazione misurabile su una stagione.** Il
  meccanismo funziona ed è coperto da un test esatto, ma l'effetto non
  sopravvive a fine stagione, e triplicando `costoImpegnoEuropeo` va nella
  direzione opposta. È una domanda di calibrazione, non un test da riscrivere a
  tentativi.
- **Anti-exploit degli scambi solo sui bot.** Decisione del proprietario: da
  rivedere se in una stagione vera emergessero scambi concordati fra amici per
  favorire una squadra a scapito della lega.
- **Taratura di `fanta/config/scambi.json`.** Valori di partenza plausibili,
  non ancora provati su una stagione giocata da persone vere.

---

## 8. Cose da sapere prima di toccare qualcosa

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

## 9. Struttura

```
/engine     motore di simulazione, puro e deterministico. Niente Math.random()
/fanta      livello di lega: moduli, schieramento, fantavoto, soglie
/jobs       import, ciclo serale, scambi e valutazione bot, archivio (contratto + file + Supabase)
/web        Next.js: classifica, giornate, rosa, schieramento, scambi
/seed       lo script che converte il listone .xlsx, e il seed prodotto
/fixtures   i due export reali di Fantalab, usati come fixture nei test
/supabase   le migrazioni SQL
/dati       stato delle leghe in locale (fuori da git)
```

`/engine` e `/fanta` stanno sui due lati della regola 7: voti e statistiche
appartengono al mondo, schieramenti e malus alla lega. Ogni pacchetto ha il suo
`README.md`, che spiega le scelte non ovvie — vale la pena leggerli prima di
modificare.

-- FantaBlitz — la cache di vistaStagione va compressa.
--
-- Scoperto verificando la scrittura per davvero (non solo a typecheck):
-- `vista.mondo.partite` contiene tutte le partite dell'**intera** stagione
-- fin dall'inizio, non solo quelle delle giornate gia' giocate — il mondo
-- simulato e' una funzione pura del seme (regola 3), quindi la giornata 38
-- e' gia' "successa" nei dati anche se in lega ne sono state giocate zero.
-- Il risultato e' un JSON sui 9-10 MB anche per una lega appena creata, e la
-- scrittura in `jsonb` cosi' com'era va in timeout lato Postgres.
--
-- Compresso (gzip) e passato come testo (base64, non `bytea`: PostgREST
-- complica inutilmente la via binaria per un guadagno che qui non serve) il
-- payload scende sotto il MB. La colonna cambia da `jsonb` a `text`: chi
-- scrive e legge (jobs/src/archivioSupabase.ts) comprime e decomprime, il
-- contratto `Archivio` (jobs/src/archivio.ts) continua a parlare di
-- `EsitoCiclo` come prima — la compressione e' un dettaglio di questa sola
-- implementazione, non del contratto.

alter table public.cache_stagione alter column dati type text using dati::text;

-- FantaBlitz — cache del ricalcolo della stagione.
--
-- Non e' una terza eccezione a "si salva solo quello che ha deciso una
-- persona" (schema_lega.sql): e' l'eccezione gia' dichiarata per cronache ed
-- editoriali, vista da un'altra angolazione. Quello che sta qui e' sempre
-- ricostruibile identico da zero rigiocando seme e formazioni (vistaStagione,
-- jobs/src/lega.ts) — non diventa mai l'unica copia di un fatto, e se la riga
-- manca o non corrisponde piu' a `giornate_giocate`, chi legge ricalcola dal
-- vivo esattamente come farebbe senza questa tabella.
--
-- Perche' serve comunque: `vistaStagione` rigioca l'intera storia della lega
-- (SPEC 6: idempotenza vista dal lato del contatore), e su Vercel una cache
-- solo in memoria di processo non basta — ogni richiesta puo' capitare su
-- un'istanza fredda diversa. Il job che gioca una giornata (cron, pulsante
-- admin, CLI: un solo percorso, jobs/src/cicloGiornaliero.ts) calcola gia'
-- questo risultato per conto suo; scriverlo qui vuol dire pagarne il costo
-- una volta per giornata giocata, non una volta per ogni visita al sito.
--
-- Una riga sola per lega, sempre sovrascritta: non e' una storia che cresce,
-- e' l'ultimo risultato calcolato.

create table if not exists public.cache_stagione (
  lega_id           text primary key references public.leghe(id) on delete cascade,
  giornate_giocate  integer not null,
  dati              jsonb not null,
  aggiornata_il     timestamptz not null default now()
);

alter table public.cache_stagione enable row level security;

-- Nessuna policy: si legge e si scrive solo con la chiave di servizio (il job
-- che gioca le giornate, e la lettura in web/src/dati.ts), mai dal sito con
-- la sessione di una persona — e' un dettaglio implementativo, non un dato
-- della lega. Senza policy, RLS blocca tutto il resto (stesso principio di
-- leghe/squadre/rose in schema_lega.sql).

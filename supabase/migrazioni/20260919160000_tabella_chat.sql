-- Chat dei bot (SPEC 7.2, 8): reazioni a eventi scatenanti, mai libere.
--
-- Sola lettura via RLS come cronache ed editoriali: scrive solo il job
-- serale, con la chiave di servizio. A differenza di editoriali (uno per
-- giornata) e cronache (una per partita), qui in una giornata possono
-- convivere piu' righe: bot diversi, o lo stesso bot per eventi diversi.

create table if not exists public.chat (
  lega_id      text not null,
  id           text not null,
  giornata     integer not null check (giornata >= 1),
  squadra_id   text not null,
  evento       text not null check (evento in ('sconfittaPesante', 'scambioRifiutato', 'colpoDiMercato')),
  -- L'id dello scambio quando l'evento e' uno scambio: evita di far reagire
  -- un bot due volte allo stesso episodio. Null per una sconfitta.
  riferimento  text,
  testo        text not null,
  fonte        text not null check (fonte in ('ai', 'template')),
  generato_il  timestamptz not null default now(),
  primary key (lega_id, id),
  foreign key (lega_id, squadra_id) references public.squadre(lega_id, id) on delete cascade
);

create index if not exists chat_per_giornata on public.chat (lega_id, giornata);

alter table public.chat enable row level security;

drop policy if exists "chat: quella della propria lega" on public.chat;
create policy "chat: quella della propria lega"
  on public.chat for select to authenticated
  using (private.e_della_lega(lega_id));

-- Nessuna policy di scrittura: come le altre tabelle derivate, scrive solo
-- il job serale con la chiave di servizio.

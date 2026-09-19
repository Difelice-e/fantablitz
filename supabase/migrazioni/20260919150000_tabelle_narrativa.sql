-- Cronache ed editoriali (SPEC 8).
--
-- Non sono una funzione pura dei risultati come la classifica: generarle
-- costa una chiamata a un provider esterno, e SPEC 8 chiede esplicitamente
-- che si salvino, mai che si rigenerino al caricamento della pagina. Sola
-- lettura via RLS come formazioni e rose: le scrive solo il job serale, con
-- la chiave di servizio.

create table if not exists public.cronache (
  lega_id    text not null,
  giornata   integer not null check (giornata >= 1),
  casa_id    text not null,
  ospite_id  text not null,
  testo      text not null,
  fonte      text not null check (fonte in ('ai', 'template')),
  generata_il timestamptz not null default now(),
  primary key (lega_id, giornata, casa_id, ospite_id),
  foreign key (lega_id) references public.leghe(id) on delete cascade
);

create table if not exists public.editoriali (
  lega_id     text not null,
  giornata    integer not null check (giornata >= 1),
  testo       text not null,
  fonte       text not null check (fonte in ('ai', 'template')),
  generata_il timestamptz not null default now(),
  primary key (lega_id, giornata),
  foreign key (lega_id) references public.leghe(id) on delete cascade
);

alter table public.cronache   enable row level security;
alter table public.editoriali enable row level security;

drop policy if exists "cronache: quelle della propria lega" on public.cronache;
create policy "cronache: quelle della propria lega"
  on public.cronache for select to authenticated
  using (private.e_della_lega(lega_id));

drop policy if exists "editoriali: quelli della propria lega" on public.editoriali;
create policy "editoriali: quelli della propria lega"
  on public.editoriali for select to authenticated
  using (private.e_della_lega(lega_id));

-- Nessuna policy di scrittura: come leghe, squadre, rose e scambi, scrive
-- solo il job serale con la chiave di servizio.

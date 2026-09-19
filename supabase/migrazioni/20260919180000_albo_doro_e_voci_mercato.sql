-- Albo d'oro e voci di mercato (SPEC 5.8, 8).
--
-- Sola lettura via RLS come cronache, editoriali e chat: scrive solo il job
-- serale con la chiave di servizio, alla chiusura di una stagione.
--
-- L'albo d'oro non si ricalcola mai: e' il verdetto di una stagione chiusa,
-- e deve restare quello anche se in futuro cambiasse la formula del
-- fantavoto o si correggesse un bug. Le voci di mercato invece si possono
-- rigenerare (una per stagione), come editoriali e cronache.

create table if not exists public.albo_doro (
  lega_id               text not null,
  stagione              integer not null check (stagione >= 1),
  campione_squadra_id   text not null,
  punti_campione        integer not null,
  fantapunti_campione   numeric not null,
  chiusa_il             timestamptz not null default now(),
  primary key (lega_id, stagione),
  foreign key (lega_id, campione_squadra_id) references public.squadre(lega_id, id) on delete cascade
);

create table if not exists public.voci_mercato (
  lega_id      text not null,
  stagione     integer not null check (stagione >= 1),
  testo        text not null,
  fonte        text not null check (fonte in ('ai', 'template')),
  generato_il  timestamptz not null default now(),
  primary key (lega_id, stagione),
  foreign key (lega_id) references public.leghe(id) on delete cascade
);

alter table public.albo_doro    enable row level security;
alter table public.voci_mercato enable row level security;

drop policy if exists "albo d'oro: quello della propria lega" on public.albo_doro;
create policy "albo d'oro: quello della propria lega"
  on public.albo_doro for select to authenticated
  using (private.e_della_lega(lega_id));

drop policy if exists "voci di mercato: quelle della propria lega" on public.voci_mercato;
create policy "voci di mercato: quelle della propria lega"
  on public.voci_mercato for select to authenticated
  using (private.e_della_lega(lega_id));

-- Nessuna policy di scrittura: come le altre tabelle derivate, scrive solo
-- il job serale con la chiave di servizio.

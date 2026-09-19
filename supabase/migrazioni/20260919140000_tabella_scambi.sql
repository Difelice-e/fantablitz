-- Scambi fra squadre (SPEC 6.5).
--
-- Le scritture non passano da una policy RLS come formazioni: proporre e
-- risolvere uno scambio richiede di valutare un bot (jobs/src/valutazione.ts)
-- e, se accettato, di toccare le rose di *due* squadre insieme, che una
-- policy scritta per "tocchi solo la tua riga" non esprime bene. Restano sul
-- percorso gia' in uso per amministrazione e parola d'ordine: azione server
-- con la chiave di servizio, autorizzazione controllata in TypeScript
-- confrontando la mail di sessione con `squadre.proprietario`.
--
-- In lettura invece lo scambio e' storia di lega come formazioni e rose: chi
-- c'e' dentro vede tutto.

create table if not exists public.scambi (
  lega_id        text not null,
  id             text not null,
  da_squadra_id  text not null,
  a_squadra_id   text not null,
  offerti        text[] not null,
  richiesti      text[] not null,
  stato          text not null check (stato in ('proposto', 'accettato', 'rifiutato', 'ritirato')),
  motivo         text,
  creato_il      timestamptz not null default now(),
  risolto_il     timestamptz,
  primary key (lega_id, id),
  foreign key (lega_id, da_squadra_id) references public.squadre(lega_id, id) on delete cascade,
  foreign key (lega_id, a_squadra_id) references public.squadre(lega_id, id) on delete cascade,
  check (da_squadra_id <> a_squadra_id)
);

create index if not exists scambi_per_squadra_da on public.scambi (lega_id, da_squadra_id);
create index if not exists scambi_per_squadra_a on public.scambi (lega_id, a_squadra_id);

alter table public.scambi enable row level security;

drop policy if exists "scambi: quelli della propria lega" on public.scambi;
create policy "scambi: quelli della propria lega"
  on public.scambi for select to authenticated
  using (private.e_della_lega(lega_id));

-- Nessuna policy di scrittura: come leghe, squadre e rose, si scrive solo con
-- la chiave di servizio, dopo un controllo di autorizzazione in TypeScript.

-- FantaBlitz — schema della lega.
--
-- Si salva solo quello che ha deciso una persona: configurazione, rose,
-- formazioni schierate e quante giornate si sono giocate. Voti, risultati e
-- classifica non hanno una tabella, e non e' una dimenticanza: sono una
-- funzione pura del seme del mondo e delle formazioni, e si ricalcolano. Uno
-- stato che si puo' solo ricalcolare non puo' andare fuori sincrono con quello
-- che e' successo.
--
-- L'accesso e' su invito (regola 8), e l'invito coincide con le squadre:
-- entra solo chi ha una mail associata a una squadra. Non c'e' una tabella
-- degli invitati da tenere allineata, perche' sarebbe una seconda verita'.

/* ------------------------------------------------------------------ */
/* Tabelle                                                             */
/* ------------------------------------------------------------------ */

create table if not exists public.leghe (
  id                text primary key,
  nome              text not null,
  -- Decide il mondo simulato e il calendario: due leghe con semi diversi
  -- vedono campionati diversi.
  seme              text not null,
  modalita          text not null check (modalita in ('classic', 'mantra')),
  budget            integer not null check (budget > 0),
  giornate_giocate  integer not null default 0 check (giornate_giocate >= 0),
  -- Chi puo' far girare il job e assegnare le squadre.
  amministratore    text,
  creata_il         timestamptz not null default now()
);

create table if not exists public.squadre (
  lega_id       text not null references public.leghe(id) on delete cascade,
  id            text not null,
  nome          text not null,
  -- La mail di chi la gestisce. NULL = bot: nessuno la schiera a mano, e
  -- l'adattamento automatico fa tutto.
  proprietario  text,
  primary key (lega_id, id)
);

-- Un indirizzo non puo' gestire due squadre nella stessa lega.
create unique index if not exists squadre_un_proprietario_per_lega
  on public.squadre (lega_id, proprietario)
  where proprietario is not null;

create table if not exists public.rose (
  lega_id       text not null,
  squadra_id    text not null,
  giocatore_id  text not null,
  prezzo        integer not null check (prezzo >= 1),
  -- La chiave primaria e' (lega, giocatore), non (lega, squadra, giocatore):
  -- cosi' e' il database a garantire che lo stesso giocatore non possa stare
  -- in due rose. E' l'invariante che rende sensata una lega, ed e' meglio che
  -- la tenga Postgres invece del codice applicativo.
  primary key (lega_id, giocatore_id),
  foreign key (lega_id, squadra_id) references public.squadre(lega_id, id) on delete cascade
);

create index if not exists rose_per_squadra on public.rose (lega_id, squadra_id);

create table if not exists public.formazioni (
  lega_id        text not null,
  squadra_id     text not null,
  giornata       integer not null check (giornata >= 1),
  modulo         text not null,
  -- Coppie [slot, giocatoreId]. Il dominio usa una mappa, il JSON no.
  titolari       jsonb not null,
  -- Ordine di priorita' d'ingresso: il primo entra per primo.
  panchina       jsonb not null,
  aggiornata_il  timestamptz not null default now(),
  primary key (lega_id, squadra_id, giornata),
  foreign key (lega_id, squadra_id) references public.squadre(lega_id, id) on delete cascade
);

/* ------------------------------------------------------------------ */
/* Chi sei                                                             */
/* ------------------------------------------------------------------ */

-- `security definer` perche' queste funzioni leggono `squadre`, che ha le sue
-- policy: senza, la policy di `squadre` chiamerebbe una funzione che rilegge
-- `squadre`, e si avvita.
create or replace function public.e_della_lega(lega text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.squadre s
    where s.lega_id = lega
      and s.proprietario = (select auth.jwt() ->> 'email')
  );
$$;

create or replace function public.e_proprietario(lega text, squadra text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.squadre s
    where s.lega_id = lega
      and s.id = squadra
      and s.proprietario = (select auth.jwt() ->> 'email')
  );
$$;

-- Una giornata gia' giocata non si tocca: il suo risultato l'hanno gia' letto
-- tutti, e poterla cambiare vorrebbe dire riscrivere il passato.
create or replace function public.giornata_ancora_aperta(lega text, g integer)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select g > coalesce((select l.giornate_giocate from public.leghe l where l.id = lega), 0);
$$;

/* ------------------------------------------------------------------ */
/* Regole di accesso                                                   */
/* ------------------------------------------------------------------ */

alter table public.leghe      enable row level security;
alter table public.squadre    enable row level security;
alter table public.rose       enable row level security;
alter table public.formazioni enable row level security;

-- In lettura, chi e' nella lega vede tutta la lega: rose e formazioni degli
-- altri comprese. E' un fantacalcio fra dieci amici, non c'e' niente da
-- nascondere e vedere la rosa degli avversari fa parte del gioco.
drop policy if exists "leghe: le proprie" on public.leghe;
create policy "leghe: le proprie"
  on public.leghe for select to authenticated
  using (public.e_della_lega(id));

drop policy if exists "squadre: quelle della propria lega" on public.squadre;
create policy "squadre: quelle della propria lega"
  on public.squadre for select to authenticated
  using (public.e_della_lega(lega_id));

drop policy if exists "rose: quelle della propria lega" on public.rose;
create policy "rose: quelle della propria lega"
  on public.rose for select to authenticated
  using (public.e_della_lega(lega_id));

drop policy if exists "formazioni: quelle della propria lega" on public.formazioni;
create policy "formazioni: quelle della propria lega"
  on public.formazioni for select to authenticated
  using (public.e_della_lega(lega_id));

-- In scrittura si tocca solo la propria squadra, e solo in avanti.
drop policy if exists "formazioni: schiera la propria" on public.formazioni;
create policy "formazioni: schiera la propria"
  on public.formazioni for insert to authenticated
  with check (
    public.e_proprietario(lega_id, squadra_id)
    and public.giornata_ancora_aperta(lega_id, giornata)
  );

drop policy if exists "formazioni: cambia la propria" on public.formazioni;
create policy "formazioni: cambia la propria"
  on public.formazioni for update to authenticated
  using (
    public.e_proprietario(lega_id, squadra_id)
    and public.giornata_ancora_aperta(lega_id, giornata)
  )
  with check (
    public.e_proprietario(lega_id, squadra_id)
    and public.giornata_ancora_aperta(lega_id, giornata)
  );

-- Nessuno puo' scrivere leghe, squadre e rose dal sito: le crea l'import e le
-- aggiorna il job serale, che usano la chiave di servizio e scavalcano queste
-- regole. Non serve una policy per negare: senza policy, non si passa.

/* ------------------------------------------------------------------ */
/* Chi non e' invitato non esiste                                      */
/* ------------------------------------------------------------------ */

-- Chi si autentica con una mail che non e' associata a nessuna squadra supera
-- il login ma non vede niente: nessuna policy lo lascia passare. L'invito e'
-- l'assegnazione della squadra, e non c'e' un elenco separato da tenere
-- allineato.

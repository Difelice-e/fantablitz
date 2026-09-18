-- Le funzioni di supporto escono da `public`.
--
-- Stando in `public`, PostgREST le pubblicava come endpoint /rest/v1/rpc/... e
-- chiunque poteva chiamarle: `giornata_ancora_aperta` avrebbe detto a un
-- anonimo a che giornata era arrivata una lega, e le altre due erano una sonda
-- per indovinare chi c'e' dentro. Lo segnalava l'analizzatore di sicurezza di
-- Supabase, con due avvisi su tre funzioni ciascuno.
--
-- Non basta revocare EXECUTE ad `authenticated`: le policy RLS vengono valutate
-- coi privilegi di chi interroga, quindi senza EXECUTE smetterebbero di
-- funzionare. La soluzione giusta e' uno schema che PostgREST non espone.

create schema if not exists private;

-- Prima le policy, che dipendono dalle funzioni, poi le funzioni: al contrario
-- Postgres rifiuta con "cannot drop function ... because other objects depend".
drop policy if exists "leghe: le proprie" on public.leghe;
drop policy if exists "squadre: quelle della propria lega" on public.squadre;
drop policy if exists "rose: quelle della propria lega" on public.rose;
drop policy if exists "formazioni: quelle della propria lega" on public.formazioni;
drop policy if exists "formazioni: schiera la propria" on public.formazioni;
drop policy if exists "formazioni: cambia la propria" on public.formazioni;

drop function if exists public.e_della_lega(text);
drop function if exists public.e_proprietario(text, text);
drop function if exists public.giornata_ancora_aperta(text, integer);

create or replace function private.e_della_lega(lega text)
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

create or replace function private.e_proprietario(lega text, squadra text)
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

create or replace function private.giornata_ancora_aperta(lega text, g integer)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select g > coalesce((select l.giornate_giocate from public.leghe l where l.id = lega), 0);
$$;

-- Le policy le chiamano per conto di chi interroga, quindi l'esecuzione serve.
grant usage on schema private to authenticated;
grant execute on function private.e_della_lega(text) to authenticated;
grant execute on function private.e_proprietario(text, text) to authenticated;
grant execute on function private.giornata_ancora_aperta(text, integer) to authenticated;

-- Agli anonimi no, in nessun caso.
revoke all on schema private from anon;

create policy "leghe: le proprie"
  on public.leghe for select to authenticated
  using (private.e_della_lega(id));

create policy "squadre: quelle della propria lega"
  on public.squadre for select to authenticated
  using (private.e_della_lega(lega_id));

create policy "rose: quelle della propria lega"
  on public.rose for select to authenticated
  using (private.e_della_lega(lega_id));

create policy "formazioni: quelle della propria lega"
  on public.formazioni for select to authenticated
  using (private.e_della_lega(lega_id));

create policy "formazioni: schiera la propria"
  on public.formazioni for insert to authenticated
  with check (
    private.e_proprietario(lega_id, squadra_id)
    and private.giornata_ancora_aperta(lega_id, giornata)
  );

create policy "formazioni: cambia la propria"
  on public.formazioni for update to authenticated
  using (
    private.e_proprietario(lega_id, squadra_id)
    and private.giornata_ancora_aperta(lega_id, giornata)
  )
  with check (
    private.e_proprietario(lega_id, squadra_id)
    and private.giornata_ancora_aperta(lega_id, giornata)
  );

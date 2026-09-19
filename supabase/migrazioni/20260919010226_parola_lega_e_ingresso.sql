-- FantaBlitz — parola d'ordine di lega e ingresso per nome lega + password.
--
-- Il nome della lega diventa una chiave di ricerca (chi entra la digita a
-- mano), quindi deve essere univoco: due leghe con lo stesso nome
-- renderebbero ambigua la ricerca.
--
-- La parola d'ordine si salva come hash (pgcrypto, bcrypt), mai in chiaro.
-- La verifica e la scelta della squadra girano in funzioni `security
-- definer` in `public`, non `private`: a differenza delle funzioni di
-- supporto delle policy RLS (che le chiama solo Postgres durante una query),
-- queste le deve poter chiamare il sito via RPC, per conto di chi ha un
-- account ma non e' ancora entrato in nessuna lega. Restano fuori portata
-- di `anon`: l'accesso e' limitato ad `authenticated` (vedi pero' la
-- migrazione successiva: qui la revoca non basta).

alter table public.leghe add column if not exists parola_ordine_hash text;

create unique index if not exists leghe_nome_univoco on public.leghe (lower(nome));

/* ------------------------------------------------------------------ */
/* Impostare la parola d'ordine: solo l'amministrazione, con la chiave */
/* di servizio. I permessi qui sotto non contano per chi la chiama.    */
/* ------------------------------------------------------------------ */

create or replace function public.imposta_parola_lega(lega_id text, parola text)
returns void
language sql
set search_path = public, extensions
as $$
  update public.leghe
  set parola_ordine_hash = extensions.crypt(parola, extensions.gen_salt('bf'))
  where id = lega_id;
$$;

revoke all on function public.imposta_parola_lega(text, text) from public;
grant execute on function public.imposta_parola_lega(text, text) to service_role;

/* ------------------------------------------------------------------ */
/* Vedere le squadre libere di una lega, conoscendone nome e password  */
/* ------------------------------------------------------------------ */

create or replace function public.squadre_libere(nome_lega text, parola text)
returns table(lega_id text, lega_nome text, squadra_id text, squadra_nome text)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select l.id, l.nome, s.id, s.nome
  from public.leghe l
  join public.squadre s on s.lega_id = l.id
  where lower(l.nome) = lower(nome_lega)
    and l.parola_ordine_hash is not null
    and l.parola_ordine_hash = extensions.crypt(parola, l.parola_ordine_hash)
    and s.proprietario is null
  order by s.nome;
$$;

revoke all on function public.squadre_libere(text, text) from public;
grant execute on function public.squadre_libere(text, text) to authenticated;

/* ------------------------------------------------------------------ */
/* Scegliere una squadra libera. Un solo UPDATE con la guardia nel     */
/* WHERE: due persone che scelgono la stessa squadra nello stesso      */
/* istante non possono riuscirci entrambe, la seconda trova zero righe.*/
/* ------------------------------------------------------------------ */

create or replace function public.rivendica_squadra(nome_lega text, parola text, squadra_scelta text)
returns table(lega_id text, squadra_id text, squadra_nome text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  gia_dentro boolean;
  riga record;
begin
  select exists (
    select 1
    from public.squadre s
    join public.leghe l on l.id = s.lega_id
    where lower(l.nome) = lower(nome_lega)
      and s.proprietario = (select auth.jwt() ->> 'email')
  ) into gia_dentro;

  if gia_dentro then
    raise exception 'sei gia in questa lega, non puoi avere due squadre';
  end if;

  update public.squadre s
  set proprietario = (select auth.jwt() ->> 'email')
  from public.leghe l
  where s.lega_id = l.id
    and lower(l.nome) = lower(nome_lega)
    and l.parola_ordine_hash is not null
    and l.parola_ordine_hash = extensions.crypt(parola, l.parola_ordine_hash)
    and s.id = squadra_scelta
    and s.proprietario is null
  returning s.lega_id, s.id, s.nome into riga;

  if riga is null then
    raise exception 'squadra non disponibile, lega sconosciuta o parola errata';
  end if;

  return query select riga.lega_id, riga.id, riga.nome;
end;
$$;

revoke all on function public.rivendica_squadra(text, text, text) from public;
grant execute on function public.rivendica_squadra(text, text, text) to authenticated;

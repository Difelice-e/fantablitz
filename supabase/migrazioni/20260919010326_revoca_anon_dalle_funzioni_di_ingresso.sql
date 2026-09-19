-- La migrazione precedente revocava da PUBLIC, ma Supabase concede EXECUTE
-- direttamente ad anon/authenticated/service_role sulle funzioni nuove in
-- `public`, non allo pseudo-ruolo PUBLIC: la revoca non aveva alcun effetto,
-- e l'analizzatore di sicurezza lo segnala subito ("anon puo' eseguire una
-- funzione security definer"). Qui si revoca dai ruoli veri.

revoke execute on function public.imposta_parola_lega(text, text) from anon, authenticated;
revoke execute on function public.squadre_libere(text, text) from anon;
revoke execute on function public.rivendica_squadra(text, text, text) from anon;

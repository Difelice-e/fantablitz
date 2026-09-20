-- FantaBlitz — ritmo di lega configurabile (SPEC §4 `giornate_per_ciclo`).
--
-- Quante giornate gioca il job automatico a ogni ciclo, issue #13. L'orario
-- del ciclo resta invece fisso e globale (stesso §4): il piano gratuito di
-- Vercel esegue un solo cron al giorno, alla stessa ora per tutte le leghe,
-- quindi non e' un parametro che ha senso salvare per lega.

alter table public.leghe
  add column if not exists giornate_al_giorno integer not null default 1
    check (giornate_al_giorno >= 1);

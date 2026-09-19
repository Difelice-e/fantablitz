# Migrazioni

I nomi dei file sono `<versione>_<nome>.sql` e corrispondono **uno a uno** alle
migrazioni applicate sul progetto Supabase: `list_migrations` sul connettore
deve elencare esattamente queste, nello stesso ordine.

| versione | nome | cosa fa |
|---|---|---|
| `20260918233320` | `schema_lega` | le quattro tabelle, RLS e policy |
| `20260918233504` | `funzioni_in_schema_privato` | sposta le funzioni fuori da `public` |

Non si modifica una migrazione già applicata: se ne aggiunge un'altra. Un file
cambiato dopo l'applicazione racconta una storia diversa da quella del
database, ed è il modo più rapido per non capire più com'è fatto lo schema.

Si applicano col connettore Supabase (`apply_migration`) oppure incollandole
nel SQL Editor del pannello, in ordine.

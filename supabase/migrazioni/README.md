# Migrazioni

I nomi dei file sono `<versione>_<nome>.sql` e corrispondono **uno a uno** alle
migrazioni applicate sul progetto Supabase: `list_migrations` sul connettore
deve elencare esattamente queste, nello stesso ordine.

| versione | nome | cosa fa |
|---|---|---|
| `20260918233320` | `schema_lega` | le quattro tabelle, RLS e policy |
| `20260918233504` | `funzioni_in_schema_privato` | sposta le funzioni fuori da `public` |
| `20260919010226` | `parola_lega_e_ingresso` | parola d'ordine di lega, nome lega univoco, funzioni per l'ingresso autonomo |
| `20260919010326` | `revoca_anon_dalle_funzioni_di_ingresso` | corregge una revoca che sembrava fatta e non lo era: vedi il commento nel file |
| `20260919140000` | `tabella_scambi` | tabella `scambi` (storico degli scambi fra squadre) e la sua policy di lettura |
| `20260919150000` | `tabelle_narrativa` | tabelle `cronache` ed `editoriali` (SPEC 8), sola lettura via RLS |
| `20260919160000` | `tabella_chat` | tabella `chat` (reazioni dei bot a eventi scatenanti, SPEC 7.2), sola lettura via RLS |
| `20260919180000` | `albo_doro_e_voci_mercato` | tabelle `albo_doro` e `voci_mercato` (fine stagione, SPEC 5.8 e 8), sola lettura via RLS |
| `20260920120000` | `giornate_al_giorno` | colonna `leghe.giornate_al_giorno`, il ritmo di lega (SPEC §4 `giornate_per_ciclo`), issue #13 |
| `20260921120000` | `cache_stagione` | tabella `cache_stagione`: cache del ricalcolo di `vistaStagione`, scritta dal job che gioca una giornata, nessuna policy (solo chiave di servizio) |
| `20260921123000` | `cache_stagione_compressa` | `dati` da `jsonb` a `text`: il mondo simulato contiene l'intera stagione fin dall'inizio, il JSON non compresso arriva a 9-10 MB e la scrittura va in timeout |

Non si modifica una migrazione già applicata: se ne aggiunge un'altra. Un file
cambiato dopo l'applicazione racconta una storia diversa da quella del
database, ed è il modo più rapido per non capire più com'è fatto lo schema.

Si applicano col connettore Supabase (`apply_migration`) oppure incollandole
nel SQL Editor del pannello, in ordine.

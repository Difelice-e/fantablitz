# fixtures

File reali usati come base dei test. Non sono esempi inventati: sono gli export
veri che l'app dovrà digerire. Servono alla milestone 3 (import Fantalab).

| file | cosa contiene |
|---|---|
| `rose.csv` | export Fantalab completo di una lega reale a 10 squadre |
| `file_per_fantaleghe.csv` | export Fantalab minimale della stessa lega |

La struttura di entrambi è descritta in `SPEC.md` §6.1.

## Cosa è già stato verificato

Contro il listone `seed/Quotazioni_Fantacalcio_Stagione_2026_27.xlsx`:

- **10 squadre da 25 giocatori**, tutte con quote esatte **3-8-8-6** (P-D-C-A)
- spesa fra **482 e 500** crediti, prezzi da **1 a 222**
- **250 id su 250 trovati nel listone**, nessun duplicato, nessuno fra i ceduti
- i due file descrivono **la stessa identica lega**: squadra, id e prezzo coincidono riga per riga
- entrambi **CRLF**, entrambi **senza BOM**, entrambi **senza ritorno a capo finale**

## Casi limite emersi dai file veri

Sono le cose che l'importatore dovrà gestire, e che non si sarebbero indovinate.

- **`rose.csv` è UTF-8 con accenti** nei nomi (`Calò`, `Soulè`, `Kessiè`, `Lucumì`)
  e abbreviazioni per gli omonimi (`Martinez L.`, `Martinez Jo.`, `Adams A.`,
  `Adams C.`, `Konè M.`, `Konè I.`). I nomi non sono una chiave: si usa l'id.
- **I separatori dei ruoli Mantra sono diversi fra i due mondi**: il listone usa
  il punto e virgola (`Dd;Dc`), gli export la virgola dentro campo quotato
  (`"Dc,Dd"`).
- **L'ordine dei ruoli Mantra non coincide.** Fantalab li riordina in ordine
  canonico (21 combinazioni su 22), il listone elenca per primo il ruolo
  principale. Su **16 righe su 250** i due ordini differiscono pur descrivendo
  gli stessi ruoli: Kalulu è `Dd;Dc` nel listone e `Dc,Dd` nell'export.
  → La validazione deve confrontare **insiemi di ruoli, mai sequenze**.
  → L'ordine che conta per i rating è quello del **listone**, perché è l'unico
  dei due che porta informazione.
- **Nomi di squadra fanta con spazi e `&`** (`Pulpone & Loris`, `Maicol & Matteo`),
  non quotati in `file_per_fantaleghe.csv`: quel formato va spezzato sugli
  **ultimi due** separatori, non sul primo.
- **`file_per_fantaleghe.csv` termina con una riga separatore `$,$,$`** e senza
  ritorno a capo finale. La specifica prevede anche la variante troncata `$,`:
  il parser deve tollerare entrambe.
- Le squadre sono separate da `$,$,$`, che compare **11 volte** per 10 squadre:
  una in testa e una in coda.

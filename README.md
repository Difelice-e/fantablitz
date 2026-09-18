# FantaBlitz

Fantacalcio su un campionato di Serie A interamente simulato, giocato a ritmo
accelerato. Modalità **classic** o **Mantra**, a scelta per lega. Progetto
privato, ad accesso su invito.

- `CLAUDE.md` — regole di lavoro
- `SPEC.md` — la specifica: è la fonte di verità delle decisioni di prodotto

## Stato

| milestone | stato |
|---|---|
| 0 — seed dal listone | ✅ fatto, in [`seed/`](seed/) |
| 1 — motore e calibrazione | ✅ fatto, in [`engine/`](engine/) |
| 2 — schieramento: classic e Mantra | da fare |
| 3 — import Fantalab | da fare (fixture reali verificate in [`fixtures/`](fixtures/)) |

## Come si lavora

Serve Node 22.18 o successivo. Non ci sono dipendenze di runtime.

```bash
npm install        # solo TypeScript e i tipi di Node, per i controlli
npm test           # i test di tutti i pacchetti
npm run typecheck  # il controllo dei tipi
npm run seed       # rigenera il seed del mondo simulato
npm run calibra    # simula centinaia di stagioni e riporta le metriche
```

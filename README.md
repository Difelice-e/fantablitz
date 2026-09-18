# FantaBlitz

Fantacalcio Mantra su un campionato di Serie A interamente simulato, giocato a
ritmo accelerato. Progetto privato, ad accesso su invito.

- `CLAUDE.md` — regole di lavoro
- `SPEC.md` — la specifica: è la fonte di verità delle decisioni di prodotto

## Stato

| milestone | stato |
|---|---|
| 0 — seed dal listone | ✅ fatto, in [`seed/`](seed/) |
| 1 — motore e calibrazione | da fare |
| 2 — Mantra: ruoli, moduli, sostituzioni | da fare |
| 3 — import Fantalab | da fare (mancano le fixture, vedi [`fixtures/`](fixtures/)) |

## Come si lavora

Serve Node 22.18 o successivo. Non ci sono dipendenze di runtime.

```bash
npm install        # solo TypeScript e i tipi di Node, per i controlli
npm test           # i test di tutti i pacchetti
npm run typecheck  # il controllo dei tipi
npm run seed       # rigenera il seed del mondo simulato
```

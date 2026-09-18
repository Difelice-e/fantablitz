# fixtures

File reali usati come base dei test. Non sono esempi inventati: sono gli export
veri che l'app dovrà digerire.

## Attesi, non ancora presenti

Servono alla milestone 3 (import Fantalab). `CLAUDE.md` li elenca fra i file
forniti, ma non sono ancora arrivati in repository:

| file | cosa contiene |
|---|---|
| `rose.csv` | export Fantalab completo di una lega reale a 10 squadre |
| `file_per_fantaleghe.csv` | export Fantalab minimale della stessa lega |

La struttura attesa di entrambi è descritta in `SPEC.md` §6.1. Finché non ci
sono, l'importatore non si può scrivere contro i casi limite veri, che è
esattamente il modo in cui `CLAUDE.md` chiede di scriverlo.

## Già disponibile

Il listone ufficiale Mantra vive in `seed/` insieme allo script che lo consuma, e
fa da fixture ai test della milestone 0.

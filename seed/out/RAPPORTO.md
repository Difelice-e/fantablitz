# Seed FantaBlitz — stagione 2026-27

Generato da `seed/Quotazioni_Fantacalcio_Stagione_*.xlsx`. Rigenerare con `npm run seed` dentro la cartella `seed/`.

| | |
|---|---|
| club | 20 |
| giocatori | 533 |
| nomi anonimizzati | no |
| impronta del listone | `2c4cb2da765247b1…` |

## Distribuzioni

### Overall per ruolo classico

| gruppo | n | media | dev.std | min | p25 | mediana | p75 | max |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| tutti | 533 | 64.4 | 11.9 | 41.6 | 54.3 | 64.3 | 73.6 | 93.8 |
| P | 63 | 60.8 | 10.2 | 51.5 | 52.9 | 53.7 | 70.3 | 81.9 |
| D | 190 | 63.1 | 10.7 | 41.6 | 55.0 | 63.2 | 70.6 | 90.1 |
| C | 194 | 65.5 | 12.3 | 42.1 | 56.5 | 65.6 | 74.5 | 92.5 |
| A | 86 | 67.5 | 13.7 | 42.0 | 57.0 | 67.3 | 77.8 | 93.8 |

### Eta e potenziale

| gruppo | n | media | dev.std | min | p25 | mediana | p75 | max |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| eta | 533 | 25.8 | 3.3 | 17.0 | 24.0 | 26.0 | 28.0 | 34.0 |
| potenziale | 533 | 66.1 | 11.3 | 42.2 | 57.3 | 65.7 | 74.5 | 93.8 |
| margine di crescita | 313 | 2.9 | 2.6 | 0.2 | 1.1 | 2.0 | 3.9 | 13.4 |

### Overall per ruolo Mantra (un giocatore puo comparire piu volte)

| gruppo | n | media | dev.std | min | p25 | mediana | p75 | max |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Por | 63 | 60.8 | 10.2 | 51.5 | 52.9 | 53.7 | 70.3 | 81.9 |
| Dc | 108 | 63.3 | 10.7 | 41.6 | 55.1 | 63.6 | 70.0 | 83.0 |
| B | 11 | 62.6 | 10.2 | 47.5 | 50.4 | 65.4 | 70.4 | 77.1 |
| Dd | 56 | 62.7 | 9.3 | 41.6 | 56.9 | 61.5 | 69.7 | 80.8 |
| Ds | 66 | 61.2 | 9.8 | 42.2 | 53.2 | 61.6 | 68.6 | 77.3 |
| E | 91 | 63.4 | 10.8 | 42.2 | 55.0 | 64.5 | 71.3 | 90.1 |
| M | 68 | 62.6 | 10.4 | 42.7 | 55.1 | 63.0 | 69.0 | 91.3 |
| C | 126 | 64.2 | 11.9 | 42.1 | 56.1 | 64.6 | 71.9 | 91.3 |
| W | 65 | 66.1 | 11.9 | 42.2 | 57.1 | 67.4 | 74.7 | 90.1 |
| T | 65 | 68.9 | 13.2 | 42.2 | 59.0 | 69.8 | 79.3 | 92.5 |
| A | 58 | 68.0 | 12.6 | 42.2 | 57.9 | 68.6 | 77.8 | 92.5 |
| Pc | 51 | 68.3 | 14.8 | 42.0 | 56.3 | 70.6 | 79.1 | 93.8 |

## Club

Forza = somma degli overall dei 13 migliori. E il criterio con cui vengono assegnati gli impegni europei.

| club | sigla | rosa | por | forza | media overall | miglior giocatore | coppa |
|---|---|---:|---:|---:|---:|---|---|
| Inter | INT | 24 | 3 | 1097.3 | 75.6 | Martinez L. (93.8) | champions |
| Roma | ROM | 23 | 3 | 1066.1 | 73.3 | Malen (93.6) | champions |
| Como | COM | 26 | 3 | 1061.2 | 70.3 | Paz N. (92.5) | champions |
| Juventus | JUV | 28 | 3 | 1039.1 | 69.1 | Woltemade (86.2) | champions |
| Milan | MIL | 26 | 3 | 1031.2 | 68.4 | Pulisic (89.5) | europa |
| Napoli | NAP | 26 | 3 | 1031.0 | 69.1 | Hojlund (92.4) | europa |
| Atalanta | ATA | 24 | 3 | 1011.7 | 70.8 | Scamacca (83.3) | conference |
| Lazio | LAZ | 27 | 3 | 985.3 | 65.3 | Frattesi (86.9) |  |
| Fiorentina | FIO | 23 | 3 | 972.5 | 67.9 | Atta (83.6) |  |
| Bologna | BOL | 27 | 3 | 951.1 | 63.9 | Orsolini (89.2) |  |
| Sassuolo | SAS | 29 | 4 | 941.8 | 62.8 | Berardi (83.4) |  |
| Torino | TOR | 26 | 3 | 935.3 | 65.0 | Vlasic (81.1) |  |
| Udinese | UDI | 26 | 3 | 928.9 | 62.0 | Davis K. (85.2) |  |
| Cagliari | CAG | 27 | 3 | 898.5 | 60.0 | Fazzini (74.5) |  |
| Genoa | GEN | 27 | 3 | 898.0 | 60.5 | Ostigard (78.1) |  |
| Parma | PAR | 27 | 3 | 888.3 | 59.8 | Valeri (75.0) |  |
| Frosinone | FRO | 30 | 4 | 882.1 | 58.8 | Raimondo (78.1) |  |
| Lecce | LEC | 27 | 3 | 855.6 | 58.3 | Tiago Gabriel (76.2) |  |
| Monza | MON | 29 | 3 | 851.8 | 58.1 | Mangas (77.0) |  |
| Venezia | VEN | 31 | 4 | 830.9 | 56.0 | Adams A. (72.3) |  |

## I 25 giocatori piu forti

| # | giocatore | club | ruoli | eta | overall | pot. | att | dif | tec | fis | gol | assist |
|---:|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | Martinez L. | Inter | Pc | 28 | 93.8 | 93.8 | 93.8 | 56.6 | 80.7 | 91.6 | 1.00 | 0.35 |
| 2 | Malen | Roma | Pc | 32 | 93.6 | 93.6 | 93.6 | 56.5 | 80.5 | 91.4 | 1.00 | 0.38 |
| 3 | Paz N. | Como | T;A | 28 | 92.5 | 93.0 | 85.4 | 59.9 | 90.4 | 77.6 | 0.80 | 0.68 |
| 4 | Hojlund | Napoli | Pc | 31 | 92.4 | 92.4 | 92.4 | 56.4 | 79.7 | 90.3 | 1.00 | 0.34 |
| 5 | Calhanoglu | Inter | M;C | 34 | 91.3 | 91.3 | 63.1 | 81.7 | 83.7 | 85.1 | 0.23 | 0.36 |
| 6 | Thuram | Inter | Pc | 28 | 91.0 | 91.0 | 91.0 | 56.2 | 78.7 | 88.9 | 1.00 | 0.35 |
| 7 | Dimarco | Inter | E;W | 27 | 90.1 | 91.3 | 76.7 | 71.4 | 82.1 | 84.1 | 0.37 | 0.47 |
| 8 | Pulisic | Milan | T;A | 28 | 89.5 | 89.8 | 82.9 | 59.2 | 87.5 | 75.7 | 0.75 | 0.73 |
| 9 | Orsolini | Bologna | W;A | 30 | 89.2 | 89.2 | 82.7 | 60.5 | 84.6 | 79.4 | 0.79 | 0.57 |
| 10 | Douvikas | Como | Pc | 28 | 88.9 | 88.9 | 88.9 | 55.8 | 77.2 | 87.0 | 1.00 | 0.31 |
| 11 | Kean | Como | Pc | 33 | 88.9 | 88.9 | 88.9 | 55.8 | 77.2 | 87.0 | 1.00 | 0.30 |
| 12 | Ramos G. | Milan | Pc | 25 | 88.9 | 92.9 | 88.9 | 55.8 | 77.2 | 87.0 | 1.00 | 0.33 |
| 13 | McTominay | Napoli | C;T | 29 | 88.8 | 88.8 | 72.0 | 68.8 | 87.5 | 77.2 | 0.45 | 0.60 |
| 14 | Baturina | Como | T | 26 | 88.6 | 89.8 | 80.9 | 59.7 | 88.6 | 73.2 | 0.64 | 0.80 |
| 15 | Rabiot | Milan | C;T | 28 | 88.1 | 88.1 | 71.6 | 68.4 | 86.8 | 76.7 | 0.46 | 0.51 |
| 16 | Mora | Roma | T | 26 | 87.3 | 88.2 | 79.8 | 59.3 | 87.3 | 72.4 | 0.62 | 0.67 |
| 17 | Frattesi | Lazio | C;T | 29 | 86.9 | 86.9 | 70.9 | 67.8 | 85.7 | 75.8 | 0.39 | 0.59 |
| 18 | Woltemade | Juventus | A | 30 | 86.2 | 86.2 | 82.6 | 57.2 | 80.8 | 77.2 | 0.98 | 0.52 |
| 19 | Wesley | Roma | E | 28 | 85.8 | 85.8 | 71.5 | 73.3 | 76.9 | 82.2 | 0.24 | 0.49 |
| 20 | Zaccagni | Lazio | W;A | 23 | 85.8 | 86.5 | 79.8 | 59.5 | 81.6 | 76.9 | 0.67 | 0.55 |
| 21 | Kolo Muani | Juventus | Pc | 29 | 85.5 | 85.5 | 85.5 | 55.3 | 74.9 | 83.7 | 1.00 | 0.30 |
| 22 | De Bruyne | Napoli | T | 29 | 85.3 | 85.3 | 78.2 | 58.8 | 85.3 | 71.2 | 0.61 | 0.70 |
| 23 | Davis K. | Udinese | Pc | 26 | 85.2 | 86.2 | 85.2 | 55.3 | 74.6 | 83.4 | 1.00 | 0.28 |
| 24 | Da Cunha | Como | C;T | 29 | 84.4 | 84.4 | 69.5 | 66.6 | 83.3 | 74.1 | 0.38 | 0.55 |
| 25 | Barella | Inter | C | 32 | 84.3 | 84.3 | 65.4 | 70.6 | 82.6 | 75.7 | 0.28 | 0.38 |

## I migliori per ruolo Mantra

| ruolo | 1 | 2 | 3 |
|---|---|---|---|
| Por | Svilar (81.9) | Vicario (80.9) | Martinez Jo. (80.3) |
| Dc | Mancini (83.0) | Bremer (82.7) | Pavlovic (81.6) |
| B | Carlos Augusto (77.1) | Delprato (74.5) | Celik (71.3) |
| Dd | Kalulu (80.8) | Di Lorenzo (80.6) | Couto (77.8) |
| Ds | Vasquez (77.3) | Carlos Augusto (77.1) | Mangas (77.0) |
| E | Dimarco (90.1) | Wesley (85.8) | Molina N. (83.3) |
| M | Calhanoglu (91.3) | Ederson D.S. (81.1) | Modric (79.9) |
| C | Calhanoglu (91.3) | McTominay (88.8) | Rabiot (88.1) |
| W | Dimarco (90.1) | Orsolini (89.2) | Zaccagni (85.8) |
| T | Paz N. (92.5) | Pulisic (89.5) | McTominay (88.8) |
| A | Paz N. (92.5) | Pulisic (89.5) | Orsolini (89.2) |
| Pc | Martinez L. (93.8) | Malen (93.6) | Hojlund (92.4) |

## Le maggiori promesse

Giocatori con il margine di crescita piu ampio: sono quelli su cui la fase 2 fara la differenza.

| giocatore | club | ruoli | eta | overall | potenziale | margine |
|---|---|---|---:|---:|---:|---:|
| Lulli | Roma | E | 17 | 55.8 | 69.2 | +13.4 |
| Akpoguma | Frosinone | Dc | 18 | 51.7 | 65.1 | +13.4 |
| Cabal | Juventus | B;Ds;E | 17 | 47.5 | 60.4 | +12.9 |
| Dagasso | Venezia | C | 18 | 42.1 | 54.9 | +12.8 |
| Traorè Hj. | Genoa | W;T | 18 | 55.6 | 68.1 | +12.5 |
| Satalino | Sassuolo | Por | 20 | 53.3 | 64.3 | +11.0 |
| Trepy | Cagliari | Pc | 17 | 42.0 | 53.0 | +11.0 |
| Ekhator | Juventus | A | 19 | 51.4 | 62.2 | +10.8 |
| Turati | Sassuolo | Por | 18 | 53.1 | 63.9 | +10.8 |
| Goldaniga | Como | Dc | 19 | 42.0 | 52.2 | +10.2 |
| Cremaschi | Parma | E;C | 17 | 46.6 | 56.4 | +9.8 |
| Grandi | Venezia | Por | 21 | 53.1 | 62.7 | +9.6 |
| Mazzocchi | Venezia | Dd;Ds;E | 20 | 55.7 | 65.3 | +9.6 |
| Lolic | Frosinone | Por | 21 | 52.9 | 62.0 | +9.1 |
| Maye | Monza | Ds;Dc | 17 | 43.4 | 52.4 | +9.0 |

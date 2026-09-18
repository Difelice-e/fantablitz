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
| tutti | 533 | 64.5 | 11.9 | 41.6 | 54.2 | 64.3 | 73.5 | 93.8 |
| P | 63 | 60.8 | 10.2 | 51.5 | 52.9 | 53.7 | 70.3 | 81.9 |
| D | 190 | 63.2 | 10.7 | 41.6 | 55.0 | 63.3 | 70.5 | 90.1 |
| C | 194 | 65.6 | 12.3 | 42.1 | 56.4 | 66.1 | 74.5 | 92.3 |
| A | 86 | 67.4 | 13.7 | 42.0 | 56.6 | 66.9 | 78.0 | 93.8 |

### Eta e potenziale

| gruppo | n | media | dev.std | min | p25 | mediana | p75 | max |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| eta | 533 | 25.8 | 3.3 | 17.0 | 24.0 | 26.0 | 28.0 | 34.0 |
| potenziale | 533 | 66.1 | 11.3 | 42.2 | 57.5 | 66.1 | 74.4 | 93.8 |
| margine di crescita | 312 | 2.9 | 2.7 | 0.2 | 1.1 | 2.0 | 3.9 | 13.4 |

### Overall per ruolo Mantra (un giocatore puo comparire piu volte)

| gruppo | n | media | dev.std | min | p25 | mediana | p75 | max |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Por | 63 | 60.8 | 10.2 | 51.5 | 52.9 | 53.7 | 70.3 | 81.9 |
| Dc | 108 | 63.4 | 10.8 | 41.6 | 55.7 | 63.5 | 70.5 | 83.1 |
| B | 11 | 63.5 | 10.2 | 47.5 | 52.9 | 67.1 | 71.2 | 77.3 |
| Dd | 56 | 62.9 | 9.3 | 41.6 | 56.9 | 61.3 | 69.6 | 80.9 |
| Ds | 66 | 61.6 | 10.0 | 42.2 | 53.3 | 62.6 | 69.6 | 77.8 |
| E | 91 | 63.5 | 10.8 | 42.2 | 54.8 | 64.4 | 71.8 | 90.1 |
| M | 68 | 63.4 | 10.6 | 42.7 | 55.9 | 63.9 | 70.9 | 91.7 |
| C | 126 | 64.5 | 12.0 | 42.1 | 56.2 | 64.6 | 72.9 | 91.7 |
| W | 65 | 65.8 | 11.9 | 42.2 | 56.9 | 66.7 | 74.5 | 90.1 |
| T | 65 | 68.6 | 13.2 | 42.2 | 58.8 | 68.9 | 79.0 | 92.3 |
| A | 58 | 67.9 | 12.6 | 42.2 | 58.4 | 68.1 | 78.5 | 92.3 |
| Pc | 51 | 68.0 | 15.0 | 42.0 | 55.6 | 70.2 | 79.0 | 93.8 |

## Club

Forza = somma degli overall dei 13 migliori. E il criterio con cui vengono assegnati gli impegni europei.

| club | sigla | rosa | por | forza | media overall | miglior giocatore | coppa |
|---|---|---:|---:|---:|---:|---|---|
| Inter | INT | 24 | 3 | 1097.3 | 75.6 | Martinez L. (93.8) | champions |
| Roma | ROM | 23 | 3 | 1067.7 | 73.5 | Malen (93.6) | champions |
| Como | COM | 26 | 3 | 1062.7 | 70.2 | Paz N. (92.3) | champions |
| Juventus | JUV | 28 | 3 | 1039.3 | 69.2 | Woltemade (86.2) | champions |
| Napoli | NAP | 26 | 3 | 1031.8 | 69.1 | Hojlund (92.4) | europa |
| Milan | MIL | 26 | 3 | 1030.8 | 68.3 | Pulisic (89.3) | europa |
| Atalanta | ATA | 24 | 3 | 1011.2 | 70.7 | Scamacca (82.9) | conference |
| Lazio | LAZ | 27 | 3 | 982.6 | 65.2 | Frattesi (86.9) |  |
| Fiorentina | FIO | 23 | 3 | 974.3 | 68.1 | Atta (83.5) |  |
| Bologna | BOL | 27 | 3 | 950.1 | 64.0 | Orsolini (89.0) |  |
| Sassuolo | SAS | 29 | 4 | 942.7 | 62.8 | Berardi (83.8) |  |
| Torino | TOR | 26 | 3 | 933.4 | 64.9 | Vlasic (80.9) |  |
| Udinese | UDI | 26 | 3 | 932.5 | 62.0 | Davis K. (85.2) |  |
| Cagliari | CAG | 27 | 3 | 902.7 | 60.2 | Caprile (74.3) |  |
| Genoa | GEN | 27 | 3 | 901.0 | 60.6 | Ostigard (78.0) |  |
| Parma | PAR | 27 | 3 | 890.5 | 59.8 | Delprato (75.0) |  |
| Frosinone | FRO | 30 | 4 | 882.2 | 58.8 | Raimondo (78.0) |  |
| Lecce | LEC | 27 | 3 | 856.5 | 58.4 | Tiago Gabriel (76.2) |  |
| Monza | MON | 29 | 3 | 851.5 | 58.1 | Mangas (77.0) |  |
| Venezia | VEN | 31 | 4 | 832.6 | 56.0 | Adams A. (71.7) |  |

## I 25 giocatori piu forti

| # | giocatore | club | ruoli | eta | overall | pot. | att | dif | tec | fis | gol | assist |
|---:|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | Martinez L. | Inter | Pc | 28 | 93.8 | 93.8 | 93.8 | 56.6 | 80.7 | 91.6 | 1.00 | 0.35 |
| 2 | Malen | Roma | Pc | 32 | 93.6 | 93.6 | 93.6 | 56.5 | 80.5 | 91.4 | 1.00 | 0.38 |
| 3 | Hojlund | Napoli | Pc | 31 | 92.4 | 92.4 | 92.4 | 56.4 | 79.7 | 90.3 | 1.00 | 0.34 |
| 4 | Paz N. | Como | T;A | 28 | 92.3 | 92.8 | 85.3 | 59.9 | 90.2 | 77.5 | 0.80 | 0.68 |
| 5 | Calhanoglu | Inter | M;C | 34 | 91.7 | 91.7 | 63.2 | 82.0 | 84.1 | 85.4 | 0.23 | 0.36 |
| 6 | Thuram | Inter | Pc | 28 | 91.0 | 91.0 | 91.0 | 56.2 | 78.7 | 88.9 | 1.00 | 0.35 |
| 7 | Dimarco | Inter | E;W | 27 | 90.1 | 91.3 | 76.7 | 71.4 | 82.1 | 84.1 | 0.37 | 0.47 |
| 8 | Pulisic | Milan | T;A | 28 | 89.3 | 89.6 | 82.8 | 59.2 | 87.3 | 75.5 | 0.75 | 0.73 |
| 9 | Orsolini | Bologna | W;A | 30 | 89.0 | 89.0 | 82.5 | 60.4 | 84.4 | 79.3 | 0.79 | 0.57 |
| 10 | Douvikas | Como | Pc | 28 | 88.9 | 88.9 | 88.9 | 55.8 | 77.2 | 87.0 | 1.00 | 0.31 |
| 11 | Kean | Como | Pc | 33 | 88.9 | 88.9 | 88.9 | 55.8 | 77.2 | 87.0 | 1.00 | 0.30 |
| 12 | Ramos G. | Milan | Pc | 25 | 88.9 | 92.9 | 88.9 | 55.8 | 77.2 | 87.0 | 1.00 | 0.33 |
| 13 | McTominay | Napoli | C;T | 29 | 88.8 | 88.8 | 72.0 | 68.8 | 87.5 | 77.2 | 0.45 | 0.60 |
| 14 | Baturina | Como | T | 26 | 88.6 | 89.8 | 80.9 | 59.7 | 88.6 | 73.2 | 0.64 | 0.80 |
| 15 | Rabiot | Milan | C;T | 28 | 88.0 | 88.0 | 71.5 | 68.4 | 86.7 | 76.6 | 0.46 | 0.51 |
| 16 | Mora | Roma | T | 26 | 87.2 | 88.1 | 79.8 | 59.3 | 87.2 | 72.3 | 0.61 | 0.67 |
| 17 | Frattesi | Lazio | C;T | 29 | 86.9 | 86.9 | 70.9 | 67.8 | 85.7 | 75.8 | 0.39 | 0.59 |
| 18 | Woltemade | Juventus | A | 30 | 86.2 | 86.2 | 82.6 | 57.2 | 80.8 | 77.2 | 0.98 | 0.52 |
| 19 | Wesley | Roma | E | 28 | 85.7 | 85.7 | 71.4 | 73.2 | 76.8 | 82.1 | 0.23 | 0.49 |
| 20 | Zaccagni | Lazio | W;A | 23 | 85.7 | 86.4 | 79.8 | 59.5 | 81.5 | 76.8 | 0.66 | 0.54 |
| 21 | Kolo Muani | Juventus | Pc | 29 | 85.5 | 85.5 | 85.5 | 55.3 | 74.9 | 83.7 | 1.00 | 0.30 |
| 22 | Davis K. | Udinese | Pc | 26 | 85.2 | 86.2 | 85.2 | 55.3 | 74.6 | 83.4 | 1.00 | 0.28 |
| 23 | De Bruyne | Napoli | T | 29 | 85.1 | 85.1 | 78.1 | 58.8 | 85.1 | 71.1 | 0.61 | 0.70 |
| 24 | Dybala | Roma | A | 28 | 84.5 | 84.5 | 81.1 | 56.9 | 79.3 | 75.9 | 0.97 | 0.45 |
| 25 | Barella | Inter | C | 32 | 84.3 | 84.3 | 65.4 | 70.6 | 82.6 | 75.7 | 0.28 | 0.38 |

## I migliori per ruolo Mantra

| ruolo | 1 | 2 | 3 |
|---|---|---|---|
| Por | Svilar (81.9) | Vicario (80.9) | Martinez Jo. (80.3) |
| Dc | Mancini (83.1) | Bremer (82.7) | Pavlovic (81.7) |
| B | Carlos Augusto (77.3) | Delprato (75.0) | Celik (72.0) |
| Dd | Kalulu (80.9) | Di Lorenzo (80.6) | Chalobah T. (77.9) |
| Ds | Vasquez (77.8) | Carlos Augusto (77.3) | Mangas (77.0) |
| E | Dimarco (90.1) | Wesley (85.7) | Molina N. (83.4) |
| M | Calhanoglu (91.7) | Ederson D.S. (81.4) | Modric (80.2) |
| C | Calhanoglu (91.7) | McTominay (88.8) | Rabiot (88.0) |
| W | Dimarco (90.1) | Orsolini (89.0) | Zaccagni (85.7) |
| T | Paz N. (92.3) | Pulisic (89.3) | McTominay (88.8) |
| A | Paz N. (92.3) | Pulisic (89.3) | Orsolini (89.0) |
| Pc | Martinez L. (93.8) | Malen (93.6) | Hojlund (92.4) |

## Le maggiori promesse

Giocatori con il margine di crescita piu ampio: sono quelli su cui la fase 2 fara la differenza.

| giocatore | club | ruoli | eta | overall | potenziale | margine |
|---|---|---|---:|---:|---:|---:|
| Lulli | Roma | E | 17 | 55.8 | 69.2 | +13.4 |
| Akpoguma | Frosinone | Dc | 18 | 51.6 | 65.0 | +13.4 |
| Cabal | Juventus | B;Ds;E | 17 | 47.5 | 60.4 | +12.9 |
| Dagasso | Venezia | C | 18 | 42.1 | 54.9 | +12.8 |
| Traorè Hj. | Genoa | W;T | 18 | 55.4 | 67.9 | +12.5 |
| Satalino | Sassuolo | Por | 20 | 53.3 | 64.3 | +11.0 |
| Trepy | Cagliari | Pc | 17 | 42.0 | 53.0 | +11.0 |
| Ekhator | Juventus | A | 19 | 51.5 | 62.3 | +10.8 |
| Turati | Sassuolo | Por | 18 | 53.1 | 63.9 | +10.8 |
| Goldaniga | Como | Dc | 19 | 42.0 | 52.2 | +10.2 |
| Cremaschi | Parma | E;C | 17 | 46.6 | 56.4 | +9.8 |
| Grandi | Venezia | Por | 21 | 53.1 | 62.7 | +9.6 |
| Mazzocchi | Venezia | Dd;Ds;E | 20 | 56.4 | 66.0 | +9.6 |
| Lolic | Frosinone | Por | 21 | 52.9 | 62.0 | +9.1 |
| Maye | Monza | Ds;Dc | 17 | 43.4 | 52.4 | +9.0 |

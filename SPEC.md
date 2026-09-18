# FantaBlitz — Specifica

Versione 1.0 — documento di riferimento del progetto.
Tutte le decisioni qui contenute sono state prese esplicitamente. Ciò che non è deciso è elencato in fondo, nella sezione "Decisioni aperte".

---

## 1. Cos'è

**FantaBlitz** è un fantacalcio Mantra giocato su un campionato di Serie A **interamente simulato**, non su quello reale. Il campionato avanza da solo a ritmo accelerato: risultati, voti, infortuni, squalifiche, trasferimenti e carriere pluriennali sono generati da un motore di simulazione. Gli utenti sono fantallenatori con una rosa, schierano la formazione e si affrontano in scontri diretti. Uno strato AI racconta ciò che il motore produce.

I posti vacanti nella lega sono occupati da bot.

### Vincoli di progetto (fase privata)

- Uso **privato tra amici**: nessuna monetizzazione, nessuna pubblicità, nessuna quota di iscrizione con montepremi, nessuna pubblicazione sugli store, nessuna landing page indicizzata.
- Accesso **solo su invito**.
- **Solo testo**: nessuna foto di calciatori, nessun logo o maglia di club reali.
- I nomi di giocatori e squadre sono **dati sostituibili**, mai cablati nella logica. Deve essere possibile sostituire l'intero database con nomi di fantasia cambiando solo il seed.

---

## 2. Glossario

| Termine | Significato |
|---|---|
| **Mondo simulato** | Le 20 squadre di Serie A simulate, i loro giocatori, il calendario e le partite |
| **Lega fanta** | Le 10 squadre dei fantallenatori (umani + bot) che si affrontano sui voti del mondo simulato |
| **Ciclo** | L'esecuzione serale del job: simula N giornate e genera i contenuti |
| **Listone** | L'elenco dei giocatori acquistabili |

Ogni lega possiede **il proprio mondo simulato**, indipendente dagli altri. Due leghe non condividono risultati.

---

## 3. Fasi e feature flag

La fase 1 è l'MVP giocabile. La fase 2 si attiva accendendo flag, senza riscrivere logica.

| Flag | Fase 1 | Fase 2 | Effetto |
|---|---|---|---|
| `asta_nativa` | off | on | Asta live in-app; in fase 1 si importa da Fantalab |
| `ritiri` | off | on | I giocatori si ritirano per età |
| `mercato_estero` | off | on | Cessioni all'estero (con rimborso crediti) e arrivi |
| `ricambio_generazionale` | off | on | Nuove leve dalle giovanili ogni stagione |
| `trasferimenti_interni` | **on** | on | Trasferimenti tra club di Serie A |
| `evoluzione_rating` | **on** | on | Crescita e declino dei rating tra stagioni |
| `sostituzioni_easy_master` | off | on | Modalità Easy e Master oltre a Basic |
| `rimpiazzo_da_listone` | off | on | Sostituire un giocatore perso pescando dal listone |
| `riequilibrio_budget` | off | opz. | Budget extra inverso alla classifica |

---

## 4. Configurazione di lega

Tutti i valori sono parametri, con i default indicati.

**Struttura**
- Squadre: 10 (umani + bot)
- Crediti iniziali: 500
- Rosa: dipende dalla modalità
  - `mantra`: **minimo 23** giocatori, di cui almeno 2 portieri. **Nessun massimo**
  - `classic`: **esattamente 25**, con quote **fisse 3-8-8-6** (P-D-C-A). Non è un minimo: è una composizione esatta, e una rosa che non la rispetta non è valida
- Modalità ruoli: **`mantra` o `classic`**, scelta **per lega** alla creazione e non più modificabile in corsa. Entrambe disponibili dalla prima versione. Il mondo simulato è identico nei due casi: la modalità vive interamente nel livello fanta, e più precisamente nelle regole di schieramento (§6.2)
- Panchina: ordinata per priorità

**Ritmo**
- `giornate_per_ciclo`: default 1, parametrizzabile (una stagione dura 38 / N giorni)
- Orario del ciclo: fisso, serale
- Durata carriera: 1–5 anni, **modificabile in corsa**

**Economia**
- Crediti residui: **si cumulano**
- Rifornimento annuale: +500 a tutti
- Svincoli volontari: solo nella finestra di fine stagione

**Punteggio**
- Soglie gol: 66, 72, 77, 81, 85, 89, 93, 97, 101, 105, poi ogni 4. Implementata come funzione parametrica: `soglia_base` (66) e scarti (6, 5, 4 ricorrente). Sotto la soglia base: 0 gol
- Bonus/malus: configurabili (gol, assist, ammonizione, espulsione, rigore segnato/sbagliato/parato, autogol, gol subito), con default classici
- Modificatore di difesa e modificatore portiere: attivabili, con soglie configurabili
- Malus di adattamento Mantra: **−1**, configurabile. È il valore del regolamento ufficiale, che prevede un **solo livello** di malus: non esistono aggravi (§6.2)

---

## 5. Mondo simulato

### 5.1 Giocatori

Ogni giocatore ha:
- **Rating base** per area (attacco, difesa, tecnica, fisico) e **potenziale**
- **Uno o più ruoli Mantra**: Por, Dc, B, Dd, Ds, E, M, C, W, T, A, Pc
- **Età**, club di appartenenza, propensioni (al gol, all'assist, al cartellino, all'infortunio)

**Seed iniziale**: derivato dal **listone ufficiale Mantra di Fantacalcio.it** (file `Quotazioni_Fantacalcio_Stagione_2026_27.xlsx`), che porta anche il `Fantacalcio_Id` usato come chiave dagli import. Il seed è un dato di input, non parte del codice.

Struttura del listone:
- Fogli: `Tutti`, `Portieri`, `Difensori`, `Centrocampisti`, `Attaccanti`, `Ceduti`. Si usa `Tutti`; `Ceduti` serve come **lista di esclusione**
- Ogni foglio ha una **riga di titolo prima delle intestazioni**: va saltata in lettura
- Colonne: `Id, R, RM, Nome, Squadra, Qt.A, Qt.I, Diff., Qt.A M, Qt.I M, Diff.M, FVM, FVM M`
- `RM` = ruoli Mantra separati da **punto e virgola** (`E;W`, `M;C`), mentre in `rose.csv` la separazione è a **virgola**: il parser deve gestire entrambe le convenzioni
- `Squadra` qui è il nome esteso (`Inter`, `Roma`), mentre negli export Fantalab è la sigla a tre lettere (`INT`, `ROM`): serve una tabella di corrispondenza
- Volumi di riferimento: 533 giocatori, 20 club, 63 ceduti, nessun id duplicato

Derivazione dei rating, in ordine di peso:
1. **FVM M** (Fanta Valore di Mercato Mantra, scala 1–450): stima sintetica che comprime titolarità, bonus attesi e qualità. È il segnale principale
2. **Qt.A M** (quotazione d'asta Mantra, 1–37): utile per la gerarchia dentro il ruolo
3. **RM**: determina le propensioni per area (gol, assist, contrasti, parate)
4. Statistiche reali della stagione precedente, quando disponibili, per rifinire le propensioni

Età, potenziale e curva di crescita non sono nel listone: vanno forniti come dato di seed separato o generati con una distribuzione plausibile, con possibilità di correzione manuale sui giocatori principali.

**Derivazione implementata** (milestone 0, `/seed`). Dettagli e motivazioni in `seed/README.md`, numeri in `seed/config/parametri.json`:

1. **Segnale**: `0.7 × ln(1 + FVM) + 0.3 × ln(1 + Qt.A)`. La scala logaritmica è necessaria perché il valore di mercato è molto storto (mediana 14, massimo 450).
   La **fonte** è configurabile (`rating.fonteSegnale`) fra `classic` (`FVM`, `Qt.A`), `mantra` (`FVM M`, `Qt.A M`) e `media`, con **default `media`**. Le due quotazioni divergono su 142 giocatori su 533, con scarto mediano del 15%, e chi si muove di più sono i mediani `M;C`, che in Mantra valgono di più perché lo slot M va riempito comunque. È una differenza di **prezzo, non di bravura**: siccome i rating del mondo descrivono la bravura e sono gli stessi per tutti, la media annulla la distorsione di entrambe le modalità
2. **Qualità 0–1**, normalizzata **dentro il ruolo classico**, non sull'intero listone: metà dei portieri ha `FVM M = 1` e una normalizzazione globale li schiaccerebbe tutti sul fondo della scala. È un misto fra rango (con rango medio sui pari merito) e magnitudine
3. **Overall** nella fascia configurata per ruolo. I portieri hanno forbice più stretta e pavimento più alto degli attaccanti
4. **Aree**: `area = livello_neutro + (overall − livello_neutro) × peso_di_ruolo`, con il primo ruolo Mantra che pesa il doppio dei successivi. Partire dal livello neutro evita che il miglior attaccante risulti il peggior difensore del campionato
5. **Propensioni** da ruolo, corrette per qualità
6. **Età e potenziale** generati con RNG seminato **sull'identificativo del giocatore**: aggiungere o togliere qualcuno dal listone non sposta l'anagrafica degli altri. Correzioni manuali in `seed/config/override-giocatori.json`

**Formato del seed**: due file separati. `mondo.json` contiene il mondo simulato e **nessun** `Fantacalcio_Id`; `riferimenti-esterni.json` contiene la corrispondenza id interni ↔ id esterni, le sigle dei club e le quotazioni di origine, e serve solo agli import. La separazione rende strutturalmente impossibile violare per distrazione il vincolo sull'id esterno.

Il seed è riproducibile byte per byte: nessuna data di generazione nel file, che porta invece l'impronta SHA-256 del listone di origine.

### 5.2 Stati dinamici

Confluiscono in un **rating effettivo** calcolato a ogni partita, moltiplicando il rating base per tre fattori, ciascuno limitato a una banda stretta (indicativamente ±15%):

- **Condizione fisica**: cala con i minuti giocati, risale col riposo
- **Forma**: passeggiata casuale con ritorno alla media, variazione lenta per giornata
- **Morale**: prevalentemente **di squadra**, legato alla striscia di risultati, con componente individuale minima

### 5.3 Calendario e coppe

- 38 giornate, con **3–4 turni infrasettimanali** per dare senso alle rotazioni
- **Le coppe non si simulano.** I club qualificati (in base alla classifica della stagione precedente; al primo anno da seed — di default le qualificate del primo anno sono ricavate dalla forza della rosa nel listone, somma degli overall dei 13 migliori, così il dato nasce dal mondo simulato e non da fatti del campionato reale; l'assegnazione manuale resta possibile in `seed/config/club.json`) hanno un flag di impegno europeo: nelle settimane di coppa il motore **consuma condizione** a un sottoinsieme della rosa, senza generare partite
- Effetto voluto: chi gioca in Europa ruota di più, il titolare fisso di una squadra senza coppe ha più valore all'asta

### 5.4 Allenatore AI

Ogni club ha un modulo preferito, gerarchie per ruolo e una politica di turnover. Schiera gli undici titolari tenendo conto di condizione, infortuni, squalifiche e importanza della partita.

### 5.5 Motore partita

Granularità: **eventi aggregati per partita**, dietro l'interfaccia `simulaPartita(casa, ospite, parametri) → Evento[]`, sostituibile in futuro da un motore minuto per minuto senza toccare il resto.

Pipeline:

1. **Formazioni** — l'allenatore AI schiera gli undici
2. **Risultato** — Poisson sui gol attesi, da forza d'attacco contro forza di difesa più fattore campo
3. **Attribuzione** — gol assegnati ai giocatori in campo pesando la propensione al gol, poi gli assist
4. **Statistiche individuali** — tiri, occasioni create, duelli, errori, parate, con medie legate a rating effettivo e ruolo
5. **Disciplina e infortuni** — cartellini e infortuni con probabilità legate a ruolo, età, minuti accumulati e condizione
6. **Timeline** — a ogni evento si assegna un minuto, ottenendo la sequenza per la cronaca
7. **Voto statistico** — formula pesata sulle statistiche del punto 4, **arrotondata a 0.5**, s.v. sotto la soglia di minuti
8. **Fantavoto** — calcolato per lega, applicando bonus, malus e modificatori della configurazione

I punti 1–7 appartengono al mondo simulato e sono uguali per tutti. Il punto 8 dipende dalle regole della lega.

**Statistiche individuali prodotte al punto 4** (input obbligatorio del voto): minuti giocati, tiri, tiri in porta, grandi occasioni fallite, occasioni create, passaggi tentati e riusciti, passaggi chiave, cross tentati e riusciti, dribbling riusciti e subiti, duelli vinti, duelli aerei vinti, contrasti, intercetti, respinte, palle recuperate, palle perse, falli commessi, fuorigioco, errori, errori da gol, rigori concessi. Per i portieri anche: parate, parate decisive, uscite riuscite e sbagliate, rinvii precisi, tiri affrontati, gol subiti, rigori parati.

### 5.6 Voto statistico

Ispirato a due sistemi esistenti, con una differenza esplicita:

- Da **Alvin482** (Fantacalcio.it): non una formula sola ma **una famiglia di formule per ruolo**, perché un difensore centrale non si valuta sulla stessa base dati di un attaccante e un terzino ha compiti diversi da un centrale. Da lì anche la soglia minima di minuti e la scala allineata ai voti tradizionali
- Da **Sorare**: la separazione tra azioni decisive e contributo diffuso (all-around)
- **Differenza voluta**: Sorare fonde tutto in un punteggio unico 0–100, mentre qui voto e bonus restano separati come nel fantacalcio italiano. Le azioni decisive entrano nel voto solo in **forma attenuata**, per non pagarle due volte

**Formula**

```
voto_grezzo = 6.0 + C_prestazione + C_decisiva + C_risultato
voto        = arrotonda_a_0.5( clamp(voto_grezzo, 3.0, 10.0) )
```

**C_prestazione** — indice di ruolo standardizzato:

```
indice_ruolo   = Σ (peso_statistica × valore_statistica)
C_prestazione  = 0.45 × z(indice_ruolo), limitato a ±1.5
```

Media e deviazione standard usate nello z-score sono **parametri fissi**, determinati una volta in calibrazione e salvati in configurazione, **non ricalcolati a ogni giornata**: il voto deve misurare una prestazione in assoluto, non rispetto agli altri di quel turno. Il coefficiente 0.45 è la manopola principale per allargare o stringere la forbice dei voti.

**Pesi dell'indice per ruolo** (valori di partenza, da rifinire in calibrazione):

| Ruolo | Positive | Negative |
|---|---|---|
| **Por** | parate 1.0, parate decisive 2.5, uscite riuscite 0.8, rinvii precisi 0.2 | gol subiti −1.2 (attenuati dai tiri affrontati), uscite sbagliate −2.0, errori −3.0 |
| **Dc, B** | duelli vinti 1.0, contrasti 1.2, intercetti 1.2, respinte 0.6, passaggi riusciti 0.05 | dribbling subiti −1.2, errori −3.0, falli −0.4 |
| **Dd, Ds, E** | duelli vinti 0.8, intercetti 0.9, cross riusciti 1.2, passaggi chiave 1.5, dribbling riusciti 0.8 | dribbling subiti −1.0, palle perse −0.3, errori −3.0 |
| **M, C** | palle recuperate 1.0, duelli vinti 0.8, passaggi riusciti 0.08, passaggi chiave 1.5, dribbling riusciti 0.8 | palle perse −0.4, errori −2.5, falli −0.3 |
| **T, W, A** | passaggi chiave 1.5, dribbling riusciti 1.2, tiri in porta 1.5, occasioni create 2.0 | palle perse −0.3, grandi occasioni fallite −2.0 |
| **Pc** | tiri in porta 1.8, occasioni create 1.5, duelli aerei vinti 0.8, sponde riuscite 0.6 | grandi occasioni fallite −2.5, fuorigioco −0.3 |

**C_decisiva** — contributo attenuato delle azioni decisive (il bonus pieno resta al fantavoto):

| Azione | Contributo al voto |
|---|---|
| Gol di attaccante | +0.5 |
| Gol di centrocampista | +0.7 |
| Gol di difensore o portiere | +0.9 |
| Assist | +0.3 |
| Rigore parato | +0.8 |
| Rigore sbagliato | −0.8 |
| Autogol | −1.0 |
| Errore da gol | −1.2 |
| Rigore concesso | −0.8 |
| Espulsione | −1.0 |
| Ammonizione | 0 (già punita dal malus) |

**C_risultato** — ±0.1 secondo l'esito della partita, il riflesso del risultato che hanno le pagelle reali. Configurabile; azzerandolo si ottiene un voto puramente oggettivo.

**Minuti**
- Sotto i **10 minuti**: s.v.
- Tra 10 e 25 minuti: `C_prestazione` attenuato proporzionalmente (su pochi palloni non si giudica)
- Portiere entrato che gioca almeno 25 minuti: voto pieno

**Obiettivi di calibrazione** (da verificare sulle centinaia di stagioni dello script di taratura):
- Media dei voti ≈ 6.0
- Deviazione standard tra 0.6 e 0.7
- Voti ≥ 8: circa 1–2% delle valutazioni
- Voti ≤ 4.5: circa 2–3%
- Nessun ruolo con varianza sistematicamente più bassa degli altri (attenzione ai portieri)

Tutti i pesi, i coefficienti e le soglie vivono in un file di configurazione del motore, non nel codice.

### 5.7 Disciplina e infortuni

- Ammonizioni: diffida alla quarta, **squalifica di una giornata alla quinta**, poi il conteggio riparte
- Espulsione: da 1 a 3 giornate secondo gravità
- Infortuni: durata in giornate, con impatto su condizione al rientro

### 5.8 Fine stagione

Sequenza, l'ordine conta. Le voci marcate `[flag]` sono spente in fase 1.

1. Chiusura campionato, verdetti, albo d'oro della carriera
2. Ritiri per età e calo di rating `[ritiri]`
3. Cessioni verso l'estero e arrivi dall'estero `[mercato_estero]`
4. Trasferimenti interni tra club di Serie A
5. Nuove leve dalle giovanili `[ricambio_generazionale]`
6. Aggiornamento rating: crescita per i giovani, declino per gli anziani `[evoluzione_rating]` — **attivo in fase 1**
7. Lato fanta: rimborso crediti per ritiri e partenze estere, poi finestra degli svincoli volontari
8. Rifornimento di 500 crediti a tutti
9. Asta degli svincolati (in fase 1: import o assegnazione manuale)
10. Generazione del nuovo calendario

**Taratura del punto 3** (quando attivo): le uscite verso l'estero vanno pesate per età e per rapporto tra rating e potenziale — parte il giovane in ascesa o il big a fine ciclo — e i club rimpiazzano comprando. Uscite casuali svuoterebbero il listone dei nomi migliori in due stagioni.

---

## 6. Livello fanta

### 6.1 Creazione delle rose (fase 1): import da Fantalab

L'asta live nativa è rinviata. In fase 1 l'asta si svolge su Fantalab e il risultato si importa.

**La chiave di join è `Fantacalcio_Id`**, presente in entrambi i formati di export. Il listone interno è quello ufficiale di Fantacalcio.it, quindi l'abbinamento è esatto e non serve alcun matching per somiglianza sui nomi. I nomi restano solo un dato di visualizzazione.

**Un solo importatore per entrambe le modalità.** `rose.csv` porta sia `Ruolo` (classico) sia `Ruoli_Mantra`, sia `Quotazione` sia `Quotazione_Mantra`: il parser è lo stesso, cambia solo quale coppia di campi si usa per la validazione. `file_per_fantaleghe.csv` è indifferente alla modalità, perché contiene solo id e prezzo.

*Verificato sui file reali* (vedi `/fixtures`): Fantalab riordina i ruoli Mantra in ordine canonico mentre il listone li elenca col principale per primo, e su 16 righe su 250 i due ordini differiscono pur descrivendo gli stessi ruoli. La validazione deve quindi confrontare **insiemi di ruoli, mai sequenze**.

Due formati da supportare, entrambi CRLF:

**A. `rose.csv` — formato principale**

Intestazione: `Squadra, Nome, Squadra_Appartenenza, Ruolo, Ruoli_Mantra, Prezzo, Quotazione, Quotazione_Mantra, Fantacalcio_Id`

- `Squadra` = squadra fanta, `Squadra_Appartenenza` = sigla a tre lettere del club (ATA, BOL, CAG, COM, FIO, FRO, GEN, INT, JUV, LAZ, LEC, MIL, MON, NAP, PAR, ROM, SAS, TOR, UDI, VEN)
- `Ruoli_Mantra` = lista separata da virgole dentro campo quotato (es. `"Dc,Dd"`, `"W,T"`)
- `Prezzo` = crediti pagati all'asta
- Campi quotati, nomi con accenti e abbreviazioni (`Calò`, `Martinez L.`, `Sanchez Ro.`)
- I campi ridondanti (nome, ruoli, club) si usano per **validare** l'import contro il listone, non per identificare il giocatore

**B. `file_per_fantaleghe.csv` — formato minimale**

Tre colonne senza intestazione utile (la prima riga è `$,$,$`): squadra fanta, `Fantacalcio_Id`, prezzo. Le squadre sono separate da righe `$,$,$` e il file può terminare con una riga tronca (`$,`). Sufficiente da solo, perché tutto il resto arriva dal listone.

Requisiti dell'importatore:
- Import **atomico**: o passa tutto, o non passa niente
- Gestione esplicita dell'unico caso di disallineamento possibile: id presente nella rosa ma assente dal listone (listone più recente della rosa) → riga segnalata all'admin, import bloccato finché non è risolta
- Segnalare come avviso (non errore) le discrepanze tra i campi ridondanti del file e il listone
- Validazioni comuni: nessun id duplicato nell'intero file, somma dei prezzi entro il budget, prezzi ≥ 1
- Validazione della composizione, **dipendente dalla modalità** (§4): in `mantra` minimo 23 giocatori con almeno 2 portieri; in `classic` esattamente 25 con quote 3-8-8-6. I file di esempio forniti rispettano la composizione classic esatta
- I file di esempio forniti sono le **fixture dei test**. Riferimento del caso tipico: 10 squadre da 25 giocatori (3-8-8-6), spesa tra 482 e 500 crediti, prezzi da 1 a 222
- Verifica già effettuata sui file reali: **tutti i 250 id delle rose di esempio trovano corrispondenza nel listone 2026/27**, nessun id duplicato, nessuno tra i ceduti. Il join è esatto

**Dopo l'import**, mostrare per ogni squadra la **copertura dei moduli**: quali degli 11 schemi Mantra riesce a schierare senza malus, quali solo con adattamenti, quali non copre affatto. Con rose da 25 e quote classic (3-8-8-6) la copertura è tipicamente parziale, ed è un'informazione che l'utente vuole vedere subito.

### 6.2 Formazione

Lo schieramento è l'**unico punto** in cui le due modalità divergono davvero. Tutto il resto del livello fanta — budget, crediti, scontri diretti, soglie gol, bonus e malus, scambi, bot — è identico.

**Due contratti ortogonali**, non una matrice di casi:

- `RegoleSchieramento` dipende dalla **modalità**: quali moduli esistono, quale giocatore può occupare quale slot, con quale malus. Due implementazioni, `classic` e `mantra`
- `StrategiaSostituzione` dipende dal **livello** (Basic ora, Easy e Master dietro flag): come si cerca il rimpiazzo. Interroga le regole senza conoscerle

Così le due modalità e i tre livelli si combinano senza duplicare codice: 2 + 3 implementazioni, non 2 × 3. Basic funziona su entrambe le modalità senza sapere quale sta usando.

**Modalità `mantra`**

**11 moduli**: 4-4-2, 4-1-4-1, 4-4-1-1, 4-2-3-1, 3-5-2, 3-5-1-1, 4-3-3, 4-3-1-2, 3-4-3, 3-4-1-2, 3-4-2-1.

Le regole sono la **trascrizione del materiale ufficiale** «Mantra Experience — Edizione 2026/2027»: schemi dei moduli, tabella delle sostituzioni, tabella dei ruoli. Vivono in `fanta/config/mantra.json`, nella notazione degli schemi originali, così da poter essere confrontate a occhio con le immagini del regolamento.

**La tabella delle sostituzioni è la regola.** Riga = ruolo della casella da coprire, colonna = ruolo di chi la copre. Il verso conta: un difensore può coprire una punta con un malus, una punta non può coprire un difensore. Ne segue che all'asta conviene valutare un giocatore nel suo **ruolo più arretrato**, perché è quello che gli apre più caselle.

Gli esiti possibili sono **solo tre**: `OK`, `−1`, `NO`. Tre simboli dipendono però dallo schema e non solo dai due ruoli:
- `*` → `OK` se la casella elenca i due ruoli **in alternativa**, altrimenti `NO`
- `**` → `OK` se in alternativa, altrimenti `−1`
- `***` → `OK` se in alternativa, `NO` nel **4-1-4-1**, altrimenti `−1`

È la ragione per cui la valutazione di una casella riceve anche il modulo: senza, metà della tabella non sarebbe esprimibile.

**Non esistono aggravi di malus.** La tabella ha un solo livello, −1. Il `***` non è un malus più pesante: è la nota che vieta lo scambio W/T nel solo 4-1-4-1.

**Linea e stampo sono due classificazioni diverse.** La *linea* raggruppa i ruoli sul campo: difesa (`DS, DC, DD, B`), centrocampo (`E, M, C`), trequarti (`W, T`), attacco (`A, PC`). Lo *stampo* divide i 5 difensivi (`Dd, Ds, Dc, B, E, M`) dai 5 offensivi (`C, T, W, A, Pc`) che ogni schema impiega. Non coincidono: nel centrocampo convivono entrambi, con `E` e `M` difensivi e `C` offensivo. Il vincolo dei cinque e cinque è verificato come **raggiungibile** e non come già deciso, perché le caselle che mettono in alternativa ruoli di stampo diverso — come `M/C` — lasciano la scelta al fantallenatore.

Altre regole:
- Dove una casella elenca **più ruoli** (`E/W`, `M/C`, `T/A/PC`), sono alternativi: tutti senza malus
- Un giocatore con più ruoli entra col **migliore** dei suoi, non col primo dichiarato
- Il portiere non esce dalla porta e nessuno ci entra al posto suo

**In entrambe le modalità**
- La formazione è **persistente**: resta quella dell'ultima volta finché l'utente non la cambia
- Con `giornate_per_ciclo > 1`: **una sola formazione per il ciclo, con auto-adattamento tra una giornata e l'altra** (infortunati e squalificati vengono sostituiti automaticamente dalla panchina secondo le regole di sostituzione)

### 6.3 Sostituzioni automatiche (modalità Basic)

Ordine di ricerca:
1. Soluzione **perfetta** nel modulo schierato
2. Soluzione **efficiente** con un altro modulo (cambio modulo, nessun malus)
3. Soluzione **adattata**, con malus per ogni giocatore fuori posizione

Le sostituzioni seguono l'ordine di priorità della panchina. Easy e Master arriveranno dietro flag: l'algoritmo va scritto come strategia sostituibile.

L'ordine di ricerca vale per entrambe le modalità: la strategia chiede alle `RegoleSchieramento` (§6.2) se una soluzione è valida e quanto malus costa, senza sapere se sta giocando in classic o in Mantra. In `classic` il passo 3 non produce mai risultati, perché il malus di adattamento non esiste: la ricerca si ferma naturalmente al passo 2.

### 6.4 Calendario fanta

- 38 giornate di scontri diretti, allineate alle giornate del mondo simulato
- 10 squadre: 4 gironi completi (36 giornate) + **ripetizione delle prime due giornate a campi invertiti**
- Fantapunti convertiti in gol secondo le soglie configurate

### 6.5 Scambi

- Tra utenti: proposta, accettazione, storico
- **Con i bot**: i bot propongono e valutano
- Anti-exploit obbligatori: rumore nella valutazione, **margine richiesto sopra la parità**, tetto di scambi per stagione, rifiuto automatico delle proposte palesemente sbilanciate
- Mercato intra-stagione **chiuso**: solo scambi, nessun acquisto

### 6.6 Trasferimenti e rosa

- Giocatore che cambia club **dentro** la Serie A simulata: resta in rosa, cambia solo il club di appartenenza
- Giocatore che va **all'estero** `[mercato_estero]`: non più schierabile, crediti pagati rimborsati. Il rimborso è utilizzabile solo dalla finestra di fine stagione, perché il mercato intra-stagione è chiuso
- Rimpiazzo dal listone: non previsto in fase 1 `[rimpiazzo_da_listone]`

---

## 7. Bot

### 7.1 Valutazione (usata per asta futura e per gli scambi)

1. Stima dei **fantapunti attesi** sulla stagione per ogni giocatore
2. Conversione in crediti **in percentuale sul budget circolante nella lega**, mai con prezzi assoluti (l'economia è inflazionistica: +5.000 crediti l'anno)
3. Correzione per **scarsità nel ruolo Mantra**, per i buchi in rosa e per i crediti residui
4. **Personalità**: quanto sforare sugli obiettivi, quanto rumore, quanta avversione al rischio

Livello richiesto: **forti e credibili**, devono dare filo da torcere.

### 7.2 Comportamento sociale

Ogni bot ha una scheda personaggio: nome, carattere, tic linguistici. Interviene in chat solo su eventi scatenanti (sconfitta pesante, scambio rifiutato, colpo di mercato), con un tetto di messaggi al giorno.

---

## 8. Strato AI narrativo

Quattro generatori distinti, tutti eseguiti **dentro il job serale** e salvati a database. Mai generazione al caricamento della pagina.

| Generatore | Input | Tono | Volume |
|---|---|---|---|
| **Cronaca partita** | Timeline strutturata degli eventi | Giornalistico sobrio | 10 a giornata |
| **Editoriale di lega** | Risultati fanta, classifica, migliori e peggiori | Ironico | 1 a giornata |
| **Voci di mercato** | Trasferimenti futuri, parzialmente veri | Giornalistico | Finestra di fine stagione |
| **Chat dei bot** | Evento scatenante + scheda personaggio | Ironico | Con tetto giornaliero |

**Regole non negoziabili:**
- Il modello può usare **solo gli eventi forniti**. Nessun fatto inventato
- **Validazione automatica** della cronaca: punteggio e marcatori citati devono corrispondere ai dati. Se non tornano, una sola rigenerazione, poi fallback su testo da template
- **Fallback da template per ogni generatore**: se il provider è irraggiungibile, la giornata si gioca lo stesso
- Nessun contenuto che vada oltre il perimetro sportivo: niente vicende personali, scandali o dichiarazioni attribuite a persone reali

**Provider**: Groq, piano gratuito (circa 15 chiamate al giorno per lega, ampiamente dentro i limiti). L'accesso al modello passa da un'interfaccia unica, così cambiare provider è una riga di configurazione. Da evitare il piano gratuito di Gemini, i cui termini richiedono i servizi a pagamento per applicazioni rivolte a utenti nell'area europea.

---

## 9. Architettura

**Stack**: Next.js + TypeScript, Supabase (Postgres, Auth, Realtime), deploy su Vercel.

```
/engine     motore di simulazione, TypeScript puro, zero dipendenze dal framework
/fanta      livello di lega: moduli, schieramento, sostituzioni. Puro come il motore
/web        app Next.js
/jobs       job serale (ciclo), importatore, generatori AI
/seed       dati iniziali del mondo simulato
/fixtures   file reali per i test
```

`/engine` e `/fanta` stanno sui due lati del confine della **regola 7**: voti e statistiche appartengono al mondo e sono uguali per tutti, schieramenti e malus appartengono alla lega. Il motore non conosce la modalità di gioco né i crediti; il livello fanta non conosce i rating né le statistiche. Separarli in due pacchetti rende il confine una proprietà della struttura, non una buona intenzione.

**Principi:**
- Il motore è un **pacchetto isolato e deterministico**: dato lo stesso seed e lo stesso input, produce lo stesso output. Serve per i test, per la calibrazione e per dirimere le contestazioni
- RNG esplicito e seminabile, mai `Math.random()` sparso nel codice
- Il job serale è **idempotente**: eseguirlo due volte sulla stessa giornata non duplica nulla
- Autenticazione: **link magico via email**, nessuna password
- Notifiche push: non nella prima versione

**Cron**: il piano gratuito di Vercel esegue un cron al giorno, sufficiente anche con `giornate_per_ciclo > 1` perché il job cicla N giornate in sequenza. Se servisse più di un'esecuzione al giorno, l'alternativa gratuita è un workflow schedulato su GitHub Actions che chiama l'endpoint del job.

**Limiti dei piani gratuiti da conoscere**: Supabase mette in pausa i progetti inattivi (il job giornaliero li tiene svegli), spazio dell'ordine di qualche centinaio di MB (sufficiente: una stagione a 10 squadre pesa pochi MB). Piano B in caso di limiti stretti: VPS da pochi euro con Postgres e app in Docker.

### Schema dati (traccia)

- **Lega**: `leagues` (configurazione in JSONB), `league_members`, `bots`
- **Mondo**: `clubs`, `players`, `player_states` (condizione, forma, morale), `fixtures`, `matches`, `match_events`, `player_match_stats`
- **Fanta**: `fanta_teams`, `roster_players` (con crediti pagati), `lineups`, `fanta_fixtures`, `fanta_results`, `trades`
- **Stagione**: `seasons`, `standings`, `transfers`, `honours`
- **Contenuti**: `narratives`, `chat_messages`
- **Import**: `imports`, `import_rows` (con stato di riconciliazione)

---

## 10. Roadmap

0. **Seed** — ✅ *fatto*, in `/seed`. Script che converte il listone `.xlsx` in un seed JSON: esclusione dei ceduti, parsing dei ruoli Mantra, derivazione dei rating da FVM M e Qt.A M, tabella di corrispondenza sigle/nomi dei club. Piccolo e verificabile a occhio (`out/RAPPORTO.md`), è il primo pezzo da scrivere
1. **Motore + calibrazione** — ✅ *fatto*, in `/engine`. simulazione di una stagione senza interfaccia, con script che gira centinaia di stagioni e riporta media gol, distribuzione dei voti, infortuni e cartellini per squadra
2. **Schieramento** — ✅ *fatto*, in `/fanta`. I due contratti di §6.2. Prima `classic` (conteggio per ruolo, nessun malus), che è il caso semplice e mette alla prova l'interfaccia, poi la matrice ruolo × slot × modulo di `mantra`. Validazione formazione e sostituzioni Basic per entrambe
3. **Import Fantalab** — ✅ *fatto*, in `/jobs`. Parser, riconciliazione, validazioni, sui file di esempio reali. Un solo importatore per le due modalità, import atomico, copertura dei moduli in uscita
4. **Ciclo di gioco** — ✅ *fatto*. Fantavoto, modificatori e soglie gol in `/fanta`; job serale, scontri diretti e classifica in `/jobs`. L'idempotenza è per costruzione: l'esito di una giornata è funzione pura dello stato iniziale e del numero di giornata
5. **Interfaccia** — schermata formazione, risultati, classifica, rosa
6. **Bot** — valutazione e scambi
7. **Strato AI** — cronache, editoriale, chat
8. **Fine stagione** — sequenza completa con i flag di fase 1
9. **Fase 2** — asta nativa, ritiri, mercato estero, ricambio generazionale

---

## 11. Decisioni aperte

- Condizione esatta di chiusura dell'asta nativa (proposta: fase obbligatoria fino a 23 giocatori, poi possibilità di dichiarare chiusa la rosa)
- Destino dei giocatori estratti e non aggiudicati nell'asta nativa (proposta: tornano nel pool svincolati)
- Taratura fine dei pesi del voto statistico (valori di partenza in §5.6, da rifinire con lo script di calibrazione)
- Premi e verdetti di fine stagione oltre all'albo d'oro
- Gestione della sostituzione dell'admin in caso di abbandono

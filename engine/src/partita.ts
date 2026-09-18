/**
 * Motore partita (SPEC 5.5).
 *
 * Granularita': eventi aggregati per partita. La firma e' un **contratto**, non
 * un'implementazione unica: il giorno in cui servisse un motore minuto per
 * minuto si scrive un'altra funzione con la stessa firma e non si tocca nulla
 * del resto (regola 4).
 *
 * La pipeline segue la specifica, nell'ordine:
 *
 *   1. formazioni          (gia' fatte da `allenatore.ts`)
 *   2. risultato           Poisson sui gol attesi
 *   3. attribuzione        rigori, autogol, gol e assist ai giocatori in campo
 *   4. statistiche         individuali, per gruppo di ruolo
 *   5. disciplina          cartellini e infortuni
 *   6. timeline            un minuto per ogni evento
 *   7. voto statistico     in `voto.ts`
 *
 * Il punto 8, il fantavoto, **non e' qui**: appartiene alla lega, non al mondo
 * (regola 7). Questo file non sa cosa sia un bonus.
 */

import type { Giocatore } from './mondo.ts';
import type { ParametriMotore, NomeStatistica } from './configurazione.ts';
import { NOMI_STATISTICHE } from './configurazione.ts';
import type { Generatore } from './casuale.ts';
import { forzeDi, type Schieramento } from './allenatore.ts';
import { gruppoDi, type GruppoRuolo } from './ruoli.ts';

export type Statistiche = Record<NomeStatistica, number> & { minuti: number };

export type TipoEvento =
  | 'gol' | 'autogol' | 'rigoreSegnato' | 'rigoreSbagliato' | 'rigoreParato'
  | 'assist' | 'ammonizione' | 'espulsione' | 'infortunio' | 'sostituzione';

export type Evento = {
  minuto: number;
  tipo: TipoEvento;
  giocatoreId: string;
  clubId: string;
  /** Per assist e sostituzioni: l'altro giocatore coinvolto. */
  associatoId?: string;
};

export type EsitoSquadra = {
  clubId: string;
  gol: number;
  statistiche: Map<string, Statistiche>;
  minuti: Map<string, number>;
  /** Giornate di infortunio rimediate in questa partita. */
  infortuni: Map<string, number>;
  espulsi: Set<string>;
  ammoniti: Set<string>;
};

export type RisultatoPartita = {
  casa: EsitoSquadra;
  ospite: EsitoSquadra;
  eventi: Evento[];
};

export type ContestoPartita = {
  casa: Schieramento;
  ospite: Schieramento;
  parametri: ParametriMotore;
  rng: Generatore;
};

/** Il contratto. Sostituibile senza toccare il resto del motore. */
export type MotorePartita = (contesto: ContestoPartita) => RisultatoPartita;

/* ------------------------------------------------------------------ */

function statisticheVuote(): Statistiche {
  const s = { minuti: 0 } as Statistiche;
  for (const nome of NOMI_STATISTICHE) s[nome] = 0;
  return s;
}

const limita = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

/* ------------------------------------------------------------------ */
/* 2. Risultato                                                        */
/* ------------------------------------------------------------------ */

/**
 * Gol attesi da forza d'attacco contro forza di difesa, piu' il fattore campo.
 *
 * Il rapporto fra le due forze viene elevato a un esponente: e' la manopola che
 * decide quanto il campionato e' prevedibile. Esponente basso, tutti pareggiano;
 * esponente alto, le grandi vincono sempre 4-0.
 *
 * Il rapporto viene prima diviso per `rapportoDiEquilibrio`, che e' il valore
 * che assume in una partita fra due squadre medie. Senza questa normalizzazione
 * i due aggregati non sarebbero confrontabili — nascono da pesi diversi su aree
 * diverse — e `golAttesiBase` non vorrebbe dire niente: si taranno i gol a
 * partita muovendo un numero che dovrebbe significare "gol di una squadra media
 * contro una squadra media" e invece non significa nulla.
 */
export function golAttesi(
  attacco: number,
  difesa: number,
  inCasa: boolean,
  p: ParametriMotore,
): number {
  const rapporto = attacco / Math.max(1, difesa) / p.forze.rapportoDiEquilibrio;
  const campo = inCasa ? p.forze.fattoreCampo : 1 / p.forze.fattoreCampo;
  return limita(
    p.forze.golAttesiBase * rapporto ** p.forze.esponenteForza * campo,
    p.forze.golAttesiMinimi,
    p.forze.golAttesiMassimi,
  );
}

/* ------------------------------------------------------------------ */
/* 2bis. Rigori                                                        */
/* ------------------------------------------------------------------ */

/** Come e’ finito un rigore. */
export type EsitoRigore = 'segnato' | 'parato' | 'sbagliato';

/**
 * Gol su rigore attesi da una squadra in una partita.
 *
 * Servono a togliere altrettanto dai gol attesi su azione: i rigori non si
 * sommano al risultato, ne fanno parte. Senza questa sottrazione i gol a
 * partita salirebbero ogni volta che si tocca la frequenza dei rigori, che e’
 * una manopola della disciplina e non del risultato.
 */
export function golAttesiDaRigore(p: ParametriMotore): number {
  // `rigoriPerPartita` conta le due squadre insieme, qui se ne guarda una.
  return (p.disciplina.rigoriPerPartita / 2) * p.disciplina.quotaRigoriSegnati;
}

/**
 * I rigori che una squadra batte in una partita, e come vanno a finire.
 *
 * Parato o fuori, per il battitore e’ lo stesso rigore sbagliato: il
 * regolamento non distingue. A cambiare e’ solo il portiere, che il bonus lo
 * prende soltanto se lo para.
 */
export function battiRigori(p: ParametriMotore, rng: Generatore): EsitoRigore[] {
  const d = p.disciplina;
  const esiti: EsitoRigore[] = [];
  const quanti = rng.poisson(d.rigoriPerPartita / 2);
  for (let i = 0; i < quanti; i++) {
    if (rng.bernoulli(d.quotaRigoriSegnati)) esiti.push('segnato');
    else esiti.push(rng.bernoulli(d.quotaRigoriNonSegnatiParati) ? 'parato' : 'sbagliato');
  }
  return esiti;
}

/* ------------------------------------------------------------------ */
/* 4. Statistiche individuali                                          */
/* ------------------------------------------------------------------ */

/**
 * Genera le statistiche di un giocatore per i minuti che ha giocato.
 *
 * Le medie del suo gruppo di ruolo vengono scalate per i minuti e per quanto e'
 * forte rispetto alla media del campionato, poi estratte con Poisson.
 */
function generaStatistiche(
  giocatore: Giocatore,
  minuti: number,
  qualitaRelativa: number,
  p: ParametriMotore,
  rng: Generatore,
): Statistiche {
  const medie = p.statistiche[gruppoDi(giocatore)];
  const s = statisticheVuote();
  s.minuti = minuti;
  if (minuti <= 0) return s;

  const quotaTempo = minuti / 90;
  const scala = 1 + p.statistiche.influenzaRating * qualitaRelativa;

  const estrai = (nome: NomeStatistica): number => {
    const media = medie[nome] ?? 0;
    return media > 0 ? rng.poisson(media * quotaTempo * scala) : 0;
  };

  for (const nome of NOMI_STATISTICHE) {
    // Le statistiche derivate si calcolano dopo, dalle rispettive tentate.
    if (nome === 'passaggiRiusciti' || nome === 'crossRiusciti') continue;
    // Queste tre non si estraggono: vengono dai fatti della partita. I gol
    // subiti sono i gol degli avversari; i rigori parati e quelli concessi
    // sono i rigori davvero assegnati. Estrarle a parte significherebbe
    // ritrovarsi in tabella piu’ rigori concessi di quanti se ne sono battuti.
    if (nome === 'golSubiti' || nome === 'rigoriParati') continue;
    if (nome === 'rigoriConcessi') continue;
    s[nome] = estrai(nome);
  }

  // I riusciti sono una quota dei tentati, non un'estrazione indipendente:
  // altrimenti si otterrebbero piu' cross riusciti che tentati.
  const quotaPassaggi = limita((medie.quotaPassaggiRiusciti ?? 0.8) * (1 + 0.08 * qualitaRelativa), 0, 0.98);
  s.passaggiRiusciti = Math.round(s.passaggiTentati * quotaPassaggi);
  const quotaCross = limita((medie.quotaCrossRiusciti ?? 0.25) * (1 + 0.15 * qualitaRelativa), 0, 0.9);
  s.crossRiusciti = Math.round(s.crossTentati * quotaCross);

  // I tiri in porta non possono superare i tiri.
  s.tiriInPorta = Math.min(s.tiriInPorta, s.tiri);

  return s;
}

/* ------------------------------------------------------------------ */

function mediaOverall(schieramento: Schieramento): number {
  const t = schieramento.titolari;
  return t.reduce((a, g) => a + g.overall, 0) / Math.max(1, t.length);
}

/**
 * Implementazione di riferimento del motore partita.
 *
 * Deterministica: dato lo stesso contesto e lo stesso generatore, produce
 * sempre lo stesso identico risultato.
 */
export const simulaPartita: MotorePartita = ({ casa, ospite, parametri: p, rng }) => {
  const forzeCasa = forzeDi(casa, p);
  const forzeOspite = forzeDi(ospite, p);

  // I rigori si battono prima del risultato, perche’ i loro gol fanno parte
  // del risultato e non si aggiungono ad esso.
  const rigoriCasa = battiRigori(p, rng);
  const rigoriOspite = battiRigori(p, rng);

  const golDiSquadra = (
    attacco: number,
    difesa: number,
    inCasa: boolean,
    rigori: readonly EsitoRigore[],
  ): number => {
    const attesi = golAttesi(attacco, difesa, inCasa, p);
    const suAzione = rng.poisson(Math.max(0, attesi - golAttesiDaRigore(p)));
    return suAzione + rigori.filter((r) => r === 'segnato').length;
  };

  const golCasa = golDiSquadra(forzeCasa.attacco, forzeOspite.difesa, true, rigoriCasa);
  const golOspite = golDiSquadra(forzeOspite.attacco, forzeCasa.difesa, false, rigoriOspite);

  const eventi: Evento[] = [];

  const componi = (
    schieramento: Schieramento,
    gol: number,
    golAvversari: number,
  ): EsitoSquadra => {
    const esito: EsitoSquadra = {
      clubId: schieramento.clubId,
      gol,
      statistiche: new Map(),
      minuti: new Map(),
      infortuni: new Map(),
      espulsi: new Set(),
      ammoniti: new Set(),
    };

    /* --- minuti e sostituzioni ------------------------------------- */

    for (const g of schieramento.titolari) esito.minuti.set(g.id, 90);

    const quante = Math.min(
      schieramento.panchina.length,
      rng.intero(p.minuti.sostituzioniMinime, p.minuti.sostituzioniMassime),
    );
    // Esce chi ha piu' bisogno di riposo: la graduatoria e' gia' quella della
    // panchina, quindi si sceglie fra i titolari col rating effettivo piu' basso.
    const candidatiUscita = [...schieramento.titolari]
      .filter((g) => esito.minuti.get(g.id) === 90)
      .sort(
        (a, b) =>
          schieramento.effettivi.get(a.id)!.tecnica - schieramento.effettivi.get(b.id)!.tecnica,
      );

    for (let i = 0; i < quante; i++) {
      const esce = candidatiUscita[i];
      const entra = schieramento.panchina[i];
      if (!esce || !entra) break;

      const minuto = rng.intero(p.minuti.minutoPrimaSostituzione, p.minuti.minutoUltimaSostituzione);
      esito.minuti.set(esce.id, minuto);
      esito.minuti.set(entra.id, 90 - minuto);
      eventi.push({
        minuto,
        tipo: 'sostituzione',
        giocatoreId: entra.id,
        clubId: schieramento.clubId,
        associatoId: esce.id,
      });
    }

    /* --- statistiche ------------------------------------------------ */

    const media = mediaOverall(schieramento);
    const inCampo = [...esito.minuti.keys()]
      .map((id) => [...schieramento.titolari, ...schieramento.panchina].find((g) => g.id === id)!)
      .filter(Boolean);

    for (const g of inCampo) {
      const minuti = esito.minuti.get(g.id)!;
      // Quanto e' forte rispetto ai compagni, in unita' di dieci punti di
      // overall: e' la scala su cui e' tarato `influenzaRating`.
      const qualitaRelativa = limita((g.overall - media) / 10, -2, 2);
      esito.statistiche.set(g.id, generaStatistiche(g, minuti, qualitaRelativa, p, rng));
    }

    /* --- gol subiti dal portiere ------------------------------------ */

    const portiere = schieramento.titolari[0];
    if (portiere) {
      const suo = esito.statistiche.get(portiere.id);
      if (suo) {
        suo.golSubiti = golAvversari;
        // I tiri affrontati non possono essere meno dei gol subiti.
        suo.tiriAffrontati = Math.max(suo.tiriAffrontati, golAvversari);
        suo.parate = Math.max(0, suo.tiriAffrontati - golAvversari);
      }
    }

    return esito;
  };

  const esitoCasa = componi(casa, golCasa, golOspite);
  const esitoOspite = componi(ospite, golOspite, golCasa);

  /* --- 3. attribuzione: rigori, autogol, gol e assist -------------- */

  const attribuisci = (
    esito: EsitoSquadra,
    schieramento: Schieramento,
    avversari: EsitoSquadra,
    schieramentoAvversario: Schieramento,
    rigori: readonly EsitoRigore[],
  ): void => {
    const inCampo = [...schieramento.titolari, ...schieramento.panchina].filter((g) =>
      esito.minuti.has(g.id),
    );
    if (inCampo.length === 0) return;

    // Autogol e rigori concessi appartengono agli avversari: sono gol di questa
    // squadra che qualcun altro si e' fatto da solo, e falli commessi da loro.
    const inCampoAvversari = [
      ...schieramentoAvversario.titolari,
      ...schieramentoAvversario.panchina,
    ].filter((g) => avversari.minuti.has(g.id));

    const pesoGol = (g: Giocatore): number =>
      g.propensioni.gol *
      (schieramento.effettivi.get(g.id)!.attacco / 50) ** p.attribuzione.esponenteRating *
      (esito.minuti.get(g.id)! / 90);

    const pesoAssist = (g: Giocatore): number =>
      g.propensioni.assist *
      (schieramento.effettivi.get(g.id)!.tecnica / 50) ** p.attribuzione.esponenteRating *
      (esito.minuti.get(g.id)! / 90);

    // Chi sbaglia in area lo fa in proporzione a quanto ci sta: un centrale
    // deviando nella propria porta, una punta quasi mai.
    const pesoAvversario =
      (pesi: Record<GruppoRuolo, number>) =>
      (g: Giocatore): number =>
        (pesi[gruppoDi(g)] ?? 0) * (avversari.minuti.get(g.id)! / 90);

    /* --- rigori ----------------------------------------------------- */

    // Il portiere e' il primo dei titolari, come per i gol subiti.
    const portiereAvversario = schieramentoAvversario.titolari[0];

    for (const finale of rigori) {
      const battitore = rng.pesato(inCampo, pesoGol);
      const minuto = rng.intero(1, 90);

      // Ogni rigore lo ha concesso qualcuno. La statistica va a lui e non viene
      // anche estratta a parte (vedi `generaStatistiche`): cosi' i rigori
      // concessi in tabella sono esattamente i rigori battuti.
      if (inCampoAvversari.length > 0) {
        const colpevole = rng.pesato(
          inCampoAvversari,
          pesoAvversario(p.attribuzione.pesiRigoreConcesso),
        );
        const sua = avversari.statistiche.get(colpevole.id);
        if (sua) sua.rigoriConcessi += 1;
      }

      const sue = esito.statistiche.get(battitore.id);

      if (finale === 'segnato') {
        eventi.push({ minuto, tipo: 'rigoreSegnato', giocatoreId: battitore.id, clubId: esito.clubId });
        if (sue) {
          sue.tiri = Math.max(1, sue.tiri);
          sue.tiriInPorta = Math.max(1, sue.tiriInPorta);
        }
        continue;
      }

      // Parato o fuori, per il battitore e' lo stesso rigore sbagliato: il
      // regolamento non distingue, il malus e' quello. A cambiare e' solo il
      // portiere, che il bonus lo prende solo se lo para.
      eventi.push({ minuto, tipo: 'rigoreSbagliato', giocatoreId: battitore.id, clubId: esito.clubId });
      if (sue) {
        sue.tiri = Math.max(1, sue.tiri);
        if (finale === 'parato') sue.tiriInPorta = Math.max(1, sue.tiriInPorta);
      }

      if (finale === 'parato' && portiereAvversario) {
        const delPortiere = avversari.statistiche.get(portiereAvversario.id);
        if (delPortiere) {
          delPortiere.rigoriParati += 1;
          delPortiere.parate += 1;
          delPortiere.tiriAffrontati += 1;
        }
        eventi.push({
          minuto,
          tipo: 'rigoreParato',
          giocatoreId: portiereAvversario.id,
          clubId: avversari.clubId,
          associatoId: battitore.id,
        });
      }
    }

    /* --- gol su azione e autogol ------------------------------------ */

    const suRigore = rigori.filter((r) => r === 'segnato').length;

    for (let i = 0; i < esito.gol - suRigore; i++) {
      // Un autogol e' un gol di questa squadra segnato da un avversario: non ha
      // marcatore ne' assist, e il malus va a chi e' stato sfortunato.
      if (inCampoAvversari.length > 0 && rng.bernoulli(p.attribuzione.quotaAutogol)) {
        const sfortunato = rng.pesato(inCampoAvversari, pesoAvversario(p.attribuzione.pesiAutogol));
        eventi.push({
          minuto: rng.intero(1, 90),
          tipo: 'autogol',
          giocatoreId: sfortunato.id,
          // Il club e' quello di chi lo ha segnato, cioe' quello che ha subito
          // il gol: e' come lo si legge in una cronaca.
          clubId: avversari.clubId,
        });
        continue;
      }

      const marcatore = rng.pesato(inCampo, pesoGol);
      const s = esito.statistiche.get(marcatore.id)!;

      eventi.push({
        minuto: rng.intero(1, 90),
        tipo: 'gol',
        giocatoreId: marcatore.id,
        clubId: esito.clubId,
      });
      // Un gol e' anche un tiro in porta: le statistiche devono tornare.
      s.tiri = Math.max(1, s.tiri);
      s.tiriInPorta = Math.max(1, s.tiriInPorta);

      if (rng.bernoulli(p.attribuzione.quotaGolConAssist)) {
        const candidati = inCampo.filter((g) => g.id !== marcatore.id);
        if (candidati.length > 0) {
          const assistman = rng.pesato(candidati, pesoAssist);
          esito.statistiche.get(assistman.id)!.passaggiChiave += 1;
          eventi.push({
            minuto: rng.intero(1, 90),
            tipo: 'assist',
            giocatoreId: assistman.id,
            clubId: esito.clubId,
            associatoId: marcatore.id,
          });
        }
      }
    }
  };

  attribuisci(esitoCasa, casa, esitoOspite, ospite, rigoriCasa);
  attribuisci(esitoOspite, ospite, esitoCasa, casa, rigoriOspite);

  /* --- 5. disciplina e infortuni ----------------------------------- */

  const disciplina = (esito: EsitoSquadra, schieramento: Schieramento): void => {
    const d = p.disciplina;
    for (const [id, minuti] of esito.minuti) {
      const g = [...schieramento.titolari, ...schieramento.panchina].find((x) => x.id === id);
      if (!g) continue;
      const s = esito.statistiche.get(id)!;
      const quotaTempo = minuti / 90;

      if (rng.bernoulli(d.ammonizioneBase * g.propensioni.cartellino * quotaTempo)) {
        esito.ammoniti.add(id);
        eventi.push({ minuto: rng.intero(1, 90), tipo: 'ammonizione', giocatoreId: id, clubId: esito.clubId });

        if (rng.bernoulli(d.secondaAmmonizione)) {
          esito.espulsi.add(id);
          eventi.push({ minuto: rng.intero(45, 90), tipo: 'espulsione', giocatoreId: id, clubId: esito.clubId });
        }
      } else if (rng.bernoulli(d.espulsioneDiretta * quotaTempo)) {
        esito.espulsi.add(id);
        eventi.push({ minuto: rng.intero(1, 90), tipo: 'espulsione', giocatoreId: id, clubId: esito.clubId });
      }

      // La stanchezza fa male davvero: la probabilita' di infortunio cresce
      // quando la condizione e' bassa.
      const stanchezza = 1 + d.infortunioPerCondizioneBassa * (1 - schieramento.effettivi.get(id)!.fisico / 70);
      if (rng.bernoulli(d.infortunioBase * g.propensioni.infortunio * quotaTempo * Math.max(0.2, stanchezza))) {
        const durata = limita(
          Math.round(rng.poisson(d.durataInfortunio.media) || 1),
          d.durataInfortunio.minima,
          d.durataInfortunio.massima,
        );
        esito.infortuni.set(id, durata);
        eventi.push({ minuto: rng.intero(1, 90), tipo: 'infortunio', giocatoreId: id, clubId: esito.clubId });
      }

      s.falliCommessi += esito.ammoniti.has(id) ? 1 : 0;
    }
  };

  disciplina(esitoCasa, casa);
  disciplina(esitoOspite, ospite);

  /* --- 6. timeline -------------------------------------------------- */

  eventi.sort((a, b) => a.minuto - b.minuto);

  return { casa: esitoCasa, ospite: esitoOspite, eventi };
};

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
 *   3. attribuzione        gol e assist ai giocatori in campo
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
import { gruppoDi } from './ruoli.ts';

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
    if (nome === 'golSubiti' || nome === 'rigoriParati') continue;
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

  const golCasa = rng.poisson(golAttesi(forzeCasa.attacco, forzeOspite.difesa, true, p));
  const golOspite = rng.poisson(golAttesi(forzeOspite.attacco, forzeCasa.difesa, false, p));

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

  /* --- 3. attribuzione di gol e assist ----------------------------- */

  const attribuisci = (esito: EsitoSquadra, schieramento: Schieramento): void => {
    const inCampo = [...schieramento.titolari, ...schieramento.panchina].filter((g) =>
      esito.minuti.has(g.id),
    );
    if (inCampo.length === 0) return;

    const pesoGol = (g: Giocatore): number =>
      g.propensioni.gol *
      (schieramento.effettivi.get(g.id)!.attacco / 50) ** p.attribuzione.esponenteRating *
      (esito.minuti.get(g.id)! / 90);

    const pesoAssist = (g: Giocatore): number =>
      g.propensioni.assist *
      (schieramento.effettivi.get(g.id)!.tecnica / 50) ** p.attribuzione.esponenteRating *
      (esito.minuti.get(g.id)! / 90);

    for (let i = 0; i < esito.gol; i++) {
      const marcatore = rng.pesato(inCampo, pesoGol);
      const s = esito.statistiche.get(marcatore.id)!;
      const suRigore = rng.bernoulli(p.disciplina.rigoriPerPartita / Math.max(1, esito.gol) / 2);

      eventi.push({
        minuto: rng.intero(1, 90),
        tipo: suRigore ? 'rigoreSegnato' : 'gol',
        giocatoreId: marcatore.id,
        clubId: esito.clubId,
      });
      // Un gol e' anche un tiro in porta: le statistiche devono tornare.
      s.tiri = Math.max(1, s.tiri);
      s.tiriInPorta = Math.max(1, s.tiriInPorta);

      if (!suRigore && rng.bernoulli(p.attribuzione.quotaGolConAssist)) {
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

  attribuisci(esitoCasa, casa);
  attribuisci(esitoOspite, ospite);

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

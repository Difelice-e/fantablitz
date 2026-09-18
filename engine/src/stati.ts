/**
 * Stati dinamici e rating effettivo (SPEC 5.2).
 *
 * Il rating base dice quanto vale un giocatore; il rating effettivo dice quanto
 * vale **stasera**. Tre fattori lo moltiplicano, ciascuno dentro una banda
 * stretta, perche' la forma non deve trasformare un comprimario in un
 * campione: deve solo spostare un po' l'ago.
 *
 *   condizione  cala con i minuti, risale col riposo
 *   forma       passeggiata casuale con ritorno alla media, lenta
 *   morale      quasi tutto di squadra, dalla striscia di risultati
 *
 * Le coppe non si simulano ma si pagano: nelle settimane di coppa una parte
 * della rosa dei club impegnati in Europa perde condizione senza che venga
 * generata alcuna partita. E' l'effetto voluto dalla specifica: chi gioca in
 * Europa ruota di piu', e il titolare fisso di una squadra senza coppe vale di
 * piu' all'asta.
 */

import type { Aree, Giocatore, Mondo } from './mondo.ts';
import type { ParametriMotore } from './configurazione.ts';
import type { Generatore } from './casuale.ts';

export type StatoGiocatore = {
  condizione: number;
  forma: number;
  /** Giornate di squalifica ancora da scontare. */
  squalifica: number;
  /** Giornate di infortunio ancora da scontare. */
  infortunio: number;
  /** Ammonizioni accumulate verso la squalifica. */
  ammonizioni: number;
  minutiStagione: number;
};

export type StatoClub = {
  morale: number;
  /** Ultimi esiti, dal piu' recente: 'V', 'N', 'P'. */
  ultimiRisultati: string[];
};

export type Stati = {
  giocatori: Map<string, StatoGiocatore>;
  club: Map<string, StatoClub>;
};

const limita = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

export function statiIniziali(mondo: Mondo, p: ParametriMotore, rng: Generatore): Stati {
  const giocatori = new Map<string, StatoGiocatore>();
  for (const g of mondo.giocatori) {
    giocatori.set(g.id, {
      condizione: limita(
        rng.normale(p.stati.condizione.iniziale, 0.06),
        p.stati.condizione.minima,
        1,
      ),
      forma: rng.normale(0, 0.35),
      squalifica: 0,
      infortunio: 0,
      ammonizioni: 0,
      minutiStagione: 0,
    });
  }

  const club = new Map<string, StatoClub>();
  for (const c of mondo.club) club.set(c.id, { morale: 0, ultimiRisultati: [] });

  return { giocatori, club };
}

/* ------------------------------------------------------------------ */
/* Rating effettivo                                                    */
/* ------------------------------------------------------------------ */

/** Porta un valore in [-1, 1] dentro la banda moltiplicativa [1-banda, 1+banda]. */
function fattore(valore: number, banda: number): number {
  return 1 + banda * limita(valore, -1, 1);
}

/**
 * Il rating di ogni area, corretto per condizione, forma e morale.
 *
 * I tre fattori si moltiplicano fra loro ma il prodotto resta dentro la stessa
 * banda: tre fattori al massimo non devono dare +52%, altrimenti la forma
 * conterebbe piu' del talento. Si fa la media dei tre e si applica una volta.
 */
export function ratingEffettivo(
  giocatore: Giocatore,
  stato: StatoGiocatore,
  statoClub: StatoClub,
  p: ParametriMotore,
): Aree {
  const { banda, morale } = p.stati;

  const fCondizione = fattore(stato.condizione * 2 - 1, banda);
  const fForma = fattore(stato.forma, banda);
  // Il morale e' quasi tutto di squadra: la componente individuale e' la forma,
  // gia' contata sopra, quindi qui pesa poco per non contarla due volte.
  const fMorale = fattore(statoClub.morale * (1 - morale.quotaIndividuale), banda);

  const complessivo = (fCondizione + fForma + fMorale) / 3;

  return {
    attacco: giocatore.rating.attacco * complessivo,
    difesa: giocatore.rating.difesa * complessivo,
    tecnica: giocatore.rating.tecnica * complessivo,
    fisico: giocatore.rating.fisico * complessivo,
  };
}

/** Disponibile a scendere in campo: non infortunato e non squalificato. */
export function disponibile(stato: StatoGiocatore): boolean {
  return stato.infortunio <= 0 && stato.squalifica <= 0;
}

/* ------------------------------------------------------------------ */
/* Avanzamento                                                         */
/* ------------------------------------------------------------------ */

/**
 * Aggiorna condizione e forma di tutti dopo una giornata.
 *
 * `minutiGiocati` contiene solo chi e' sceso in campo; tutti gli altri
 * recuperano. Le squalifiche e gli infortuni scalano di una giornata.
 */
export function avanzaGiornata(
  mondo: Mondo,
  stati: Stati,
  minutiGiocati: ReadonlyMap<string, number>,
  contesto: { infrasettimanale: boolean; turnoDiCoppa: boolean },
  p: ParametriMotore,
  rng: Generatore,
): void {
  const c = p.stati.condizione;
  const f = p.stati.forma;

  // Chi gioca in Europa paga il turno di coppa: si consuma condizione a una
  // parte della rosa senza generare partite.
  //
  // La parte non e' casuale, ed e' il punto che fa funzionare tutto: in coppa
  // ci vanno i **migliori**, quindi sono loro ad arrivare stanchi alla partita
  // di campionato, e l'allenatore automatico li lascia fuori. Scegliendo a caso
  // si otterrebbe l'effetto opposto a quello che la specifica chiede, perche'
  // titolari e riserve perderebbero condizione insieme e la gerarchia
  // resterebbe identica: le grandi non ruoterebbero mai.
  const inEuropa = new Set<string>();
  if (contesto.turnoDiCoppa) {
    for (const club of mondo.club) {
      if (club.coppa === null) continue;
      const rosa = mondo.giocatori.filter((g) => g.clubId === club.id);
      const quanti = Math.round(rosa.length * c.quotaRosaImpegnataInEuropa);
      // Un po' di rumore sulla gerarchia: non parte sempre esattamente la
      // stessa comitiva.
      const convocati = [...rosa]
        .sort((a, b) => b.overall * (1 + 0.05 * rng.reale()) - a.overall * (1 + 0.05 * rng.reale()))
        .slice(0, quanti);
      for (const g of convocati) inEuropa.add(g.id);
    }
  }

  for (const g of mondo.giocatori) {
    const stato = stati.giocatori.get(g.id)!;

    // I piu' anziani recuperano piu' lentamente: e' la ragione per cui a fine
    // stagione il trentaseienne gioca meno del ventiquattrenne.
    const anzianita = 1 + c.influenzaEta * ((g.eta - c.etaRiferimento) / 10);
    const minuti = minutiGiocati.get(g.id) ?? 0;

    let delta = -c.costoPer90Minuti * (minuti / 90) * anzianita;
    if (minuti === 0) delta += c.recuperoPerGiornata / anzianita;
    if (contesto.infrasettimanale) delta -= c.penalitaInfrasettimanale;
    if (inEuropa.has(g.id)) delta -= c.costoImpegnoEuropeo;

    stato.condizione = limita(stato.condizione + delta, c.minima, 1);
    stato.minutiStagione += minuti;

    // Passeggiata casuale con ritorno alla media.
    stato.forma = limita(
      stato.forma * (1 - f.ritornoAllaMedia) + rng.normale(0, f.volatilita),
      -f.massima,
      f.massima,
    );

    if (stato.squalifica > 0) stato.squalifica--;
    if (stato.infortunio > 0) stato.infortunio--;
  }
}

/** Aggiorna il morale di un club dopo un risultato. */
export function registraRisultato(
  stato: StatoClub,
  golFatti: number,
  golSubiti: number,
  p: ParametriMotore,
): void {
  const m = p.stati.morale;

  let variazione: number;
  let esito: string;
  if (golFatti > golSubiti) {
    variazione = m.perVittoria;
    esito = 'V';
  } else if (golFatti === golSubiti) {
    variazione = m.perPareggio;
    esito = 'N';
  } else {
    variazione = m.perSconfitta;
    esito = 'P';
    if (golSubiti - golFatti >= m.sogliaGoleada) variazione += m.bonusGoleadaSubita;
  }

  stato.morale = limita(stato.morale * m.memoria + variazione, -1, 1);
  stato.ultimiRisultati.unshift(esito);
  if (stato.ultimiRisultati.length > 5) stato.ultimiRisultati.pop();
}

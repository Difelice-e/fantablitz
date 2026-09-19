/**
 * Evoluzione del mondo da una stagione alla successiva (SPEC 5.8 punti 4 e 6,
 * "attivo in fase 1").
 *
 * E' una funzione pura, come tutto il resto del motore (regola 3): non si
 * salva mai un "mondo invecchiato" da qualche parte. Chi ha bisogno del mondo
 * della stagione N lo ricalcola applicando questa funzione N-1 volte al mondo
 * base del seed — la stessa idempotenza della regola 6, vista dal lato
 * anagrafico invece che dai risultati.
 *
 * ## Una semplificazione dichiarata
 *
 * Il seed deriva i quattro rating d'area dall'overall con un profilo pesato
 * per ruolo (`seed/src/derivazione.ts`, `areeDaOverall`), che ha bisogno della
 * configurazione completa dei profili di ruolo. Riprodurla qui accoppierebbe
 * il motore, che deve restare autosufficiente, a una configurazione pensata
 * per la generazione una tantum del listone. Qui invece i quattro rating si
 * scalano in proporzione alla variazione dell'overall — un'approssimazione
 * dichiarata, non la stessa formula: un attaccante che cresce non diventa
 * relativamente piu' forte in difesa che in attacco, cosa che la formula del
 * seed invece garantirebbe. Da rivedere se con piu' stagioni la distribuzione
 * dei rating si sbilanciasse in modo visibile.
 */

import type { Generatore } from './casuale.ts';
import type { Aree, Giocatore, Mondo } from './mondo.ts';

export type ParametriEvoluzione = {
  versione: number;
  overall: {
    minimo: number;
    massimo: number;
    /** Frazione del divario (potenziale - overall) recuperata in una stagione, prima del picco. */
    tassoCrescita: number;
    /** Punti di overall persi per ogni anno oltre il picco, moltiplicati per gli anni di distanza. */
    tassoDeclino: number;
  };
  trasferimenti: {
    /** Frazione di giocatori che cambia club ogni stagione (trasferimenti interni, SPEC 5.8 punto 4). */
    quotaPerStagione: number;
  };
};

function esigi(condizione: boolean, messaggio: string): void {
  if (!condizione) throw new Error(`Parametri di evoluzione non validi: ${messaggio}`);
}

export function validaParametriEvoluzione(p: ParametriEvoluzione): ParametriEvoluzione {
  esigi(p.versione === 1, `versione ${p.versione} non supportata`);
  esigi(p.overall.minimo > 0, 'overall.minimo deve essere positivo');
  esigi(p.overall.massimo > p.overall.minimo, 'overall.massimo deve superare overall.minimo');
  esigi(p.overall.tassoCrescita >= 0 && p.overall.tassoCrescita <= 1, 'overall.tassoCrescita deve stare fra 0 e 1');
  esigi(p.overall.tassoDeclino >= 0, 'overall.tassoDeclino non puo’ essere negativo');
  esigi(
    p.trasferimenti.quotaPerStagione >= 0 && p.trasferimenti.quotaPerStagione <= 1,
    'trasferimenti.quotaPerStagione deve stare fra 0 e 1',
  );
  return p;
}

const limita = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));
const arrotonda = (v: number): number => Math.round(v * 10) / 10;

/**
 * Un giocatore, una stagione dopo: invecchia di un anno, l'overall si
 * avvicina al potenziale prima del picco e declina dopo, i quattro rating
 * seguono l'overall in proporzione.
 */
export function evolviGiocatore(g: Giocatore, p: ParametriEvoluzione): Giocatore {
  const eta = g.eta + 1;
  let overall: number;
  let potenziale: number;

  if (eta >= g.etaPicco) {
    const anniOltrePicco = eta - g.etaPicco + 1;
    overall = g.overall - p.overall.tassoDeclino * anniOltrePicco;
    // Chi ha passato il picco non cresce piu' (stessa regola del seed, §5.8.6).
    potenziale = overall;
  } else {
    overall = g.overall + (g.potenziale - g.overall) * p.overall.tassoCrescita;
    potenziale = g.potenziale;
  }

  overall = limita(overall, p.overall.minimo, p.overall.massimo);
  potenziale = Math.max(potenziale, overall);

  const fattoreScala = g.overall > 0 ? overall / g.overall : 1;
  const scala = (v: number): number => limita(arrotonda(v * fattoreScala), p.overall.minimo, p.overall.massimo);
  const rating: Aree = {
    attacco: scala(g.rating.attacco),
    difesa: scala(g.rating.difesa),
    tecnica: scala(g.rating.tecnica),
    fisico: scala(g.rating.fisico),
  };

  return { ...g, eta, overall: arrotonda(overall), potenziale: arrotonda(potenziale), rating };
}

/**
 * Il mondo, una stagione dopo: ogni giocatore evolve, e una piccola quota
 * cambia club (trasferimenti interni, SPEC 5.8 punto 4). Il giocatore resta
 * lo stesso — stesso id, stesso nome, stessa rosa fanta che lo possiede
 * (SPEC 6.6): cambia solo la squadra del mondo simulato per cui gioca.
 *
 * Il generatore decide sia chi si trasferisce sia dove: e' l'unico punto non
 * deterministico della funzione, ed e' per questo che arriva come dipendenza
 * esplicita (regola 3) invece di un `Math.random()`.
 */
export function evolviMondo(mondo: Mondo, p: ParametriEvoluzione, rng: Generatore): Mondo {
  const evoluti = mondo.giocatori.map((g) => evolviGiocatore(g, p));
  const idClub = mondo.club.map((c) => c.id);

  const numeroTrasferimenti = Math.round(evoluti.length * p.trasferimenti.quotaPerStagione);
  const trasferitiId = new Set(rng.mescola(evoluti).slice(0, numeroTrasferimenti).map((g) => g.id));

  const giocatori = evoluti.map((g) => {
    if (!trasferitiId.has(g.id) || idClub.length < 2) return g;
    const altriClub = idClub.filter((id) => id !== g.clubId);
    const nuovoClub = altriClub[rng.intero(0, altriClub.length - 1)]!;
    return { ...g, clubId: nuovoClub };
  });

  return { ...mondo, giocatori };
}

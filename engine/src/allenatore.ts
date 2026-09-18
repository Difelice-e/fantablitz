/**
 * Allenatore automatico dei club simulati (SPEC 5.4).
 *
 * Attenzione a non confondere questo con lo schieramento della lega fanta: qui
 * si decide chi scende in campo nel **mondo simulato**, e i moduli sono quelli
 * del calcio vero. I ruoli Mantra e i moduli della lega vivono altrove e non
 * c'entrano nulla.
 *
 * La politica e' semplice e volutamente leggibile: si sceglie il modulo che la
 * rosa disponibile copre meglio, poi per ogni reparto si prendono i migliori
 * per una graduatoria che mescola bravura e condizione. Un po' di rumore evita
 * che la formazione sia identica per tutta la stagione.
 */

import type { Giocatore, MondoIndicizzato } from './mondo.ts';
import type { ParametriMotore, Modulo } from './configurazione.ts';
import type { Generatore } from './casuale.ts';
import { disponibile, ratingEffettivo, type Stati } from './stati.ts';
import { repartoDi, type Reparto } from './ruoli.ts';

export type Schieramento = {
  clubId: string;
  modulo: Modulo;
  /** Gli undici titolari, portiere per primo. */
  titolari: Giocatore[];
  /** La panchina, in ordine di probabilita' d'ingresso. */
  panchina: Giocatore[];
  /** Rating effettivo di ciascun convocato, calcolato una volta sola. */
  effettivi: Map<string, ReturnType<typeof ratingEffettivo>>;
};

/**
 * Quanto vale un giocatore per l'allenatore stasera: la sua bravura corretta
 * per la condizione, con un pizzico di rumore.
 */
function valore(
  g: Giocatore,
  condizione: number,
  p: ParametriMotore,
  rng: Generatore,
): number {
  const peso = p.allenatore.pesoCondizioneNellaScelta;
  const rumore = 1 + p.allenatore.rumoreGerarchia * (rng.reale() * 2 - 1);
  return g.overall * (1 - peso + peso * condizione) * rumore;
}

/** Quanti uomini prevede il modulo per ciascun reparto. */
function quotaDi(modulo: Modulo, reparto: Reparto): number {
  switch (reparto) {
    case 'portiere': return 1;
    case 'difesa': return modulo.difensori;
    case 'centrocampo': return modulo.centrocampisti;
    case 'attacco': return modulo.attaccanti;
  }
}

export function schiera(
  clubId: string,
  mondo: MondoIndicizzato,
  stati: Stati,
  p: ParametriMotore,
  rng: Generatore,
): Schieramento {
  const rosa = mondo.rosaPerClub.get(clubId) ?? [];
  const arruolabili = rosa.filter((g) => disponibile(stati.giocatori.get(g.id)!));

  if (arruolabili.length < 11) {
    throw new Error(
      `${mondo.clubPerId.get(clubId)?.nome ?? clubId}: solo ${arruolabili.length} giocatori ` +
        'disponibili, non bastano per scendere in campo.',
    );
  }

  const perReparto = new Map<Reparto, Giocatore[]>([
    ['portiere', []], ['difesa', []], ['centrocampo', []], ['attacco', []],
  ]);
  const graduatoria = new Map<string, number>();
  for (const g of arruolabili) {
    const stato = stati.giocatori.get(g.id)!;
    graduatoria.set(g.id, valore(g, stato.condizione, p, rng));
    perReparto.get(repartoDi(g))!.push(g);
  }
  for (const gruppo of perReparto.values()) {
    gruppo.sort((a, b) => graduatoria.get(b.id)! - graduatoria.get(a.id)!);
  }

  // Si prende il modulo che la rosa disponibile copre meglio: se mancano tre
  // difensori per infortunio, non ha senso insistere col 5-3-2.
  const moduli = p.allenatore.moduli;
  const copertura = (m: Modulo): number => {
    let punteggio = 0;
    for (const reparto of ['difesa', 'centrocampo', 'attacco'] as const) {
      const disponibili = perReparto.get(reparto)!;
      const servono = quotaDi(m, reparto);
      // Somma dei valori dei migliori, meno una penalita' per ogni casella che
      // andrebbe riempita con un adattato.
      const presi = disponibili.slice(0, servono);
      punteggio += presi.reduce((a, g) => a + graduatoria.get(g.id)!, 0);
      punteggio -= (servono - presi.length) * 200;
    }
    return punteggio;
  };
  const modulo = [...moduli].sort((a, b) => copertura(b) - copertura(a))[0]!;

  /* --- titolari ----------------------------------------------------- */

  const titolari: Giocatore[] = [];
  const presi = new Set<string>();

  const prendi = (reparto: Reparto, quanti: number): void => {
    for (const g of perReparto.get(reparto)!) {
      if (titolari.length >= 11 || quanti <= 0) break;
      if (presi.has(g.id)) continue;
      titolari.push(g);
      presi.add(g.id);
      quanti--;
    }
  };

  prendi('portiere', 1);
  prendi('difesa', modulo.difensori);
  prendi('centrocampo', modulo.centrocampisti);
  prendi('attacco', modulo.attaccanti);

  // Se un reparto era corto, si completa con i migliori rimasti: meglio un
  // adattato che giocare in dieci.
  if (titolari.length < 11) {
    const rimasti = arruolabili
      .filter((g) => !presi.has(g.id))
      .sort((a, b) => graduatoria.get(b.id)! - graduatoria.get(a.id)!);
    for (const g of rimasti) {
      if (titolari.length >= 11) break;
      titolari.push(g);
      presi.add(g.id);
    }
  }

  const panchina = arruolabili
    .filter((g) => !presi.has(g.id))
    .sort((a, b) => graduatoria.get(b.id)! - graduatoria.get(a.id)!);

  /* --- rating effettivi --------------------------------------------- */

  const statoClub = stati.club.get(clubId)!;
  const effettivi = new Map<string, ReturnType<typeof ratingEffettivo>>();
  for (const g of [...titolari, ...panchina]) {
    effettivi.set(g.id, ratingEffettivo(g, stati.giocatori.get(g.id)!, statoClub, p));
  }

  return { clubId, modulo, titolari, panchina, effettivi };
}

/* ------------------------------------------------------------------ */

/**
 * Forza dei due reparti di una squadra schierata.
 *
 * Si misura sugli undici in campo, non sulla rosa: una grande squadra che ruota
 * pesantemente deve essere piu' debole quella sera, altrimenti il turnover non
 * avrebbe conseguenze e i turni infrasettimanali non servirebbero a nulla.
 */
export function forzeDi(
  schieramento: Schieramento,
  p: ParametriMotore,
): { attacco: number; difesa: number } {
  const media = (voci: Giocatore[], quale: 'attacco' | 'difesa' | 'tecnica'): number => {
    if (voci.length === 0) return 50;
    return voci.reduce((a, g) => a + schieramento.effettivi.get(g.id)![quale], 0) / voci.length;
  };

  const perReparto = (reparto: Reparto): Giocatore[] =>
    schieramento.titolari.filter((g) => repartoDi(g) === reparto);

  const portiere = perReparto('portiere');
  const difensori = perReparto('difesa');
  const centrocampo = perReparto('centrocampo');
  const attaccanti = perReparto('attacco');

  const a = p.forze.attacco;
  const d = p.forze.difesa;

  return {
    attacco:
      a.pesoPunte * media(attaccanti, 'attacco') +
      a.pesoCentrocampo * media(centrocampo, 'tecnica') +
      a.pesoDifesa * media(difensori, 'attacco'),
    difesa:
      d.pesoDifensori * media(difensori, 'difesa') +
      d.pesoPortiere * media(portiere, 'difesa') +
      d.pesoCentrocampo * media(centrocampo, 'difesa'),
  };
}

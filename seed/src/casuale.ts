/**
 * Casualita' deterministica.
 *
 * Regola architetturale: `Math.random()` non compare mai. Ogni valore estratto
 * discende da un seme esplicito, quindi due esecuzioni con lo stesso seme
 * producono lo stesso seed, byte per byte.
 *
 * Il seme di ogni giocatore e' derivato dal suo identificativo: cosi' aggiungere
 * o togliere un giocatore dal listone non sposta l'eta' di tutti gli altri.
 */

import { createHash } from 'node:crypto';

export type Generatore = {
  /** Reale uniforme in [0, 1). */
  reale(): number;
  /** Intero uniforme in [min, max], estremi inclusi. */
  intero(min: number, max: number): number;
  /** Normale, troncata a +/- 3 deviazioni per evitare code assurde. */
  normale(media: number, deviazione: number): number;
};

const SEPARATORE = String.fromCharCode(31); // separatore di unita', non compare nei dati

/** Primi 32 bit dello SHA-256 delle parti, come intero senza segno. */
export function seme(...parti: (string | number)[]): number {
  return createHash('sha256').update(parti.join(SEPARATORE)).digest().readUInt32BE(0);
}

/** Identificativo opaco e stabile, derivato dalle parti fornite. */
export function identificativo(prefisso: string, ...parti: (string | number)[]): string {
  const h = createHash('sha256').update(parti.join(SEPARATORE)).digest('hex');
  return `${prefisso}${h.slice(0, 10)}`;
}

/**
 * mulberry32: generatore a 32 bit, poche righe e ottima distribuzione.
 * Non e' crittografico e non deve esserlo: serve solo riproducibilita'.
 */
export function generatore(semeIniziale: number): Generatore {
  let stato = semeIniziale >>> 0;

  const reale = (): number => {
    stato = (stato + 0x6d2b79f5) >>> 0;
    let t = stato;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    reale,
    intero: (min, max) => min + Math.floor(reale() * (max - min + 1)),
    normale: (media, deviazione) => {
      // Box-Muller. Il logaritmo di zero non esiste: si riparte.
      let u = reale();
      while (u === 0) u = reale();
      const v = reale();
      const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      return media + deviazione * Math.max(-3, Math.min(3, z));
    },
  };
}

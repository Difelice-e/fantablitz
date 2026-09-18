/**
 * Conversione dei fantapunti in gol (SPEC 4).
 *
 * Le soglie classiche sono 66, 72, 77, 81, 85, 89, 93, 97, 101, 105 e poi ogni
 * 4. Non sono scritte a mano: si generano da una soglia base e da una sequenza
 * di scarti, l'ultimo dei quali si ripete all'infinito. Con base 66 e scarti
 * 6, 5, 4 escono esattamente quelle.
 *
 * Generarle invece di elencarle serve a due cose: non esiste un ultimo gol
 * possibile, e cambiare la scala della lega e' questione di tre numeri invece
 * che di una tabella da riscrivere.
 */

import type { ConfigurazioneLega } from './fantavoto.ts';

export type ConfigurazioneSoglie = ConfigurazioneLega['soglieGol'];

/**
 * La soglia necessaria per segnare l'ennesimo gol, a partire da 1.
 *
 * `soglia(1)` e' la soglia base. Gli scarti si consumano in ordine e poi
 * l'ultimo si ripete: con 6, 5, 4 si sale di 6, poi di 5, poi di 4 per sempre.
 */
export function soglia(numeroGol: number, c: ConfigurazioneSoglie): number {
  if (numeroGol < 1) throw new Error(`Il numero di gol parte da 1, ricevuto ${numeroGol}`);

  let valore = c.base;
  for (let i = 1; i < numeroGol; i++) {
    const scarto = c.scarti[Math.min(i - 1, c.scarti.length - 1)]!;
    valore += scarto;
  }
  return valore;
}

/** Le prime `quanti` soglie, utile per mostrarle all'utente e per i test. */
export function soglie(quanti: number, c: ConfigurazioneSoglie): number[] {
  return Array.from({ length: quanti }, (_, i) => soglia(i + 1, c));
}

/**
 * I gol segnati con un dato punteggio.
 *
 * Sotto la soglia base sono zero: si perde 0-0 anche con 65 punti, ed e' voluto
 * dalla specifica. Il conteggio e' inclusivo, quindi 66 punti esatti valgono
 * gia' un gol.
 */
export function golDaFantapunti(fantapunti: number, c: ConfigurazioneSoglie): number {
  if (!Number.isFinite(fantapunti) || fantapunti < c.base) return 0;

  let gol = 0;
  let prossima = c.base;
  let i = 0;
  while (fantapunti >= prossima) {
    gol++;
    prossima += c.scarti[Math.min(i, c.scarti.length - 1)]!;
    i++;
  }
  return gol;
}

/** Quanti punti mancano al gol successivo. Serve a raccontare la giornata. */
export function puntiAlProssimoGol(fantapunti: number, c: ConfigurazioneSoglie): number {
  const prossima = soglia(golDaFantapunti(fantapunti, c) + 1, c);
  return Math.max(0, Math.round((prossima - fantapunti) * 100) / 100);
}

/** Aiutanti condivisi dai test del livello fanta. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { regoleClassic, type ConfigurazioneClassic } from '../src/classic.ts';
import type { Formazione, RuoloClassico, RuoloMantra, Schierabile } from '../src/tipi.ts';

export const configurazioneClassic = JSON.parse(
  readFileSync(fileURLToPath(new URL('../config/classic.json', import.meta.url)), 'utf8'),
) as ConfigurazioneClassic;

export const classic = regoleClassic(configurazioneClassic);

/** Un giocatore finto, con ruoli coerenti fra classico e Mantra. */
export function g(
  id: string,
  ruoloClassico: RuoloClassico,
  ruoliMantra?: RuoloMantra[],
): Schierabile {
  const predefiniti: Record<RuoloClassico, RuoloMantra[]> = {
    P: ['Por'], D: ['Dc'], C: ['C'], A: ['Pc'],
  };
  return { id, ruoloClassico, ruoliMantra: ruoliMantra ?? predefiniti[ruoloClassico] };
}

/** Una rosa classic regolamentare: 3 portieri, 8 difensori, 8 centrocampisti, 6 attaccanti. */
export function rosaClassic(): Schierabile[] {
  const rosa: Schierabile[] = [];
  const quote: [RuoloClassico, number][] = [['P', 3], ['D', 8], ['C', 8], ['A', 6]];
  for (const [ruolo, quanti] of quote) {
    for (let i = 1; i <= quanti; i++) rosa.push(g(`${ruolo}${i}`, ruolo));
  }
  return rosa;
}

/**
 * Costruisce una formazione riempiendo gli slot in ordine con i primi
 * giocatori adatti della rosa.
 */
export function formazioneDa(
  modulo: string,
  rosa: readonly Schierabile[],
  regole = classic,
): Formazione {
  const m = regole.modulo(modulo);
  if (!m) throw new Error(`Modulo ${modulo} inesistente`);

  const titolari = new Map<string, string>();
  const presi = new Set<string>();
  for (const slot of m.slot) {
    const scelto = rosa.find((x) => !presi.has(x.id) && regole.valuta(x, slot, m).ammesso);
    if (!scelto) throw new Error(`Nessun giocatore per la casella ${slot.id} nel modulo ${modulo}`);
    titolari.set(slot.id, scelto.id);
    presi.add(scelto.id);
  }

  return {
    modulo,
    titolari,
    panchina: rosa.filter((x) => !presi.has(x.id)).map((x) => x.id),
  };
}

/** Caricamento condiviso per i test dell'importatore. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { regoleClassic, type ConfigurazioneClassic } from '../../fanta/src/classic.ts';
import { regoleMantra, type ConfigurazioneMantra } from '../../fanta/src/mantra.ts';
import { contestoDaSeed, type Contesto, type RiferimentiEsterni } from '../src/importa.ts';

const leggi = (percorso: string): string =>
  readFileSync(fileURLToPath(new URL(percorso, import.meta.url)), 'utf8');

const json = (percorso: string): any => JSON.parse(leggi(percorso));

/** I due export reali, che sono le fixture volute da CLAUDE.md. */
export const roseCompleto = leggi('../../fixtures/rose.csv');
export const roseMinimale = leggi('../../fixtures/file_per_fantaleghe.csv');

export const mondo = json('../../seed/out/mondo.json');
export const riferimenti = json('../../seed/out/riferimenti-esterni.json') as RiferimentiEsterni;

export const classic = regoleClassic(json('../../fanta/config/classic.json') as ConfigurazioneClassic);
export const mantra = regoleMantra(json('../../fanta/config/mantra.json') as ConfigurazioneMantra);

export const BUDGET = 500;

export function contesto(modalita: 'classic' | 'mantra' = 'classic', extra: Partial<Contesto> = {}): Contesto {
  return {
    ...contestoDaSeed(mondo, riferimenti, modalita === 'classic' ? classic : mantra, {
      budget: BUDGET,
    }),
    ...extra,
  };
}

/** Riscrive una riga del csv completo, per costruire i casi limite. */
export function conRigaSostituita(contenuto: string, numero: number, nuova: string): string {
  const righe = contenuto.split('\r\n');
  righe[numero - 1] = nuova;
  return righe.join('\r\n');
}

/** Prende una riga del csv completo. */
export function riga(contenuto: string, numero: number): string {
  return contenuto.split('\r\n')[numero - 1]!;
}

/**
 * Raggruppamento dei dodici ruoli Mantra in sei famiglie.
 *
 * E' lo stesso raggruppamento che la specifica usa per i pesi del voto
 * statistico (SPEC 5.6), e non e' un caso: un difensore centrale non si valuta
 * sulla stessa base dati di un attaccante, e non produce nemmeno le stesse
 * statistiche. Usare una sola tassonomia per generare le statistiche e per
 * pesarle evita che le due si disallineino in calibrazione.
 */

import type { Giocatore, RuoloMantra } from './mondo.ts';

export const GRUPPI_RUOLO = ['por', 'centrale', 'laterale', 'mediano', 'offensivo', 'punta'] as const;
export type GruppoRuolo = (typeof GRUPPI_RUOLO)[number];

const PER_RUOLO: Record<RuoloMantra, GruppoRuolo> = {
  Por: 'por',
  Dc: 'centrale',
  B: 'centrale',
  Dd: 'laterale',
  Ds: 'laterale',
  E: 'laterale',
  M: 'mediano',
  C: 'mediano',
  W: 'offensivo',
  T: 'offensivo',
  A: 'offensivo',
  Pc: 'punta',
};

/** Il gruppo del ruolo principale, cioe' del primo dichiarato nel listone. */
export function gruppoDi(giocatore: Giocatore): GruppoRuolo {
  return PER_RUOLO[giocatore.ruoliMantra[0]!];
}

export function gruppoDelRuolo(ruolo: RuoloMantra): GruppoRuolo {
  return PER_RUOLO[ruolo];
}

/**
 * Reparto di schieramento, usato dall'allenatore automatico del club.
 *
 * E' una lettura piu' grossolana del gruppo: serve solo a sapere quanti uomini
 * mettere dietro, in mezzo e davanti. Non ha niente a che vedere con i ruoli
 * della lega fanta, che vivono da tutt'altra parte.
 */
export type Reparto = 'portiere' | 'difesa' | 'centrocampo' | 'attacco';

const REPARTO_DI_GRUPPO: Record<GruppoRuolo, Reparto> = {
  por: 'portiere',
  centrale: 'difesa',
  laterale: 'difesa',
  mediano: 'centrocampo',
  offensivo: 'attacco',
  punta: 'attacco',
};

export function repartoDi(giocatore: Giocatore): Reparto {
  return REPARTO_DI_GRUPPO[gruppoDi(giocatore)];
}

/**
 * Tipi del livello fanta.
 *
 * Questo pacchetto sta dall'altra parte del confine rispetto a `/engine`: qui
 * vivono le regole della lega, non quelle del mondo simulato. Voti e
 * statistiche appartengono al mondo e sono uguali per tutti; schieramenti,
 * bonus e malus appartengono alla lega (regola 7).
 *
 * Il pacchetto e' puro come il motore: nessuna dipendenza da Next.js, da
 * Supabase o dalla rete.
 */

export const RUOLI_MANTRA = [
  'Por', 'Dc', 'B', 'Dd', 'Ds', 'E', 'M', 'C', 'W', 'T', 'A', 'Pc',
] as const;
export type RuoloMantra = (typeof RUOLI_MANTRA)[number];

export const RUOLI_CLASSICI = ['P', 'D', 'C', 'A'] as const;
export type RuoloClassico = (typeof RUOLI_CLASSICI)[number];

export const MODALITA = ['classic', 'mantra'] as const;
export type Modalita = (typeof MODALITA)[number];

/**
 * Il minimo che serve sapere di un giocatore per schierarlo.
 *
 * Volutamente ristretto: il livello fanta non ha bisogno di rating, eta' o
 * propensioni, e non deve poterli guardare. Un `Giocatore` del motore soddisfa
 * questa forma senza che i due pacchetti si conoscano.
 */
export type Schierabile = {
  id: string;
  ruoloClassico: RuoloClassico;
  ruoliMantra: readonly RuoloMantra[];
};

/** Una casella del modulo. */
export type Slot = {
  /** Identificativo stabile dentro il modulo, es. "D2" o "C1". */
  id: string;
  /** Reparto di appartenenza, per l'ordinamento e per la modalita' classic. */
  reparto: RuoloClassico;
};

export type Modulo = {
  /** Come lo chiamano i giocatori: "3-4-3", "4-2-3-1". */
  nome: string;
  slot: Slot[];
};

/**
 * Esito della domanda "questo giocatore puo' occupare questo slot?".
 *
 * `costo` e' misurato in **unita' di adattamento**, non in punti di fantavoto:
 * 0 significa al proprio posto, 1 un adattamento. Il regolamento Mantra prevede
 * un solo livello di malus, quindi oggi i valori usati sono solo questi due,
 * ma il tipo resta numerico per non doverlo cambiare se un giorno servisse.
 *
 * La conversione in punti e' del fantavoto ed e' un parametro di lega: col
 * malus a -1 il cambio e' uno a uno, ma tenerli separati significa che
 * ritoccare il malus non tocca l'algoritmo di schieramento.
 */
export type EsitoSlot = { ammesso: boolean; costo: number };

export const NON_AMMESSO: EsitoSlot = { ammesso: false, costo: Number.POSITIVE_INFINITY };
export const PERFETTO: EsitoSlot = { ammesso: true, costo: 0 };

/** Una formazione schierata: chi occupa quale slot, piu' la panchina ordinata. */
export type Formazione = {
  modulo: string;
  /** slotId -> id del giocatore. */
  titolari: Map<string, string>;
  /** Ordine di priorita' d'ingresso, il primo entra per primo. */
  panchina: string[];
};

export type Problema = {
  tipo: 'rosa' | 'formazione' | 'slot';
  messaggio: string;
};

/**
 * Livello della soluzione trovata, nell'ordine di ricerca previsto da SPEC 6.3.
 * Serve anche a spiegare all'utente perche' la sua formazione e' cambiata.
 */
export const LIVELLI = ['perfetta', 'efficiente', 'adattata', 'incompleta'] as const;
export type Livello = (typeof LIVELLI)[number];

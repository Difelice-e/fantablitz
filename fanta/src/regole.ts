/**
 * Il contratto delle regole di schieramento.
 *
 * E' uno dei due contratti ortogonali di SPEC 6.2, e il piu' importante da
 * tenere pulito:
 *
 *   `RegoleSchieramento`   dipende dalla **modalita'**: quali moduli esistono,
 *                          chi puo' occupare quale casella, con quale costo
 *   `StrategiaSostituzione` dipende dal **livello** (Basic, poi Easy e Master):
 *                          come si cerca il rimpiazzo
 *
 * Tenerli separati significa che le due modalita' e i tre livelli si combinano
 * senza duplicare codice: due piu' tre implementazioni invece di due per tre.
 * La strategia Basic funziona su entrambe le modalita' senza sapere quale sta
 * usando, perche' si limita a chiedere alle regole se una soluzione e' valida e
 * quanto costa.
 */

import type { EsitoSlot, Modalita, Modulo, Problema, Schierabile, Slot } from './tipi.ts';

export type RegoleSchieramento = {
  modalita: Modalita;

  /** I moduli schierabili in questa modalita'. */
  moduli: readonly Modulo[];

  /** Un modulo per nome, oppure `undefined` se non esiste in questa modalita'. */
  modulo(nome: string): Modulo | undefined;

  /**
   * Questo giocatore puo' occupare questa casella di questo modulo?
   *
   * Il modulo entra nella domanda perche' il regolamento Mantra ha eccezioni
   * che dipendono dal modulo: W e T sono intercambiabili con aggravio di
   * malus, tranne nel 4-1-4-1 dove non lo sono nemmeno con malus.
   */
  valuta(giocatore: Schierabile, slot: Slot, modulo: Modulo): EsitoSlot;

  /** La rosa rispetta la composizione richiesta dalla modalita'? */
  validaRosa(rosa: readonly Schierabile[]): Problema[];
};

/** Comodita': gli slot di un modulo raggruppati per reparto. */
export function slotPerReparto(modulo: Modulo): Map<string, Slot[]> {
  const gruppi = new Map<string, Slot[]>();
  for (const slot of modulo.slot) {
    const gruppo = gruppi.get(slot.reparto);
    if (gruppo) gruppo.push(slot);
    else gruppi.set(slot.reparto, [slot]);
  }
  return gruppi;
}

/**
 * Costruisce gli slot di un modulo dalle sue quote per reparto.
 *
 * Gli identificativi sono stabili (`P1`, `D1`, `D2`, ...) perche' la formazione
 * e' persistente: resta quella dell'ultima volta finche' l'utente non la
 * cambia, quindi gli slot devono avere un nome che non cambia fra una giornata
 * e l'altra.
 */
export function slotDaQuote(quote: { D: number; C: number; A: number }): Slot[] {
  const slot: Slot[] = [{ id: 'P1', reparto: 'P' }];
  for (const reparto of ['D', 'C', 'A'] as const) {
    for (let i = 1; i <= quote[reparto]; i++) slot.push({ id: `${reparto}${i}`, reparto });
  }
  return slot;
}

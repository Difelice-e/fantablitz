/**
 * La scheda personaggio di un bot in chat (SPEC 7.2): carattere e tic
 * linguistico, non il suo comportamento di mercato — quello resta in
 * `valutazione.ts` (`personalitaBot`), che serve a decidere, non a parlare.
 *
 * Nome del personaggio non ce n'e' uno separato: il bot *e'* la squadra, e il
 * suo nome e' quello che arriva dall'import (regola 1: i nomi sono dati).
 */

import { generatore, seme } from '../../engine/src/casuale.ts';

export type ConfigurazioneChat = {
  versione: number;
  tettoMessaggiAlGiorno: number;
  sogliaSconfittaPesante: number;
  caratteri: string[];
  tic: string[];
};

function esigi(condizione: boolean, messaggio: string): void {
  if (!condizione) throw new Error(`Configurazione della chat non valida: ${messaggio}`);
}

export function validaConfigurazioneChat(c: ConfigurazioneChat): ConfigurazioneChat {
  esigi(c.versione === 1, `versione ${c.versione} non supportata`);
  esigi(c.tettoMessaggiAlGiorno >= 1, 'tettoMessaggiAlGiorno deve essere almeno 1');
  esigi(c.sogliaSconfittaPesante > 0, 'sogliaSconfittaPesante deve essere positiva');
  esigi(c.caratteri.length > 0, 'serve almeno un carattere');
  esigi(c.tic.length > 0, 'serve almeno un tic linguistico');
  return c;
}

export type SchedaPersonaggio = { carattere: string; tic: string };

/**
 * La scheda di un bot: stabile per tutta la stagione perche' seminata su
 * (seme di lega, squadra), non su un orologio — lo stesso bot ha sempre lo
 * stesso carattere, come `personalitaBot` per gli scambi.
 */
export function schedaPersonaggio(
  squadraId: string,
  semeLega: string,
  config: ConfigurazioneChat,
): SchedaPersonaggio {
  const g = generatore(seme(semeLega, squadraId, 'personaggio-chat'));
  return {
    carattere: config.caratteri[g.intero(0, config.caratteri.length - 1)]!,
    tic: config.tic[g.intero(0, config.tic.length - 1)]!,
  };
}

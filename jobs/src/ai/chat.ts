/**
 * Messaggio di chat di un bot, reazione a un evento scatenante (SPEC 7.2).
 *
 * Non ha la validazione stretta della cronaca: e' una battuta di un
 * personaggio, non un resoconto di fatti da verificare. Ha comunque il
 * fallback da template, come ogni generatore.
 */

import type { EventoChat, FonteTesto } from '../archivio.ts';
import type { ProviderAI } from './provider.ts';

export type DatiMessaggioChat = {
  squadra: string;
  carattere: string;
  tic: string;
  evento: EventoChat;
  /** Il fatto concreto da commentare, gia' in forma leggibile: es. "ha perso 40.0 a 90.5 contro Rossi". */
  dettaglio: string;
};

export type EsitoMessaggioChat = { testo: string; fonte: FonteTesto };

const ISTRUZIONI = [
  'Scrivi UN messaggio breve (una frase, al massimo due) per la chat di una',
  'lega privata di fantacalcio fra amici, su un campionato di fantasia.',
  'Interpreta un personaggio con questo carattere: {carattere}.',
  'Tic linguistico da usare, se ci sta naturale: {tic}.',
  'Tono ironico. Usa SOLO il fatto che ti viene dato, non inventarne altri.',
  'Niente vicende personali, scandali o dichiarazioni attribuite a persone',
  'reali: resta nel perimetro del gioco. Scrivi solo il messaggio, senza',
  'virgolette e senza firmarlo.',
].join(' ');

function prompt(dati: DatiMessaggioChat): string {
  const istruzioni = ISTRUZIONI.replace('{carattere}', dati.carattere).replace('{tic}', dati.tic);
  return `${istruzioni}\n\nFatto da commentare: ${dati.squadra} ${dati.dettaglio}.`;
}

const TEMPLATE: Record<EventoChat, (dati: DatiMessaggioChat) => string> = {
  sconfittaPesante: (d) => `${d.squadra}: ${d.dettaglio}. Ci può stare, ogni tanto.`,
  scambioRifiutato: (d) => `${d.squadra}: ${d.dettaglio}. Vabbè, sarà per la prossima.`,
  colpoDiMercato: (d) => `${d.squadra}: ${d.dettaglio}. Operazione di mercato conclusa.`,
};

export async function generaMessaggioChat(
  dati: DatiMessaggioChat,
  provider: ProviderAI | null,
): Promise<EsitoMessaggioChat> {
  if (provider) {
    try {
      const testo = await provider.genera([{ ruolo: 'user', testo: prompt(dati) }]);
      if (testo.trim().length > 0) return { testo, fonte: 'ai' };
    } catch {
      // Il provider non risponde: si passa al template.
    }
  }
  return { testo: TEMPLATE[dati.evento](dati), fonte: 'template' };
}

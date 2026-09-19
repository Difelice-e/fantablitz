/**
 * Voci di mercato (SPEC 8): un pezzo alla finestra di fine stagione, sui
 * trasferimenti interni appena decisi per la stagione che sta per iniziare.
 *
 * Una semplificazione dichiarata: SPEC 8 le vuole "parzialmente vere", ma qui
 * raccontano trasferimenti gia' decisi (`trasferimentiDellaStagione`), non
 * mescolati a movimenti inventati che poi non si avverano. Costruire un
 * meccanismo di voci deliberatamente sbagliate a meta' e' un pezzo in piu' e
 * non l'essenziale del generatore: si puo' aggiungere in un secondo momento
 * senza toccare il resto.
 */

import type { FonteTesto } from '../archivio.ts';
import type { ProviderAI } from './provider.ts';

export type DatiVociMercato = {
  /** La stagione che sta per iniziare (non quella appena chiusa). */
  stagione: number;
  trasferimenti: { giocatore: string; daClub: string; aClub: string }[];
};

export type EsitoVociMercato = { testo: string; fonte: FonteTesto };

const ISTRUZIONI = [
  'Sei un giornalista di mercato per una lega privata di fantacalcio fra',
  'amici, su un campionato interamente simulato e di fantasia. Scrivi in',
  'italiano, tono giornalistico, un unico pezzo di 3-5 frasi sui movimenti di',
  'mercato in vista della nuova stagione. Usa SOLO i trasferimenti forniti,',
  'non inventarne altri. Niente vicende personali, scandali o dichiarazioni',
  'attribuite a persone reali: resta nel perimetro sportivo.',
].join(' ');

function prompt(dati: DatiVociMercato): string {
  const righe = dati.trasferimenti.map((t) => `${t.giocatore}: da ${t.daClub} a ${t.aClub}`);
  return [
    `Stagione ${dati.stagione}, movimenti di mercato decisi:`,
    righe.length > 0 ? righe.join('\n') : '(nessun movimento di rilievo)',
  ].join('\n');
}

function template(dati: DatiVociMercato): string {
  if (dati.trasferimenti.length === 0) {
    return `Mercato silenzioso alla vigilia della stagione ${dati.stagione}: nessun movimento degno di nota.`;
  }
  const elenco = dati.trasferimenti.map((t) => `${t.giocatore} (da ${t.daClub} a ${t.aClub})`).join(', ');
  return `Sul mercato, in vista della stagione ${dati.stagione}: ${elenco}.`;
}

export async function generaVociMercato(
  dati: DatiVociMercato,
  provider: ProviderAI | null,
): Promise<EsitoVociMercato> {
  if (provider) {
    try {
      const testo = await provider.genera([
        { ruolo: 'system', testo: ISTRUZIONI },
        { ruolo: 'user', testo: prompt(dati) },
      ]);
      if (testo.trim().length > 0) return { testo, fonte: 'ai' };
    } catch {
      // Il provider non risponde: si passa al template.
    }
  }
  return { testo: template(dati), fonte: 'template' };
}

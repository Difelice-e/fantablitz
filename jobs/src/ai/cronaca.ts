/**
 * Cronaca di una partita del mondo simulato (SPEC 8): 10 a giornata,
 * indipendenti dalla lega — raccontano il campionato, non gli scontri fanta.
 *
 * ## La validazione
 *
 * SPEC 8 chiede che "punteggio e marcatori citati corrispondano ai dati".
 * Non e' verificabile in generale che il testo non contenga *nessun* fatto
 * inventato — servirebbe un secondo modello — ma e' verificabile che i fatti
 * veri ci siano e non siano contraddetti: il risultato esatto deve comparire
 * cosi' com'e' (per questo il prompt lo chiede in formato "N-N"), e ogni
 * marcatore deve essere citato per nome. E' una rete di sicurezza parziale,
 * non una garanzia totale: la responsabilita' principale resta il prompt
 * ("usa solo i fatti forniti"), la validazione e' il controllo che si puo'
 * fare a costo zero prima di pubblicare.
 */

import type { TipoEvento } from '../../../engine/src/partita.ts';
import type { FonteTesto } from '../archivio.ts';
import type { ProviderAI } from './provider.ts';

export type EventoCronaca = {
  minuto: number;
  tipo: TipoEvento;
  giocatore: string;
  squadra: string;
};

export type DatiCronaca = {
  casa: string;
  ospite: string;
  golCasa: number;
  golOspite: number;
  eventi: readonly EventoCronaca[];
};

export type EsitoCronaca = { testo: string; fonte: FonteTesto };

const ISTRUZIONI = [
  'Sei un cronista sportivo per una lega privata di fantacalcio fra amici,',
  'su un campionato di Serie A interamente simulato e di fantasia.',
  'Scrivi in italiano, tono giornalistico e sobrio, in modo BREVE: al massimo',
  '4-6 frasi in totale, non una per evento.',
  'Usa SOLO i fatti della cronologia fornita: non inventare giocatori,',
  'episodi, dichiarazioni o dettagli che non ci sono.',
  'Concentrati sui gol; cambi, ammonizioni e infortuni si possono ignorare',
  'o accennare in una sola frase complessiva, mai elencarli uno per uno.',
  'Scrivi sempre il risultato finale nel formato numero-trattino-numero,',
  'per esempio "2-1", cosi’ com’e’ nei dati.',
  'Cita per nome ogni giocatore che ha segnato un gol.',
  'Resta nel perimetro sportivo: niente vicende personali, scandali o',
  'dichiarazioni attribuite a persone reali.',
].join(' ');

const NOMI_EVENTO: Record<TipoEvento, string> = {
  gol: 'gol',
  autogol: 'autogol',
  rigoreSegnato: 'rigore segnato',
  rigoreSbagliato: 'rigore sbagliato',
  rigoreParato: 'rigore parato',
  assist: 'assist',
  ammonizione: 'ammonizione',
  espulsione: 'espulsione',
  infortunio: 'infortunio',
  sostituzione: 'sostituzione',
};

/**
 * Solo gli eventi che meritano di finire in un articolo di 4-6 frasi.
 * Ammonizioni, infortuni e sostituzioni restano nei dati (li vede la
 * validazione, se mai servisse), ma mandarli tutti al modello significa
 * pagare token per dettagli che le istruzioni gli chiedono di ignorare — ed
 * e' proprio il token al minuto, non la chiamata al giorno, il limite stretto
 * del piano gratuito.
 */
const EVENTI_RILEVANTI: ReadonlySet<TipoEvento> = new Set([
  'gol', 'autogol', 'rigoreSegnato', 'rigoreSbagliato', 'rigoreParato', 'espulsione',
]);

function prompt(dati: DatiCronaca): string {
  const righe = dati.eventi
    .filter((e) => EVENTI_RILEVANTI.has(e.tipo))
    .map((e) => `${e.minuto}': ${NOMI_EVENTO[e.tipo]} — ${e.giocatore} (${e.squadra})`);
  return [
    `${dati.casa} ${dati.golCasa}-${dati.golOspite} ${dati.ospite}`,
    'Eventi principali, in ordine:',
    righe.length > 0 ? righe.join('\n') : '(nessun evento oltre al risultato)',
  ].join('\n');
}

/** I giocatori che hanno segnato: gol, rigori segnati e autogol contano tutti come marcatori. */
export function marcatori(dati: DatiCronaca): string[] {
  return dati.eventi
    .filter((e) => e.tipo === 'gol' || e.tipo === 'rigoreSegnato' || e.tipo === 'autogol')
    .map((e) => e.giocatore);
}

export function cronacaValida(testo: string, dati: DatiCronaca): boolean {
  if (!testo.includes(`${dati.golCasa}-${dati.golOspite}`)) return false;
  return marcatori(dati).every((nome) => testo.includes(nome));
}

function template(dati: DatiCronaca): string {
  const gol = marcatori(dati);
  const fraseGol = gol.length > 0 ? ` A segno: ${gol.join(', ')}.` : '';
  return `${dati.casa} ${dati.golCasa}-${dati.golOspite} ${dati.ospite}.${fraseGol}`;
}

/**
 * Genera la cronaca. Un tentativo con l'AI, e se non torna valida una sola
 * rigenerazione (SPEC 8); dopodiche', o senza provider, il template.
 */
export async function generaCronaca(
  dati: DatiCronaca,
  provider: ProviderAI | null,
): Promise<EsitoCronaca> {
  if (provider) {
    for (let tentativo = 0; tentativo < 2; tentativo++) {
      try {
        const testo = await provider.genera([
          { ruolo: 'system', testo: ISTRUZIONI },
          { ruolo: 'user', testo: prompt(dati) },
        ]);
        if (cronacaValida(testo, dati)) return { testo, fonte: 'ai' };
      } catch {
        // Il provider non risponde: si prova un'altra volta, poi il template.
      }
    }
  }
  return { testo: template(dati), fonte: 'template' };
}

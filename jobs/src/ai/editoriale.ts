/**
 * Editoriale di lega (SPEC 8): un pezzo a giornata, ironico, sui risultati
 * fanta — non sul campionato simulato, che e' la cronaca partita.
 *
 * Non ha la validazione stretta della cronaca (SPEC 8 la chiede solo li'): e'
 * un commento, non un resoconto di fatti puntuali da verificare uno per uno.
 * Resta comunque il fallback da template, che vale per ogni generatore.
 */

import type { FonteTesto } from '../archivio.ts';
import type { ProviderAI } from './provider.ts';

export type DatiEditoriale = {
  giornata: number;
  /** Classifica dopo questa giornata, gia' in ordine di posizione. */
  classifica: { squadra: string; punti: number }[];
  risultati: { casa: string; ospite: string; fantapuntiCasa: number; fantapuntiOspite: number }[];
  migliore: { squadra: string; fantapunti: number } | null;
  peggiore: { squadra: string; fantapunti: number } | null;
};

export type EsitoEditoriale = { testo: string; fonte: FonteTesto };

const ISTRUZIONI = [
  'Sei l’editorialista di una lega privata di fantacalcio fra amici, su un',
  'campionato interamente simulato e di fantasia. Scrivi in italiano, tono',
  'ironico ma mai cattivo. Sii BREVE: al massimo 4-6 frasi in totale, e non',
  'una per ogni squadra o risultato — scegli cosa vale la pena raccontare.',
  'Usa SOLO i dati forniti — risultati, classifica, chi ha fatto meglio e',
  'peggio — senza inventare fatti. Resta nel perimetro del gioco: niente',
  'vicende personali, scandali o dichiarazioni attribuite a persone reali.',
].join(' ');

function prompt(dati: DatiEditoriale): string {
  // Solo la testa della classifica, non tutte le squadre: mandarle tutte
  // invita il modello a commentarle tutte, e il pezzo deve restare breve
  // (e stare nel budget di token al minuto del piano gratuito).
  const testaClassifica = dati.classifica.slice(0, 3);
  const righe = [
    `Giornata ${dati.giornata}.`,
    'Risultati:',
    ...dati.risultati.map(
      (r) => `${r.casa} ${r.fantapuntiCasa.toFixed(1)} - ${r.fantapuntiOspite.toFixed(1)} ${r.ospite}`,
    ),
    'Prime posizioni in classifica:',
    ...testaClassifica.map((r, i) => `${i + 1}. ${r.squadra} (${r.punti} pt)`),
  ];
  if (dati.migliore) righe.push(`Migliore giornata: ${dati.migliore.squadra} (${dati.migliore.fantapunti.toFixed(1)} fantapunti).`);
  if (dati.peggiore) righe.push(`Peggiore giornata: ${dati.peggiore.squadra} (${dati.peggiore.fantapunti.toFixed(1)} fantapunti).`);
  return righe.join('\n');
}

function template(dati: DatiEditoriale): string {
  const pezzi = [`Giornata ${dati.giornata}: si aggiorna la classifica.`];
  if (dati.migliore) {
    pezzi.push(`Migliore realizzazione per ${dati.migliore.squadra} (${dati.migliore.fantapunti.toFixed(1)} fantapunti).`);
  }
  if (dati.peggiore) {
    pezzi.push(`Da dimenticare la giornata di ${dati.peggiore.squadra} (${dati.peggiore.fantapunti.toFixed(1)}).`);
  }
  const capolista = dati.classifica[0];
  if (capolista) pezzi.push(`In testa resta ${capolista.squadra}.`);
  return pezzi.join(' ');
}

export async function generaEditoriale(
  dati: DatiEditoriale,
  provider: ProviderAI | null,
): Promise<EsitoEditoriale> {
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

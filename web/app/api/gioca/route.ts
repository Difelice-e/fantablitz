/**
 * Il job serale come endpoint: lo chiama il cron di Vercel.
 *
 *   POST /api/gioca            con Authorization: Bearer $CRON_SECRET
 *
 * E' lo stesso lavoro di `npm run gioca`, e la logica non e' qui davvero: sta
 * in `jobs/src/cicloGiornaliero.ts` (`giocaGiornate`), condivisa anche col
 * pulsante admin on-demand (issue #12). Questo file la avvolge in una
 * richiesta HTTP e nient'altro.
 *
 * **E' idempotente**, e non per una guardia: l'unica cosa che scrive e'
 * `giornateGiocate`. I risultati non si salvano, si ricalcolano dal seme e
 * dalle formazioni. Chiamarlo due volte sulla stessa giornata riscrive lo
 * stesso numero.
 *
 * Senza `?quante=`, ogni lega gioca il proprio ritmo configurato
 * (`giornateAlGiorno`, issue #13) invece di un 1 fisso per tutte. Con
 * `?quante=`, il valore esplicito sovrascrive quello di ogni lega — comodo
 * per un test manuale, non usato dal cron automatico.
 */

import { archivioServizio, contesto, RADICE } from '../../../src/dati.ts';
import { providerDallAmbiente } from '../../../../jobs/src/ai/provider.ts';
import { giocaGiornate } from '../../../../jobs/src/cicloGiornaliero.ts';

export const dynamic = 'force-dynamic';
// La simulazione di una stagione intera non sta nei limiti di una funzione
// edge: qui serve il runtime Node, che legge anche il seed da disco.
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Confronto a tempo costante.
 *
 * Con un confronto normale il tempo di risposta dice quante lettere iniziali
 * sono giuste, e il segreto si indovina una lettera alla volta. Costa due
 * righe evitarlo.
 */
function segretoCorretto(dato: string, atteso: string): boolean {
  if (dato.length !== atteso.length) return false;
  let differenza = 0;
  for (let i = 0; i < dato.length; i++) differenza |= dato.charCodeAt(i) ^ atteso.charCodeAt(i);
  return differenza === 0;
}

export async function POST(richiesta: Request): Promise<Response> {
  const atteso = process.env['CRON_SECRET'];
  if (!atteso) {
    // Meglio non partire che girare senza protezione: senza segreto configurato
    // chiunque conosca l'indirizzo potrebbe far giocare la lega.
    return Response.json({ errore: 'CRON_SECRET non configurato' }, { status: 503 });
  }

  const autorizzazione = richiesta.headers.get('authorization') ?? '';
  const dato = autorizzazione.startsWith('Bearer ') ? autorizzazione.slice(7) : '';
  if (!segretoCorretto(dato, atteso)) {
    return Response.json({ errore: 'non autorizzato' }, { status: 401 });
  }

  const quanteGrezzo = new URL(richiesta.url).searchParams.get('quante');
  const quanteFisso = quanteGrezzo === null ? null : Number(quanteGrezzo);
  if (quanteFisso !== null && (!Number.isInteger(quanteFisso) || quanteFisso < 1)) {
    return Response.json({ errore: 'quante deve essere un intero positivo' }, { status: 400 });
  }

  const leghe = await archivioServizio.elenca();
  if (leghe.length === 0) return Response.json({ giocate: [], nota: 'nessuna lega in archivio' });

  const c = await contesto();
  const provider = providerDallAmbiente(process.env);
  const giocate: { lega: string; da: number; a: number }[] = [];

  for (const { id } of leghe) {
    const stato = await archivioServizio.leggi(id);
    if (!stato) continue;

    const { da, fino } = await giocaGiornate(
      archivioServizio, c, provider, stato, quanteFisso ?? stato.giornateAlGiorno,
    );
    giocate.push({ lega: id, da, a: fino });
  }

  return Response.json({ giocate, radice: RADICE });
}

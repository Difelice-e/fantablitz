/**
 * Il job serale come endpoint: lo chiama il cron di Vercel.
 *
 *   POST /api/gioca            con Authorization: Bearer $CRON_SECRET
 *
 * E' lo stesso lavoro di `npm run gioca`, e infatti la logica non e' qui: sta
 * in `/jobs`, e questo file la avvolge in una richiesta HTTP. Il giorno in cui
 * il cron cambiasse casa, cambierebbe questo file e nient'altro.
 *
 * **E' idempotente**, e non per una guardia: l'unica cosa che scrive e'
 * `giornateGiocate`. I risultati non si salvano, si ricalcolano dal seme e
 * dalle formazioni. Chiamarlo due volte sulla stessa giornata riscrive lo
 * stesso numero.
 */

import { archivioServizio, contesto, RADICE } from '../../../src/dati.ts';
import { providerDallAmbiente } from '../../../../jobs/src/ai/provider.ts';
import { vistaStagione } from '../../../../jobs/src/lega.ts';
import { generaChatGiornate } from '../../../../jobs/src/chat.ts';
import { chiudiStagioniAttraversate } from '../../../../jobs/src/fineStagione.ts';
import { generaNarrativaGiornate } from '../../../../jobs/src/narrativa.ts';
import { proponiScambiSpontanei } from '../../../../jobs/src/scambiSpontanei.ts';

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

  const quante = Number(new URL(richiesta.url).searchParams.get('quante') ?? '1');
  if (!Number.isInteger(quante) || quante < 1) {
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

    // Le stagioni si susseguono senza fine (SPEC 5.8): non c'e' piu' un
    // "totale" di giornate oltre cui fermarsi, solo la prossima stagione.
    const da = stato.giornateGiocate + 1;
    const fino = stato.giornateGiocate + quante;
    await archivioServizio.segnaGiornateGiocate(id, fino);

    const aggiornato = { ...stato, giornateGiocate: fino };
    await chiudiStagioniAttraversate(archivioServizio, aggiornato, c, provider, da, fino);

    // Rilegge: chiudere una stagione puo' aver scritto l'albo d'oro e le
    // voci di mercato, e vista/narrativa/scambi/chat devono vederli.
    const dopoChiusura = (await archivioServizio.leggi(aggiornato.id))!;
    const vista = vistaStagione(dopoChiusura, c);

    await generaNarrativaGiornate(archivioServizio, dopoChiusura, c, vista, provider, da, fino);
    await proponiScambiSpontanei(archivioServizio, dopoChiusura, c, vista.mondo, c.scambi, da, fino);

    // Rilegge di nuovo: gli scambi spontanei possono aver cambiato
    // `stato.scambi`, e la chat deve vederli per reagire agli scambi appena
    // conclusi.
    const conScambiFreschi = (await archivioServizio.leggi(aggiornato.id))!;
    await generaChatGiornate(archivioServizio, conScambiFreschi, c, vista, provider, da, fino);

    giocate.push({ lega: id, da, a: fino });
  }

  return Response.json({ giocate, radice: RADICE });
}

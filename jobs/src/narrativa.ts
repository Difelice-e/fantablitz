/**
 * Genera e salva cronache ed editoriali per le giornate appena giocate
 * (SPEC 8), dentro il job serale — mai al caricamento di una pagina.
 *
 * Sta in `/jobs` come `valutazione.ts` e per lo stesso motivo: attraversa il
 * confine fra mondo simulato (le partite, i loro eventi) e lega (i fantapunti,
 * la classifica), e ne' `/engine` ne' `/fanta` devono conoscere l'altro lato.
 *
 * E' idempotente per scelta, non per una guardia soltanto: `salvaCronaca` ed
 * `salvaEditoriale` sostituiscono per chiave, quindi rigenerare la stessa
 * giornata non duplica niente. La guardia sugli `esistenti` qui sotto non e'
 * per la correttezza — lo sarebbe comunque — mai per non ripagare la stessa
 * cronaca in quota Groq a ogni rilancio del job.
 */

import { calcolaClassifica } from '../../fanta/src/classifica.ts';
import { generaCronaca, type DatiCronaca } from './ai/cronaca.ts';
import { generaEditoriale, type DatiEditoriale } from './ai/editoriale.ts';
import type { ProviderAI } from './ai/provider.ts';
import type { Archivio, StatoLega } from './archivio.ts';
import type { EsitoCiclo } from './ciclo.ts';
import type { ContestoMondo } from './lega.ts';

function nomeGiocatore(id: string, c: ContestoMondo): string {
  return c.mondo.giocatorePerId.get(id)?.nome ?? id;
}

function nomeClub(id: string, c: ContestoMondo): string {
  return c.mondo.clubPerId.get(id)?.nome ?? id;
}

function attesa(ms: number): Promise<void> {
  return new Promise((risolvi) => setTimeout(risolvi, ms));
}

/**
 * Un secondo scarso fra una chiamata e la prossima. Il piano gratuito di Groq
 * limita i token al minuto, non solo le chiamate al giorno: una giornata da
 * dieci partite piu' un editoriale, sparata tutta insieme, in un test reale
 * ha esaurito il budget a meta' ed e' caduta sul template per il resto. Senza
 * provider non si aspetta: il template e' istantaneo e aspettare sarebbe solo
 * tempo perso.
 */
const PAUSA_FRA_CHIAMATE_MS = 1200;

/**
 * Genera cronache ed editoriali per le giornate da `da` a `fino`, comprese,
 * saltando quelle gia' salvate. `vista` deve coprire quel range: la si ottiene
 * rigiocando la stagione fino a `fino`, come fa gia' il job serale.
 */
export async function generaNarrativaGiornate(
  archivio: Archivio,
  stato: StatoLega,
  contesto: ContestoMondo,
  vista: EsitoCiclo,
  provider: ProviderAI | null,
  da: number,
  fino: number,
): Promise<void> {
  const cronacheEsistenti = new Set(
    stato.cronache.map((c) => `${c.giornata}:${c.casaId}:${c.ospiteId}`),
  );
  const editorialiEsistenti = new Set(stato.editoriali.map((e) => e.giornata));
  const squadraIds = stato.squadre.map((s) => s.id);
  let primaChiamata = true;

  for (let n = da; n <= fino; n++) {
    for (const partita of vista.mondo.partite.filter((p) => p.giornata === n)) {
      const chiave = `${n}:${partita.casaId}:${partita.ospiteId}`;
      if (cronacheEsistenti.has(chiave)) continue;

      if (provider && !primaChiamata) await attesa(PAUSA_FRA_CHIAMATE_MS);
      primaChiamata = false;

      const dati: DatiCronaca = {
        casa: nomeClub(partita.casaId, contesto),
        ospite: nomeClub(partita.ospiteId, contesto),
        golCasa: partita.golCasa,
        golOspite: partita.golOspite,
        eventi: partita.eventi.map((e) => ({
          minuto: e.minuto,
          tipo: e.tipo,
          giocatore: nomeGiocatore(e.giocatoreId, contesto),
          squadra: nomeClub(e.clubId, contesto),
        })),
      };
      const esito = await generaCronaca(dati, provider);
      await archivio.salvaCronaca(stato.id, {
        giornata: n, casaId: partita.casaId, ospiteId: partita.ospiteId,
        testo: esito.testo, fonte: esito.fonte,
      });
    }

    if (editorialiEsistenti.has(n)) continue;
    const giornataFanta = vista.giornate.find((g) => g.numero === n);
    if (!giornataFanta) continue;

    // La classifica di questa specifica giornata, non quella finale del
    // range: due giornate giocate insieme non devono raccontare lo stesso
    // piazzamento per entrambe.
    const scontriFinoQui = vista.giornate
      .filter((g) => g.numero <= n)
      .flatMap((g) => g.scontri);
    const classifica = calcolaClassifica(squadraIds, scontriFinoQui);

    const puntiSquadra = new Map<string, number>();
    for (const s of giornataFanta.scontri) {
      puntiSquadra.set(s.casaId, s.fantapuntiCasa);
      puntiSquadra.set(s.ospiteId, s.fantapuntiOspite);
    }
    const ordinati = [...puntiSquadra.entries()].sort((a, b) => b[1] - a[1]);
    const primo = ordinati[0];
    const ultimo = ordinati.at(-1);

    const dati: DatiEditoriale = {
      giornata: n,
      classifica: classifica.map((r) => ({ squadra: r.squadraId, punti: r.punti })),
      risultati: giornataFanta.scontri.map((s) => ({
        casa: s.casaId, ospite: s.ospiteId,
        fantapuntiCasa: s.fantapuntiCasa, fantapuntiOspite: s.fantapuntiOspite,
      })),
      migliore: primo ? { squadra: primo[0], fantapunti: primo[1] } : null,
      peggiore: ultimo && ultimo !== primo ? { squadra: ultimo[0], fantapunti: ultimo[1] } : null,
    };
    if (provider && !primaChiamata) await attesa(PAUSA_FRA_CHIAMATE_MS);
    primaChiamata = false;

    const esito = await generaEditoriale(dati, provider);
    await archivio.salvaEditoriale(stato.id, { giornata: n, testo: esito.testo, fonte: esito.fonte });
  }
}

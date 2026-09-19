/**
 * Chiude le stagioni attraversate da un rilancio del job serale (SPEC 5.8).
 *
 * "Chiudere" qui vuol dire due cose, entrambe scritte una volta sola e mai
 * ricalcolate: il verdetto per l'albo d'oro (chi ha vinto), e le voci di
 * mercato sui trasferimenti interni decisi per la stagione che comincia.
 * L'evoluzione del mondo (eta', rating, trasferimenti) invece non si scrive
 * mai qui: e' gia' una funzione pura di (mondo base, numero di stagione),
 * `vistaStagione` la applica da sola quando serve.
 *
 * Idempotente per lo stesso motivo di `narrativa.ts`: salta le stagioni gia'
 * presenti in `alboDoro`, cosi' rilanciare il job sulla stessa giornata non
 * scrive un secondo verdetto ne' consuma una seconda volta la quota Groq.
 */

import { attesa, PAUSA_FRA_CHIAMATE_MS, type ProviderAI } from './ai/provider.ts';
import { generaVociMercato, type DatiVociMercato } from './ai/vociMercato.ts';
import type { Archivio, StatoLega } from './archivio.ts';
import type { ContestoMondo } from './lega.ts';
import { vistaStagione } from './lega.ts';
import { giornatePerStagione, posizioneStagione, trasferimentiDellaStagione } from './stagioni.ts';

function nomeClub(id: string, c: ContestoMondo): string {
  return c.mondo.clubPerId.get(id)?.nome ?? id;
}

function nomeGiocatore(id: string, c: ContestoMondo): string {
  return c.mondo.giocatorePerId.get(id)?.nome ?? id;
}

/**
 * Chiude ogni stagione conclusa fra la giornata `daGlobale` e `finoGlobale`
 * (comprese quelle attraversate del tutto da un balzo di piu' giornate).
 */
export async function chiudiStagioniAttraversate(
  archivio: Archivio,
  statoIniziale: StatoLega,
  contesto: ContestoMondo,
  provider: ProviderAI | null,
  daGlobale: number,
  finoGlobale: number,
): Promise<void> {
  const gps = giornatePerStagione(contesto.mondo);
  const daStagione = posizioneStagione(Math.max(1, daGlobale), gps).stagione;
  const finoStagione = posizioneStagione(Math.max(1, finoGlobale), gps).stagione;

  let stato = statoIniziale;
  let primaChiamata = true;

  for (let s = daStagione; s < finoStagione; s++) {
    if (stato.alboDoro.some((v) => v.stagione === s)) continue;

    const vistaFinale = vistaStagione({ ...stato, giornateGiocate: s * gps }, contesto);
    const primoClassificato = vistaFinale.classifica[0];
    if (!primoClassificato) continue;

    await archivio.salvaVerdettoStagione(stato.id, {
      stagione: s,
      campioneSquadraId: primoClassificato.squadraId,
      puntiCampione: primoClassificato.punti,
      fantapuntiCampione: primoClassificato.fantapunti,
    });
    stato = (await archivio.leggi(stato.id))!;

    if (!stato.vociMercato.some((v) => v.stagione === s + 1)) {
      const trasferimenti = trasferimentiDellaStagione(contesto.mondo, s, stato.seme, contesto.evoluzione)
        // Un pezzo di 3-5 frasi non puo' citarli tutti (su 500+ giocatori, l'8%
        // configurato sono circa quaranta): si sceglie una manciata.
        .slice(0, 6)
        .map((t) => ({
          giocatore: nomeGiocatore(t.giocatoreId, contesto),
          daClub: nomeClub(t.daClubId, contesto),
          aClub: nomeClub(t.aClubId, contesto),
        }));

      if (provider && !primaChiamata) await attesa(PAUSA_FRA_CHIAMATE_MS);
      primaChiamata = false;

      const dati: DatiVociMercato = { stagione: s + 1, trasferimenti };
      const esito = await generaVociMercato(dati, provider);
      await archivio.salvaVociMercato(stato.id, { stagione: s + 1, testo: esito.testo, fonte: esito.fonte });
      stato = (await archivio.leggi(stato.id))!;
    }
  }
}

/**
 * Gioca N giornate per una lega: la sequenza completa del job serale (chiudi
 * le stagioni attraversate, genera narrativa, propone scambi spontanei,
 * genera chat), in un solo punto.
 *
 * Prima di questo file la stessa sequenza viveva duplicata in `cliGioca.ts` e
 * in `web/app/api/gioca/route.ts` — la seconda copia del comportamento che il
 * commento della route prometteva di non avere. Ora la promessa è vera: chi
 * gioca una lega, dal terminale, dal cron o dal pulsante admin on-demand
 * (issue #12), passa da qui. Un solo percorso è anche l'unico modo per cui
 * "riusa lo stesso job" (issue #12) significa qualcosa di verificabile, non
 * solo una buona intenzione.
 */

import type { ProviderAI } from './ai/provider.ts';
import type { Archivio, StatoLega } from './archivio.ts';
import { chiudiStagioniAttraversate } from './fineStagione.ts';
import { vistaStagione, type ContestoMondo } from './lega.ts';
import { generaNarrativaGiornate } from './narrativa.ts';
import { proponiScambiSpontanei } from './scambiSpontanei.ts';
import { generaChatGiornate } from './chat.ts';
import type { EsitoCiclo } from './ciclo.ts';

export type EsitoGiocaGiornate = { da: number; fino: number; vista: EsitoCiclo };

/**
 * Gioca `quante` giornate a partire dalla prossima non ancora giocata.
 *
 * L'unica scrittura che conta è `segnaGiornateGiocate`: i risultati non si
 * salvano, si ricalcolano (regola 6). Chiamarla due volte di seguito senza
 * che `quante` o lo stato cambino nel mezzo scrive lo stesso numero — non è
 * una guardia, è la stessa idempotenza vista dal lato del contatore.
 */
export async function giocaGiornate(
  archivio: Archivio,
  c: ContestoMondo,
  provider: ProviderAI | null,
  stato: StatoLega,
  quante: number,
): Promise<EsitoGiocaGiornate> {
  if (!Number.isInteger(quante) || quante < 1) {
    throw new Error(`quante deve essere un intero positivo, ricevuto ${quante}`);
  }

  const da = stato.giornateGiocate + 1;
  const fino = stato.giornateGiocate + quante;
  await archivio.segnaGiornateGiocate(stato.id, fino);

  const aggiornato = { ...stato, giornateGiocate: fino };
  await chiudiStagioniAttraversate(archivio, aggiornato, c, provider, da, fino);

  // Rilegge: chiudere una stagione puo' aver scritto l'albo d'oro e le voci
  // di mercato, e vista/narrativa/scambi/chat devono vederli aggiornati.
  const dopoChiusura = (await archivio.leggi(aggiornato.id))!;
  const vista = vistaStagione(dopoChiusura, c);

  await generaNarrativaGiornate(archivio, dopoChiusura, c, vista, provider, da, fino);
  await proponiScambiSpontanei(archivio, dopoChiusura, c, vista.mondo, c.scambi, da, fino);

  // Rilegge di nuovo: gli scambi spontanei possono aver cambiato `scambi`, e
  // la chat deve vederli per reagire a quelli appena conclusi.
  const conScambiFreschi = (await archivio.leggi(aggiornato.id))!;
  await generaChatGiornate(archivio, conScambiFreschi, c, vista, provider, da, fino);

  return { da, fino, vista };
}

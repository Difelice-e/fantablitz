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
import { formazioneAutomatica, formazionePerGiornata, rosaDi, salvataDaFormazione, vistaStagione, type ContestoMondo } from './lega.ts';
import { generaNarrativaGiornate } from './narrativa.ts';
import { proponiScambiSpontanei } from './scambiSpontanei.ts';
import { generaChatGiornate } from './chat.ts';
import type { EsitoCiclo } from './ciclo.ts';

export type EsitoGiocaGiornate = { da: number; fino: number; vista: EsitoCiclo };

/**
 * Congela, per ogni squadra che non ne ha gia' una che la copre, la
 * formazione con cui gioca ciascuna giornata da `da` a `fino`.
 *
 * E' il punto che tiene fede all'invariante "una giornata gia' calcolata non
 * cambia mai piu': senza questo, le squadre gestite dal bot non salvano mai
 * una formazione esplicita (non la scelgono mai da un'interfaccia), quindi
 * ogni ricalcolo di una giornata gia' giocata la ripeteva con la rosa **di
 * oggi** invece che con quella del momento in cui e' stata giocata — uno
 * scambio fatto dopo poteva cambiare il risultato di una giornata passata.
 * Congelando qui, al momento del gioco, quella lettura futura trova sempre
 * un record esplicito e non ricade piu' sulla rosa corrente.
 *
 * Chi ha gia' scelto una formazione (umano, o bot gia' congelato a una
 * giornata precedente) non viene toccato: `formazionePerGiornata` la trova
 * gia' e la usa cosi' com'e', esattamente come oggi.
 */
async function congelaFormazioni(
  archivio: Archivio,
  stato: StatoLega,
  c: ContestoMondo,
  da: number,
  fino: number,
): Promise<StatoLega> {
  const regole = c.regole[stato.modalita];
  let locale = stato;
  for (let n = da; n <= fino; n++) {
    for (const squadra of locale.squadre) {
      if (formazionePerGiornata(locale, squadra.id, n)) continue;
      const formazione = formazioneAutomatica(rosaDi(squadra, c), regole);
      const salvata = salvataDaFormazione(squadra.id, n, formazione);
      await archivio.salvaFormazione(locale.id, salvata);
      locale = { ...locale, formazioni: [...locale.formazioni, salvata] };
    }
  }
  return locale;
}

/**
 * Gioca `quante` giornate a partire dalla prossima non ancora giocata.
 *
 * Le uniche scritture che contano sono `segnaGiornateGiocate` e il
 * congelamento delle formazioni: i risultati non si salvano, si ricalcolano
 * (regola 6). Chiamarla due volte di seguito senza che `quante` o lo stato
 * cambino nel mezzo scrive gli stessi valori — non è una guardia, è la
 * stessa idempotenza vista dal lato del contatore e delle formazioni gia'
 * congelate (`salvaFormazione` sovrascrive per `(squadraId, giornata)`).
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

  // Congela prima di chiudere le stagioni attraversate: se questo lancio
  // scavalca la fine di una stagione, il verdetto finale (`chiudiStagioniAttraversate`)
  // deve gia' vedere le formazioni delle sue ultime giornate come congelate.
  let aggiornato = { ...stato, giornateGiocate: fino };
  aggiornato = await congelaFormazioni(archivio, aggiornato, c, da, fino);

  await chiudiStagioniAttraversate(archivio, aggiornato, c, provider, da, fino);

  // Rilegge: chiudere una stagione puo' aver scritto l'albo d'oro e le voci
  // di mercato, e vista/narrativa/scambi/chat devono vederli aggiornati.
  const dopoChiusura = (await archivio.leggi(aggiornato.id))!;
  const vista = vistaStagione(dopoChiusura, c);

  // Questo calcolo e' il piu' costoso di tutto il ciclo (rigioca l'intera
  // storia della lega), e chi gioca una giornata lo sta gia' pagando: scritto
  // qui, ogni visita al sito lo trova pronto invece di ripagarlo da capo
  // (vedi il commento in cima a jobs/src/archivio.ts). Il fallimento di
  // questa scrittura non deve interrompere il ciclo: la cache mancante si
  // comporta come oggi, un ricalcolo dal vivo alla prossima visita.
  await archivio.scriviVistaStagioneCache(dopoChiusura.id, fino, vista);

  await generaNarrativaGiornate(archivio, dopoChiusura, c, vista, provider, da, fino);
  await proponiScambiSpontanei(archivio, dopoChiusura, c, vista.mondo, c.scambi, da, fino);

  // Rilegge di nuovo: gli scambi spontanei possono aver cambiato `scambi`, e
  // la chat deve vederli per reagire a quelli appena conclusi.
  const conScambiFreschi = (await archivio.leggi(aggiornato.id))!;
  await generaChatGiornate(archivio, conScambiFreschi, c, vista, provider, da, fino);

  return { da, fino, vista };
}

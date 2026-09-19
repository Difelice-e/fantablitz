/**
 * Il confine fra una stagione e la successiva (SPEC 5.8).
 *
 * La lega e' una sola, e continua: le giornate si numerano in avanti senza
 * mai ripartire da 1 (la stagione 2 comincia alla giornata
 * `giornatePerStagione + 1`). Il mondo pero' non si salva mai "invecchiato":
 * si ricalcola ogni volta applicando `evolviMondo` (SPEC 5.8 punti 4 e 6) al
 * mondo base del seed, tante volte quante sono le stagioni gia' passate — la
 * stessa idempotenza della regola 6, vista dal lato anagrafico.
 *
 * Il numero di giornate di una stagione dipende solo da quanti club esistono,
 * che oggi non cambia mai (nessuna promozione o retrocessione modellata):
 * calcolarlo costa un calendario, non una stagione simulata per intero.
 */

import { generaCalendario } from '../../engine/src/calendario.ts';
import { generatore, seme } from '../../engine/src/casuale.ts';
import { evolviMondo, type ParametriEvoluzione } from '../../engine/src/evoluzione.ts';
import { indicizza, type Mondo, type MondoIndicizzato } from '../../engine/src/mondo.ts';

/** Quante giornate dura una stagione, per questo mondo. Non dipende dal seme di lega. */
export function giornatePerStagione(mondoBase: Mondo): number {
  return generaCalendario(mondoBase, { seme: 'lunghezza-stagione' }).giornate.length;
}

export type PosizioneStagione = {
  /** 1-based: la prima stagione e' la 1. */
  stagione: number;
  /** Giornata dentro quella stagione, 1-based. */
  giornataStagionale: number;
};

/** A quale stagione appartiene una giornata numerata globalmente (1-based, mai 0). */
export function posizioneStagione(giornataGlobale: number, giornatePerStag: number): PosizioneStagione {
  const g = Math.max(1, giornataGlobale);
  return {
    stagione: Math.floor((g - 1) / giornatePerStag) + 1,
    giornataStagionale: ((g - 1) % giornatePerStag) + 1,
  };
}

/**
 * Il mondo con cui si gioca una certa stagione: il mondo base evoluto
 * (stagione - 1) volte. La stagione 1 e' il mondo base, senza modifiche.
 *
 * Pura per costruzione (regola 3): stesso mondo base, stesso seme di lega,
 * stessa stagione danno sempre lo stesso mondo. Il generatore di ogni
 * passaggio e' seminato su (seme di lega, "evoluzione", numero del passaggio):
 * evolvere la lega A non tocca in nessun modo la lega B, anche se partissero
 * dallo stesso mondo base.
 */
export function mondoDellaStagione(
  mondoBase: Mondo,
  numeroStagione: number,
  semeLega: string,
  config: ParametriEvoluzione,
): MondoIndicizzato {
  let corrente = mondoBase;
  for (let s = 1; s < numeroStagione; s++) {
    corrente = evolviMondo(corrente, config, generatore(seme(semeLega, 'evoluzione', s)));
  }
  return indicizza(corrente);
}

export type Trasferimento = { giocatoreId: string; daClubId: string; aClubId: string };

/**
 * I trasferimenti interni avvenuti passando dalla stagione `numeroStagione`
 * alla successiva: chi ha cambiato club. Serve alle voci di mercato — non a
 * simulare, che gia' usa `mondoDellaStagione` senza bisogno di sapere cos'e'
 * cambiato, solo a raccontarlo.
 */
export function trasferimentiDellaStagione(
  mondoBase: Mondo,
  numeroStagione: number,
  semeLega: string,
  config: ParametriEvoluzione,
): Trasferimento[] {
  const prima = mondoDellaStagione(mondoBase, numeroStagione, semeLega, config);
  const dopo = mondoDellaStagione(mondoBase, numeroStagione + 1, semeLega, config);
  const trasferimenti: Trasferimento[] = [];
  for (const g of dopo.giocatori) {
    const originale = prima.giocatorePerId.get(g.id);
    if (originale && originale.clubId !== g.clubId) {
      trasferimenti.push({ giocatoreId: g.id, daClubId: originale.clubId, aClubId: g.clubId });
    }
  }
  return trasferimenti;
}

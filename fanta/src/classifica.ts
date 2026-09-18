/**
 * Risultati degli scontri diretti e classifica della lega.
 *
 * I fantapunti diventano gol secondo le soglie, e da li' in poi e' un
 * campionato normale: tre punti a vittoria, uno a pareggio.
 *
 * I fantapunti totali restano pero' nella riga di classifica, e non solo come
 * curiosita': sono il criterio con cui si separano due squadre a pari punti,
 * ed e' il piu' giusto che ci sia, perche' misura quanto hanno raccolto sul
 * campo invece di quanto sono state fortunate con le soglie.
 */

import { golDaFantapunti } from './soglie.ts';
import type { ConfigurazioneLega } from './fantavoto.ts';
import type { GiornataFanta, ScontroDiretto } from './calendarioFanta.ts';

export type RisultatoScontro = {
  giornata: number;
  casaId: string;
  ospiteId: string;
  fantapuntiCasa: number;
  fantapuntiOspite: number;
  golCasa: number;
  golOspite: number;
};

export type RigaClassificaFanta = {
  squadraId: string;
  punti: number;
  giocate: number;
  vinte: number;
  pareggiate: number;
  perse: number;
  golFatti: number;
  golSubiti: number;
  /** Somma dei fantapunti raccolti: il criterio di spareggio. */
  fantapunti: number;
};

/** Risolve uno scontro diretto a partire dai fantapunti delle due squadre. */
export function risolviScontro(
  giornata: number,
  scontro: ScontroDiretto,
  fantapunti: ReadonlyMap<string, number>,
  c: ConfigurazioneLega,
): RisultatoScontro {
  const casa = fantapunti.get(scontro.casaId) ?? 0;
  const ospite = fantapunti.get(scontro.ospiteId) ?? 0;

  return {
    giornata,
    casaId: scontro.casaId,
    ospiteId: scontro.ospiteId,
    fantapuntiCasa: casa,
    fantapuntiOspite: ospite,
    golCasa: golDaFantapunti(casa, c.soglieGol),
    golOspite: golDaFantapunti(ospite, c.soglieGol),
  };
}

export function risolviGiornata(
  giornata: GiornataFanta,
  fantapunti: ReadonlyMap<string, number>,
  c: ConfigurazioneLega,
): RisultatoScontro[] {
  return giornata.scontri.map((s) => risolviScontro(giornata.numero, s, fantapunti, c));
}

/* ------------------------------------------------------------------ */

function rigaVuota(squadraId: string): RigaClassificaFanta {
  return {
    squadraId,
    punti: 0, giocate: 0, vinte: 0, pareggiate: 0, perse: 0,
    golFatti: 0, golSubiti: 0, fantapunti: 0,
  };
}

/**
 * Classifica a partire dai risultati.
 *
 * L'ordine e': punti, differenza reti, gol fatti, **fantapunti totali**, e
 * infine l'identificativo, che non e' un criterio sportivo ma garantisce che
 * la classifica sia sempre la stessa a parita' di tutto. Senza quell'ultimo
 * confronto due esecuzioni potrebbero mostrare ordini diversi, e nel giorno in
 * cui succede nessuno si fida piu' della tabella.
 */
export function calcolaClassifica(
  squadre: readonly string[],
  risultati: readonly RisultatoScontro[],
): RigaClassificaFanta[] {
  const righe = new Map<string, RigaClassificaFanta>(
    squadre.map((s) => [s, rigaVuota(s)]),
  );

  for (const r of risultati) {
    for (const [id, gol, subiti, fantapunti] of [
      [r.casaId, r.golCasa, r.golOspite, r.fantapuntiCasa],
      [r.ospiteId, r.golOspite, r.golCasa, r.fantapuntiOspite],
    ] as const) {
      const riga = righe.get(id) ?? rigaVuota(id);
      righe.set(id, riga);

      riga.giocate++;
      riga.golFatti += gol;
      riga.golSubiti += subiti;
      riga.fantapunti += fantapunti;

      if (gol > subiti) { riga.vinte++; riga.punti += 3; }
      else if (gol === subiti) { riga.pareggiate++; riga.punti += 1; }
      else riga.perse++;
    }
  }

  return [...righe.values()].sort(
    (a, b) =>
      b.punti - a.punti ||
      b.golFatti - b.golSubiti - (a.golFatti - a.golSubiti) ||
      b.golFatti - a.golFatti ||
      b.fantapunti - a.fantapunti ||
      a.squadraId.localeCompare(b.squadraId),
  );
}

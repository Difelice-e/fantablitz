'use server';

/**
 * Le azioni della schermata formazione.
 *
 * Girano sul server, e non e' un dettaglio tecnico: la disposizione ottima e la
 * validazione vivono in `/fanta` e devono restare un posto solo. Riscriverle in
 * JavaScript per il browser significherebbe avere due algoritmi che col tempo
 * divergono, e il giorno in cui divergono la schermata dice una cosa e il
 * punteggio ne fa un'altra.
 */

import { revalidatePath } from 'next/cache';
import { archivio, contesto, leggiLega } from '../../../../src/dati.ts';
import { formazioneAutomatica, rosaDi, salvataDaFormazione } from '../../../../../jobs/src/lega.ts';
import { disponi, validaFormazione } from '../../../../../fanta/src/schieramento.ts';
import type { Formazione } from '../../../../../fanta/src/tipi.ts';

export type FormazioneGrezza = {
  modulo: string;
  /** slotId -> giocatoreId. Le caselle vuote non compaiono. */
  titolari: [string, string][];
  panchina: string[];
};

export type EsitoSalvataggio = {
  riuscito: boolean;
  messaggio: string;
  /** I problemi che hanno impedito il salvataggio, se ce ne sono. */
  problemi: string[];
};

function daGrezza(g: FormazioneGrezza): Formazione {
  return { modulo: g.modulo, titolari: new Map(g.titolari), panchina: [...g.panchina] };
}

function aGrezza(f: Formazione): FormazioneGrezza {
  return { modulo: f.modulo, titolari: [...f.titolari.entries()], panchina: [...f.panchina] };
}

/* ------------------------------------------------------------------ */

export async function salvaFormazione(
  legaId: string,
  squadraId: string,
  grezza: FormazioneGrezza,
): Promise<EsitoSalvataggio> {
  const stato = await leggiLega(legaId);
  if (!stato) return { riuscito: false, messaggio: 'Lega non trovata.', problemi: [] };

  const squadra = stato.squadre.find((s) => s.id === squadraId);
  if (!squadra) return { riuscito: false, messaggio: 'Squadra non trovata.', problemi: [] };

  const c = await contesto();
  const regole = c.regole[stato.modalita];
  const rosa = rosaDi(squadra, c);
  const formazione = daGrezza(grezza);

  const problemi = validaFormazione(formazione, rosa, regole);
  if (problemi.length > 0) {
    return {
      riuscito: false,
      messaggio: 'La formazione non è valida e non è stata salvata.',
      problemi: problemi.map((p) => p.messaggio),
    };
  }

  // Si schiera **sempre** per la prossima giornata. Una giornata gia' giocata
  // non si tocca: il suo risultato e' gia' stato letto da tutti, e permettere
  // di cambiarla significherebbe poter riscrivere il passato.
  const giornata = stato.giornateGiocate + 1;
  const altre = stato.formazioni.filter(
    (f) => !(f.squadraId === squadraId && f.giornata === giornata),
  );

  await archivio.scrivi({
    ...stato,
    formazioni: [...altre, salvataDaFormazione(squadraId, giornata, formazione)],
  });

  revalidatePath('/', 'layout');
  return { riuscito: true, messaggio: `Formazione salvata per la giornata ${giornata}.`, problemi: [] };
}

/**
 * Riempie le caselle da sola, col modulo scelto oppure col migliore.
 *
 * E' lo stesso algoritmo che usa la sostituzione automatica: quello che l'utente
 * vede qui e' quello che succederebbe se non toccasse niente.
 */
export async function riempiAutomaticamente(
  legaId: string,
  squadraId: string,
  modulo: string | null,
): Promise<FormazioneGrezza | null> {
  const stato = await leggiLega(legaId);
  if (!stato) return null;
  const squadra = stato.squadre.find((s) => s.id === squadraId);
  if (!squadra) return null;

  const c = await contesto();
  const regole = c.regole[stato.modalita];
  const rosa = rosaDi(squadra, c);

  if (modulo === null) return aGrezza(formazioneAutomatica(rosa, regole));

  const schema = regole.modulo(modulo);
  if (!schema) return null;

  const scelta = disponi(rosa, schema, regole);
  const titolari = new Set(scelta.titolari.values());
  return {
    modulo,
    titolari: [...scelta.titolari.entries()],
    panchina: rosa.filter((g) => !titolari.has(g.id)).map((g) => g.id),
  };
}

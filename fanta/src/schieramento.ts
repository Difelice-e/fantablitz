/**
 * Costruzione e validazione di una formazione.
 *
 * Tutto passa da `disponi`, che data una rosa e un modulo trova l'assegnazione
 * di costo minimo. Non conosce la modalita': chiede alle regole se un
 * accoppiamento e' ammesso e quanto costa, e il resto e' aritmetica.
 */

import type {
  Formazione, Livello, Modulo, Problema, Schierabile,
} from './tipi.ts';
import type { RegoleSchieramento } from './regole.ts';
import { assegnazioneOttima, VIETATO } from './assegnazione.ts';

export type Disposizione = {
  modulo: Modulo;
  /** slotId -> id del giocatore. Non contiene gli slot rimasti scoperti. */
  titolari: Map<string, string>;
  /** Slot che nessun giocatore disponibile poteva occupare. */
  slotScoperti: string[];
  /** Quanti giocatori sono fuori posizione. */
  adattati: string[];
  /** Somma dei costi, in unita' di adattamento. */
  costo: number;
  completa: boolean;
};

export type OpzioniDisposizione = {
  /**
   * Giocatori da tenere al loro posto se possibile: e' la formazione della
   * giornata precedente. Serve perche' la formazione e' persistente e non deve
   * cambiare piu' del necessario, altrimenti l'utente non riconosce piu' la
   * squadra che aveva schierato.
   */
  preferiti?: ReadonlyMap<string, string>;
  /**
   * Ordine di priorita' della panchina: `id -> posizione`, zero per primo.
   * A parita' di tutto il resto entra chi l'utente ha messo piu' in alto,
   * come vuole SPEC 6.3.
   */
  priorita?: ReadonlyMap<string, number>;
  /** Quanto pesa mantenere un preferito, rispetto a un adattamento. */
  pesoContinuita?: number;
  /** Quanto pesa un posto di differenza nell'ordine della panchina. */
  pesoPriorita?: number;
};

/**
 * I tre pesi vivono su scale separate di proposito, e l'ordine di grandezza e'
 * la cosa importante:
 *
 *   adattamento   1          una scelta di gioco
 *   continuita'   0.001      si decide solo fra soluzioni equivalenti
 *   priorita'     0.00001    decide solo fra soluzioni equivalenti anche in
 *                            continuita', e su venticinque giocatori il totale
 *                            resta sotto il peso della continuita'
 *
 * Cosi' nessuno dei due criteri minori puo' mai far preferire una formazione
 * con un adattamento in piu': sarebbe un bug difficile da vedere e facile da
 * contestare nella chat della lega.
 */
const PESO_CONTINUITA = 0.001;
const PESO_PRIORITA = 0.00001;

/**
 * Assegna i giocatori agli slot del modulo minimizzando il costo.
 *
 * Il costo primario e' il numero di adattamenti; la continuita' con la
 * formazione precedente entra con un peso piccolissimo, tanto da decidere solo
 * fra soluzioni altrimenti equivalenti. Non deve mai far preferire una
 * formazione con un adattamento in piu' solo per non spostare nessuno.
 */
export function disponi(
  rosa: readonly Schierabile[],
  modulo: Modulo,
  regole: RegoleSchieramento,
  opzioni: OpzioniDisposizione = {},
): Disposizione {
  const peso = opzioni.pesoContinuita ?? PESO_CONTINUITA;
  const pesoPriorita = opzioni.pesoPriorita ?? PESO_PRIORITA;

  if (rosa.length < modulo.slot.length) {
    return {
      modulo,
      titolari: new Map(),
      slotScoperti: modulo.slot.map((s) => s.id),
      adattati: [],
      costo: Number.POSITIVE_INFINITY,
      completa: false,
    };
  }

  const costi = modulo.slot.map((slot) =>
    rosa.map((giocatore, i) => {
      const esito = regole.valuta(giocatore, slot, modulo);
      if (!esito.ammesso) return VIETATO;
      const restaAlSuoPosto = opzioni.preferiti?.get(slot.id) === giocatore.id;
      const posizione = opzioni.priorita?.get(giocatore.id) ?? i;
      return esito.costo + (restaAlSuoPosto ? 0 : peso) + posizione * pesoPriorita;
    }),
  );

  const soluzione = assegnazioneOttima(costi);

  const titolari = new Map<string, string>();
  const adattati: string[] = [];
  let costo = 0;

  modulo.slot.forEach((slot, r) => {
    const c = soluzione.perRiga[r]!;
    if (c < 0) return;
    const giocatore = rosa[c]!;
    titolari.set(slot.id, giocatore.id);
    const esito = regole.valuta(giocatore, slot, modulo);
    costo += esito.costo;
    if (esito.costo > 0) adattati.push(giocatore.id);
  });

  const slotScoperti = soluzione.righeScoperte.map((r) => modulo.slot[r]!.id);

  return { modulo, titolari, slotScoperti, adattati, costo, completa: slotScoperti.length === 0 };
}

/**
 * La migliore disposizione fra tutti i moduli della modalita'.
 *
 * L'ordine di preferenza e' quello di SPEC 6.3: prima una soluzione senza
 * adattamenti, poi una con il minor numero di adattamenti. A parita' di tutto
 * vince il modulo indicato in `moduloPreferito`, cosi' la formazione non cambia
 * schema senza motivo.
 */
export function miglioreDisposizione(
  rosa: readonly Schierabile[],
  regole: RegoleSchieramento,
  opzioni: OpzioniDisposizione & { moduloPreferito?: string } = {},
): Disposizione | null {
  let migliore: Disposizione | null = null;

  for (const modulo of regole.moduli) {
    const candidata = disponi(rosa, modulo, regole, opzioni);
    if (migliore === null) {
      migliore = candidata;
      continue;
    }

    const meglio =
      candidata.slotScoperti.length !== migliore.slotScoperti.length
        ? candidata.slotScoperti.length < migliore.slotScoperti.length
        : candidata.costo !== migliore.costo
          ? candidata.costo < migliore.costo
          : modulo.nome === opzioni.moduloPreferito;

    if (meglio) migliore = candidata;
  }

  return migliore;
}

/* ------------------------------------------------------------------ */

/**
 * Copertura dei moduli: quali schemi la rosa riesce a schierare senza malus,
 * quali solo con adattamenti, quali non copre affatto.
 *
 * SPEC 6.1 chiede di mostrarla subito dopo l'import, ed e' l'informazione che
 * l'utente vuole vedere per prima: con rose da venticinque e quote classiche la
 * copertura e' tipicamente parziale.
 */
export type CoperturaModulo = {
  modulo: string;
  livello: 'perfetta' | 'adattata' | 'impossibile';
  adattamenti: number;
  slotScoperti: string[];
};

export function coperturaModuli(
  rosa: readonly Schierabile[],
  regole: RegoleSchieramento,
): CoperturaModulo[] {
  return regole.moduli.map((modulo) => {
    const d = disponi(rosa, modulo, regole);
    return {
      modulo: modulo.nome,
      livello: !d.completa ? 'impossibile' : d.costo === 0 ? 'perfetta' : 'adattata',
      adattamenti: d.completa ? d.adattati.length : 0,
      slotScoperti: d.slotScoperti,
    };
  });
}

/* ------------------------------------------------------------------ */

/** Controlla che una formazione salvata sia ancora valida e coerente. */
export function validaFormazione(
  formazione: Formazione,
  rosa: readonly Schierabile[],
  regole: RegoleSchieramento,
): Problema[] {
  const problemi: Problema[] = [];
  const modulo = regole.modulo(formazione.modulo);

  if (!modulo) {
    problemi.push({
      tipo: 'formazione',
      messaggio:
        `Il modulo "${formazione.modulo}" non esiste nella modalita’ ${regole.modalita}.`,
    });
    return problemi;
  }

  const perId = new Map(rosa.map((g) => [g.id, g]));
  const schierati = new Set<string>();

  for (const slot of modulo.slot) {
    const id = formazione.titolari.get(slot.id);
    if (id === undefined) {
      problemi.push({ tipo: 'slot', messaggio: `La casella ${slot.id} e’ vuota.` });
      continue;
    }
    if (schierati.has(id)) {
      problemi.push({ tipo: 'formazione', messaggio: `Il giocatore ${id} e’ schierato due volte.` });
    }
    schierati.add(id);

    const giocatore = perId.get(id);
    if (!giocatore) {
      problemi.push({ tipo: 'formazione', messaggio: `Il giocatore ${id} non e’ in rosa.` });
      continue;
    }
    if (!regole.valuta(giocatore, slot, modulo).ammesso) {
      problemi.push({
        tipo: 'slot',
        messaggio: `Il giocatore ${id} non puo’ occupare la casella ${slot.id}.`,
      });
    }
  }

  for (const slotId of formazione.titolari.keys()) {
    if (!modulo.slot.some((s) => s.id === slotId)) {
      problemi.push({
        tipo: 'formazione',
        messaggio: `La casella ${slotId} non esiste nel modulo ${modulo.nome}.`,
      });
    }
  }

  for (const id of formazione.panchina) {
    if (schierati.has(id)) {
      problemi.push({ tipo: 'formazione', messaggio: `Il giocatore ${id} e’ titolare e in panchina.` });
    }
    if (!perId.has(id)) {
      problemi.push({ tipo: 'formazione', messaggio: `In panchina c’e’ ${id}, che non e’ in rosa.` });
    }
  }

  return problemi;
}

/** Il livello raggiunto da una disposizione, per spiegarlo all'utente. */
export function livelloDi(disposizione: Disposizione, moduloIniziale: string): Livello {
  if (!disposizione.completa) return 'incompleta';
  if (disposizione.costo > 0) return 'adattata';
  return disposizione.modulo.nome === moduloIniziale ? 'perfetta' : 'efficiente';
}

/**
 * Sostituzioni automatiche.
 *
 * Il secondo contratto di SPEC 6.2. La strategia decide **come** si cerca un
 * rimpiazzo; le regole dicono **cosa** e' valido. La strategia non sa se sta
 * giocando in classic o in Mantra, e non deve saperlo.
 *
 * Serve quando un titolare e' infortunato o squalificato, e serve soprattutto
 * con `giornate_per_ciclo > 1`: in quel caso l'utente schiera una formazione
 * sola per tutto il ciclo e fra una giornata e l'altra l'adattamento e'
 * automatico. E' il punto dove ogni bug diventa una lite nella chat della lega,
 * quindi ogni caso ha il suo test.
 */

import type { Formazione, Livello, Schierabile } from './tipi.ts';
import type { RegoleSchieramento } from './regole.ts';
import { disponi, livelloDi, type Disposizione } from './schieramento.ts';

export type IngressoSostituzione = {
  formazione: Formazione;
  rosa: readonly Schierabile[];
  /** Chi non puo' scendere in campo: infortunati, squalificati, ceduti. */
  indisponibili: ReadonlySet<string>;
  regole: RegoleSchieramento;
};

export type Cambio = {
  slot: string;
  esce: string;
  entra: string;
  adattato: boolean;
};

export type RisultatoSostituzione = {
  formazione: Formazione;
  livello: Livello;
  cambi: Cambio[];
  /** Cambiato modulo per trovare una soluzione senza malus. */
  moduloCambiato: boolean;
  adattati: string[];
  /** Slot che nessuno poteva riempire: la squadra scende in campo incompleta. */
  slotScoperti: string[];
};

export type StrategiaSostituzione = {
  nome: string;
  adatta(ingresso: IngressoSostituzione): RisultatoSostituzione;
};

/* ------------------------------------------------------------------ */

/**
 * Elenco dei convocabili, nell'ordine in cui la strategia li considera.
 *
 * L'ordine e' quello di priorita' della panchina deciso dall'utente: i titolari
 * ancora disponibili per primi, poi la panchina nel suo ordine, poi chi non e'
 * stato nemmeno messo in panchina. Chi e' indisponibile non compare.
 */
function convocabili(ingresso: IngressoSostituzione): Schierabile[] {
  const { formazione, rosa, indisponibili } = ingresso;
  const perId = new Map(rosa.map((g) => [g.id, g]));
  const ordine: Schierabile[] = [];
  const presi = new Set<string>();

  const aggiungi = (id: string | undefined): void => {
    if (id === undefined || presi.has(id) || indisponibili.has(id)) return;
    const g = perId.get(id);
    if (!g) return;
    ordine.push(g);
    presi.add(id);
  };

  for (const id of formazione.titolari.values()) aggiungi(id);
  for (const id of formazione.panchina) aggiungi(id);
  for (const g of rosa) aggiungi(g.id);

  return ordine;
}

/**
 * Peso di continuita' decrescente lungo l'ordine dei convocabili.
 *
 * Serve a far rispettare la priorita' della panchina: a parita' di
 * adattamenti entra chi l'utente ha messo piu' in alto. I valori sono tutti
 * molto piu' piccoli di un adattamento, quindi non possono mai far preferire
 * una soluzione peggiore.
 */
function preferenzePerOrdine(ordinati: readonly Schierabile[]): Map<string, number> {
  const peso = new Map<string, number>();
  ordinati.forEach((g, i) => peso.set(g.id, i));
  return peso;
}

function componiRisultato(
  ingresso: IngressoSostituzione,
  scelta: Disposizione,
  ordinati: readonly Schierabile[],
): RisultatoSostituzione {
  const { formazione } = ingresso;
  const adattati = new Set(scelta.adattati);

  const cambi: Cambio[] = [];
  for (const slot of scelta.modulo.slot) {
    const prima = formazione.titolari.get(slot.id);
    const dopo = scelta.titolari.get(slot.id);
    if (dopo !== undefined && prima !== undefined && prima !== dopo) {
      cambi.push({ slot: slot.id, esce: prima, entra: dopo, adattato: adattati.has(dopo) });
    }
  }

  const titolari = new Set(scelta.titolari.values());
  // La panchina conserva l'ordine di priorita' dell'utente; chi e' salito in
  // campo esce dall'elenco, chi ne e' sceso ci rientra in fondo.
  const panchina = ordinati.filter((g) => !titolari.has(g.id)).map((g) => g.id);

  return {
    formazione: { modulo: scelta.modulo.nome, titolari: scelta.titolari, panchina },
    livello: livelloDi(scelta, formazione.modulo),
    cambi,
    moduloCambiato: scelta.modulo.nome !== formazione.modulo,
    adattati: scelta.adattati,
    slotScoperti: scelta.slotScoperti,
  };
}

/**
 * Strategia Basic.
 *
 * Ordine di ricerca, da SPEC 6.3:
 *
 *   1. soluzione **perfetta** nel modulo schierato
 *   2. soluzione **efficiente** con un altro modulo, senza malus
 *   3. soluzione **adattata**, col minor numero possibile di fuori posizione
 *
 * In `classic` il passo 3 non produce mai nulla di diverso dal passo 2, perche'
 * il malus di adattamento non esiste: la ricerca si ferma da sola. Non serve un
 * ramo dedicato, ed e' il segno che la separazione fra regole e strategia e'
 * quella giusta.
 */
export const strategiaBasic: StrategiaSostituzione = {
  nome: 'basic',

  adatta(ingresso) {
    const { formazione, regole } = ingresso;
    const ordinati = convocabili(ingresso);
    const preferenze = preferenzePerOrdine(ordinati);

    // La continuita' con la formazione precedente vale solo per chi e' ancora
    // disponibile: tenere in campo un infortunato non e' continuita'.
    const preferiti = new Map<string, string>();
    for (const [slot, id] of formazione.titolari) {
      if (!ingresso.indisponibili.has(id)) preferiti.set(slot, id);
    }

    const opzioni = { preferiti, priorita: preferenze };

    /* --- 1. perfetta, nel modulo schierato -------------------------- */

    const moduloAttuale = regole.modulo(formazione.modulo);
    if (moduloAttuale) {
      const nel = disponi(ordinati, moduloAttuale, regole, opzioni);
      if (nel.completa && nel.costo === 0) return componiRisultato(ingresso, nel, ordinati);
    }

    /* --- 2. efficiente, cambiando modulo ---------------------------- */

    let senzaMalus: Disposizione | null = null;
    let adattata: Disposizione | null = null;

    for (const modulo of regole.moduli) {
      const candidata = disponi(ordinati, modulo, regole, opzioni);
      if (!candidata.completa) continue;

      if (candidata.costo === 0) {
        if (senzaMalus === null || preferisci(candidata, senzaMalus, formazione.modulo)) {
          senzaMalus = candidata;
        }
      } else if (adattata === null || preferisci(candidata, adattata, formazione.modulo)) {
        adattata = candidata;
      }
    }

    if (senzaMalus) return componiRisultato(ingresso, senzaMalus, ordinati);

    /* --- 3. adattata ------------------------------------------------ */

    if (adattata) return componiRisultato(ingresso, adattata, ordinati);

    /* --- nessuna soluzione completa --------------------------------- */

    // Si scende in campo con quello che c'e': meglio una formazione incompleta
    // che nessuna formazione. Il chiamante vedra' `slotScoperti` e potra'
    // avvisare l'utente.
    if (regole.moduli.length === 0) {
      throw new Error('Nessun modulo disponibile: la configurazione della modalita’ e’ vuota.');
    }

    const migliore = regole.moduli
      .map((m) => disponi(ordinati, m, regole, opzioni))
      .reduce((a, b) =>
        b.slotScoperti.length !== a.slotScoperti.length
          ? b.slotScoperti.length < a.slotScoperti.length
            ? b
            : a
          : preferisci(b, a, formazione.modulo)
            ? b
            : a,
      );

    return componiRisultato(ingresso, migliore, ordinati);
  },
};

/** A parita' di costo vince il modulo gia' schierato: meno sorprese per l'utente. */
function preferisci(candidata: Disposizione, attuale: Disposizione, moduloIniziale: string): boolean {
  if (candidata.costo !== attuale.costo) return candidata.costo < attuale.costo;
  if (candidata.modulo.nome === moduloIniziale) return true;
  if (attuale.modulo.nome === moduloIniziale) return false;
  return candidata.modulo.nome.localeCompare(attuale.modulo.nome) < 0;
}

/**
 * Calendario degli scontri diretti della lega (SPEC 6.4).
 *
 * Dieci squadre fanno un girone da nove giornate, e 38 non e' un multiplo di
 * nove. La specifica risolve cosi': **quattro gironi completi** fanno 36
 * giornate, e le ultime due ripetono le prime due **a campi invertiti**.
 *
 * I gironi si alternano di campo — andata, ritorno, andata, ritorno — cosi' chi
 * ha giocato in casa al primo girone gioca fuori al secondo. Le giornate della
 * lega sono allineate a quelle del mondo simulato: la giornata 12 della lega si
 * gioca sui voti della giornata 12 del campionato.
 */

export type ScontroDiretto = { casaId: string; ospiteId: string };

export type GiornataFanta = {
  numero: number;
  scontri: ScontroDiretto[];
  /** Vero per le due giornate finali, che ripetono le prime due. */
  ripetuta: boolean;
};

export type CalendarioFanta = { giornate: GiornataFanta[] };

export type OpzioniCalendarioFanta = {
  /** Ordine delle squadre nel cerchio: decide gli accoppiamenti. */
  squadre: readonly string[];
  /** Quante giornate deve durare il campionato. Default 38. */
  giornate?: number;
};

/**
 * Accoppiamenti di un girone completo, col metodo del cerchio.
 *
 * E' lo stesso metodo del calendario del mondo simulato, ma qui le squadre sono
 * dieci invece di venti: il girone dura nove giornate.
 */
function girone(numeroSquadre: number): [number, number][][] {
  if (numeroSquadre % 2 !== 0) {
    throw new Error(`Il calendario richiede un numero pari di squadre, ricevute ${numeroSquadre}`);
  }

  const fisso = 0;
  const ruotanti = Array.from({ length: numeroSquadre - 1 }, (_, i) => i + 1);
  const giornate: [number, number][][] = [];

  for (let r = 0; r < numeroSquadre - 1; r++) {
    const scontri: [number, number][] = [];
    scontri.push(r % 2 === 0 ? [fisso, ruotanti[0]!] : [ruotanti[0]!, fisso]);

    for (let i = 1; i < numeroSquadre / 2; i++) {
      const a = ruotanti[i]!;
      const b = ruotanti[ruotanti.length - i]!;
      scontri.push(i % 2 === 0 ? [a, b] : [b, a]);
    }

    giornate.push(scontri);
    ruotanti.unshift(ruotanti.pop()!);
  }

  return giornate;
}

export function generaCalendarioFanta(opzioni: OpzioniCalendarioFanta): CalendarioFanta {
  const squadre = opzioni.squadre;
  const totale = opzioni.giornate ?? 38;

  if (squadre.length < 2) {
    throw new Error(`Servono almeno due squadre, ricevute ${squadre.length}`);
  }
  if (new Set(squadre).size !== squadre.length) {
    throw new Error('Due squadre della lega hanno lo stesso identificativo');
  }

  const base = girone(squadre.length);
  const perGirone = base.length;
  const giornate: GiornataFanta[] = [];

  const componi = (
    scontri: [number, number][],
    inverti: boolean,
    ripetuta: boolean,
  ): void => {
    giornate.push({
      numero: giornate.length + 1,
      ripetuta,
      scontri: scontri.map(([a, b]) => ({
        casaId: squadre[inverti ? b : a]!,
        ospiteId: squadre[inverti ? a : b]!,
      })),
    });
  };

  // Gironi completi, alternando il campo a ogni giro.
  const gironiCompleti = Math.floor(totale / perGirone);
  for (let g = 0; g < gironiCompleti; g++) {
    for (const giornata of base) componi(giornata, g % 2 === 1, false);
  }

  // Le giornate che avanzano ripetono le prime **a campi invertiti** (SPEC 6.4).
  // L'inversione e' rispetto al PRIMO girone, che e' quello che ripetono: il
  // primo girone si gioca dritto, quindi le ripetute si giocano rovesciate.
  // Prendere l'orientamento dall'ultimo girone sarebbe sbagliato, e con quattro
  // gironi darebbe una copia identica della prima giornata invece del ritorno.
  const orientamentoPrimoGirone = false;
  const restanti = totale - giornate.length;
  for (let i = 0; i < restanti; i++) {
    componi(base[i % perGirone]!, !orientamentoPrimoGirone, true);
  }

  return { giornate };
}

/** Tutti gli scontri di una squadra, in ordine di giornata. */
export function scontriDi(
  calendario: CalendarioFanta,
  squadraId: string,
): { giornata: GiornataFanta; scontro: ScontroDiretto }[] {
  const risultato: { giornata: GiornataFanta; scontro: ScontroDiretto }[] = [];
  for (const giornata of calendario.giornate) {
    const scontro = giornata.scontri.find(
      (s) => s.casaId === squadraId || s.ospiteId === squadraId,
    );
    if (scontro) risultato.push({ giornata, scontro });
  }
  return risultato;
}

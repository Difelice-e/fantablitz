/**
 * Assegnazione ottima di giocatori a slot.
 *
 * Il problema e' quello classico dell'assegnazione: undici caselle, venticinque
 * candidati, ogni accoppiamento ha un costo, e serve la combinazione col costo
 * totale minimo.
 *
 * **Perche' non un algoritmo goloso.** La tentazione e' riempire gli slot uno
 * alla volta prendendo ogni volta il candidato migliore. Non funziona: mettere
 * l'unico braccetto disponibile in una casella che avrebbe potuto occupare
 * anche un centrale lascia scoperta la casella che solo lui poteva riempire, e
 * si conclude che la formazione non e' schierabile quando invece lo era. In una
 * lega fra amici una risposta del genere e' una lite garantita, quindi qui
 * dentro serve l'ottimo vero.
 *
 * Si usa l'algoritmo ungherese (Kuhn-Munkres) nella formulazione con
 * potenziali, che risolve il caso rettangolare in tempo cubico: con undici
 * caselle e venticinque giocatori e' istantaneo.
 */

/**
 * Costo convenzionale di un accoppiamento vietato.
 *
 * Non si usa `Infinity` perche' l'algoritmo fa differenze fra costi e i conti
 * con l'infinito danno `NaN`. Il valore e' abbastanza grande da non competere
 * mai con una soluzione reale: qualunque assegnazione che ne usi uno vale piu'
 * di qualunque assegnazione che non ne usi nessuno.
 */
export const VIETATO = 1e9;

export type Assegnazione = {
  /** Per ogni riga, la colonna assegnata, oppure -1. */
  perRiga: number[];
  /** Somma dei costi delle assegnazioni valide. */
  costo: number;
  /** Righe rimaste senza una colonna ammessa. */
  righeScoperte: number[];
};

/**
 * Risolve l'assegnazione di costo minimo.
 *
 * `costi[r][c]` e' il costo di mettere la colonna `c` nella riga `r`, oppure
 * `VIETATO`. Le righe sono gli slot, le colonne i giocatori.
 *
 * **I candidati possono essere meno delle caselle.** Non e' un caso di
 * laboratorio: succede ogni volta che a una squadra restano meno di undici
 * giocatori con un voto, ed e' frequente quanto le giornate infrasettimanali.
 * Le caselle che nessuno puo' occupare tornano in `righeScoperte`, e le altre
 * vengono riempite lo stesso, nel modo migliore: scendere in campo in dieci
 * vale molto piu' che non scendere affatto.
 */
export function assegnazioneOttima(costi: readonly (readonly number[])[]): Assegnazione {
  const righe = costi.length;
  const colonneVere = righe === 0 ? 0 : costi[0]!.length;

  if (righe === 0) return { perRiga: [], costo: 0, righeScoperte: [] };

  // Con meno candidati che caselle si aggiungono candidati fittizi, vietati
  // ovunque: l'algoritmo assegna loro le caselle che avanzano, e il giro
  // finale le riconosce come scoperte perche' costano `VIETATO`. Il risultato
  // e' l'assegnazione ottima di quelli veri.
  const tabella: readonly (readonly number[])[] =
    colonneVere >= righe
      ? costi
      : costi.map((riga) => [...riga, ...new Array<number>(righe - colonneVere).fill(VIETATO)]);
  const colonne = tabella[0]!.length;

  // Indici a base uno, come vuole la formulazione classica: la riga 0 e la
  // colonna 0 fanno da sentinella.
  const u = new Array<number>(righe + 1).fill(0); // potenziale delle righe
  const v = new Array<number>(colonne + 1).fill(0); // potenziale delle colonne
  const rigaDiColonna = new Array<number>(colonne + 1).fill(0);
  const percorso = new Array<number>(colonne + 1).fill(0);

  for (let r = 1; r <= righe; r++) {
    rigaDiColonna[0] = r;
    let colonnaCorrente = 0;
    const minimo = new Array<number>(colonne + 1).fill(Number.POSITIVE_INFINITY);
    const usata = new Array<boolean>(colonne + 1).fill(false);

    // Cerca un cammino aumentante, aggiornando i potenziali a ogni passo.
    do {
      usata[colonnaCorrente] = true;
      const rigaCorrente = rigaDiColonna[colonnaCorrente]!;
      let delta = Number.POSITIVE_INFINITY;
      let prossimaColonna = 0;

      for (let c = 1; c <= colonne; c++) {
        if (usata[c]) continue;
        const costoRidotto = tabella[rigaCorrente - 1]![c - 1]! - u[rigaCorrente]! - v[c]!;
        if (costoRidotto < minimo[c]!) {
          minimo[c] = costoRidotto;
          percorso[c] = colonnaCorrente;
        }
        if (minimo[c]! < delta) {
          delta = minimo[c]!;
          prossimaColonna = c;
        }
      }

      for (let c = 0; c <= colonne; c++) {
        if (usata[c]) {
          u[rigaDiColonna[c]!] = u[rigaDiColonna[c]!]! + delta;
          v[c] = v[c]! - delta;
        } else {
          minimo[c] = minimo[c]! - delta;
        }
      }

      colonnaCorrente = prossimaColonna;
    } while (rigaDiColonna[colonnaCorrente] !== 0);

    // Ripercorre il cammino all'indietro applicando gli scambi.
    do {
      const precedente = percorso[colonnaCorrente]!;
      rigaDiColonna[colonnaCorrente] = rigaDiColonna[precedente]!;
      colonnaCorrente = precedente;
    } while (colonnaCorrente !== 0);
  }

  const perRiga = new Array<number>(righe).fill(-1);
  for (let c = 1; c <= colonne; c++) {
    const r = rigaDiColonna[c]!;
    if (r > 0) perRiga[r - 1] = c - 1;
  }

  // Le assegnazioni che hanno dovuto usare un accoppiamento vietato non sono
  // assegnazioni: quello slot e' rimasto scoperto.
  const righeScoperte: number[] = [];
  let costo = 0;
  for (let r = 0; r < righe; r++) {
    const c = perRiga[r]!;
    // Un candidato fittizio non e' un candidato: la casella resta scoperta.
    if (c < 0 || c >= colonneVere || tabella[r]![c]! >= VIETATO) {
      righeScoperte.push(r);
      perRiga[r] = -1;
    } else {
      costo += tabella[r]![c]!;
    }
  }

  return { perRiga, costo, righeScoperte };
}

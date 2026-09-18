/**
 * Casualita' del motore.
 *
 * Regola architetturale 3: dentro `/engine` `Math.random()` e' vietato. Ogni
 * numero estratto viene da un generatore passato come dipendenza, cosi' la
 * stessa partita rigiocata con lo stesso seme da' lo stesso identico risultato.
 * Serve per i test, per la calibrazione e per dirimere le contestazioni: se un
 * utente contesta un risultato, lo si rigenera e si guarda.
 *
 * Il generatore e' deliberatamente **senza stato condiviso**: ogni partita
 * riceve il proprio, seminato su (seme della lega, stagione, giornata, partita).
 * Cosi' simulare la giornata 12 non dipende dall'aver simulato la 11, e il job
 * serale puo' essere idempotente davvero (regola 6).
 */

export type Generatore = {
  /** Reale uniforme in [0, 1). */
  reale(): number;
  /** Intero uniforme in [min, max], estremi inclusi. */
  intero(min: number, max: number): number;
  /** Vero con probabilita' `p`. */
  bernoulli(p: number): boolean;
  /** Normale, troncata a +/- 3 deviazioni. */
  normale(media: number, deviazione: number): number;
  /** Conteggio di Poisson con media `lambda`. */
  poisson(lambda: number): number;
  /** Un elemento, con probabilita' proporzionale al peso. */
  pesato<T>(voci: readonly T[], peso: (v: T) => number): T;
  /** Mescola una copia dell'array. */
  mescola<T>(voci: readonly T[]): T[];
};

/**
 * mulberry32: generatore a 32 bit, poche righe e ottima distribuzione.
 * Non e' crittografico e non deve esserlo: serve solo riproducibilita'.
 */
export function generatore(semeIniziale: number): Generatore {
  let stato = semeIniziale >>> 0;

  const reale = (): number => {
    stato = (stato + 0x6d2b79f5) >>> 0;
    let t = stato;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const normale = (media: number, deviazione: number): number => {
    // Box-Muller. Il logaritmo di zero non esiste: si riparte.
    let u = reale();
    while (u === 0) u = reale();
    const v = reale();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return media + deviazione * Math.max(-3, Math.min(3, z));
  };

  return {
    reale,
    normale,

    intero: (min, max) => min + Math.floor(reale() * (max - min + 1)),

    bernoulli: (p) => reale() < p,

    /**
     * Algoritmo di Knuth per lambda piccoli, approssimazione normale sopra 30.
     * Nel calcio lambda sta sotto 4, quindi si usa sempre il primo ramo; il
     * secondo protegge dalle statistiche individuali, dove qualche media
     * (passaggi tentati) arriva anche a 60.
     */
    poisson: (lambda) => {
      if (!(lambda > 0)) return 0;
      if (lambda < 30) {
        const limite = Math.exp(-lambda);
        let k = 0;
        let prodotto = reale();
        while (prodotto > limite) {
          k++;
          prodotto *= reale();
        }
        return k;
      }
      return Math.max(0, Math.round(normale(lambda, Math.sqrt(lambda))));
    },

    pesato: <T,>(voci: readonly T[], peso: (v: T) => number): T => {
      if (voci.length === 0) throw new Error('Estrazione pesata su un insieme vuoto');
      let totale = 0;
      for (const v of voci) totale += Math.max(0, peso(v));
      // Tutti i pesi a zero: nessuno e' piu' probabile di un altro.
      if (totale <= 0) return voci[Math.floor(reale() * voci.length)]!;

      let soglia = reale() * totale;
      for (const v of voci) {
        soglia -= Math.max(0, peso(v));
        if (soglia < 0) return v;
      }
      return voci[voci.length - 1]!;
    },

    mescola: <T,>(voci: readonly T[]): T[] => {
      const copia = [...voci];
      // Fisher-Yates.
      for (let i = copia.length - 1; i > 0; i--) {
        const j = Math.floor(reale() * (i + 1));
        [copia[i], copia[j]] = [copia[j]!, copia[i]!];
      }
      return copia;
    },
  };
}

/**
 * Seme derivato da parti testuali, senza dipendere da `node:crypto`: il motore
 * resta puro e utilizzabile anche nel browser.
 *
 * E' FNV-1a a 32 bit: minuscolo, deterministico e con dispersione piu' che
 * sufficiente per separare i flussi di due partite diverse.
 */
export function seme(...parti: (string | number)[]): number {
  let h = 0x811c9dc5;
  for (const parte of parti) {
    const testo = String(parte);
    for (let i = 0; i < testo.length; i++) {
      h ^= testo.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= 0x1f; // separatore fra le parti: "ab","c" non collide con "a","bc"
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

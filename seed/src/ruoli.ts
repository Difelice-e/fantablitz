/** Ruoli Mantra e ruoli classici: tipi, parsing e normalizzazione. */

/** I dodici ruoli Mantra. L'ordine e' quello canonico, dal portiere alla punta. */
export const RUOLI_MANTRA = [
  'Por', 'Dc', 'B', 'Dd', 'Ds', 'E', 'M', 'C', 'W', 'T', 'A', 'Pc',
] as const;
export type RuoloMantra = (typeof RUOLI_MANTRA)[number];

/** I quattro ruoli del fantacalcio classico, come compaiono nella colonna `R`. */
export const RUOLI_CLASSICI = ['P', 'D', 'C', 'A'] as const;
export type RuoloClassico = (typeof RUOLI_CLASSICI)[number];

const PER_CONFRONTO = new Map<string, RuoloMantra>(
  RUOLI_MANTRA.map((r) => [r.toLowerCase(), r]),
);

const POSIZIONE = new Map<RuoloMantra, number>(RUOLI_MANTRA.map((r, i) => [r, i]));

export function eRuoloMantra(s: string): s is RuoloMantra {
  return PER_CONFRONTO.has(s.trim().toLowerCase());
}

export function eRuoloClassico(s: string): s is RuoloClassico {
  return (RUOLI_CLASSICI as readonly string[]).includes(s);
}

/**
 * Interpreta una lista di ruoli Mantra.
 *
 * Il listone .xlsx separa con punto e virgola (`E;W`), gli export Fantalab con
 * virgola (`"Dc,Dd"`). Accettiamo entrambe le convenzioni, piu' spazi di troppo,
 * perche' la stessa funzione serve al seed e all'importatore.
 *
 * L'ordine di dichiarazione viene conservato: nel listone il primo ruolo e'
 * quello principale, e la derivazione dei rating gli da' piu' peso.
 */
export function leggiRuoliMantra(grezzo: string): RuoloMantra[] {
  const pezzi = grezzo.split(/[;,/]/).map((p) => p.trim()).filter((p) => p.length > 0);
  if (pezzi.length === 0) throw new Error(`Lista di ruoli Mantra vuota: "${grezzo}"`);

  const ruoli: RuoloMantra[] = [];
  for (const pezzo of pezzi) {
    const ruolo = PER_CONFRONTO.get(pezzo.toLowerCase());
    if (!ruolo) throw new Error(`Ruolo Mantra sconosciuto: "${pezzo}" (in "${grezzo}")`);
    if (!ruoli.includes(ruolo)) ruoli.push(ruolo);
  }
  return ruoli;
}

/** Riordina secondo l'ordine canonico. Serve per confrontare due liste di ruoli. */
export function ordinaCanonico(ruoli: readonly RuoloMantra[]): RuoloMantra[] {
  return [...ruoli].sort((a, b) => POSIZIONE.get(a)! - POSIZIONE.get(b)!);
}

/** Due liste contengono gli stessi ruoli, a prescindere dall'ordine? */
export function stessiRuoli(a: readonly RuoloMantra[], b: readonly RuoloMantra[]): boolean {
  if (a.length !== b.length) return false;
  const x = ordinaCanonico(a);
  const y = ordinaCanonico(b);
  return x.every((r, i) => r === y[i]);
}

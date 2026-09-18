/**
 * Generazione del calendario.
 *
 * Girone all'italiana con andata e ritorno: con 20 club fanno 19 + 19 = 38
 * giornate, che e' esattamente la durata prevista dalla specifica.
 *
 * Il metodo e' quello del cerchio: si fissa una squadra e si fanno ruotare le
 * altre diciannove attorno. Garantisce per costruzione che ogni giornata
 * contenga tutte le squadre una volta sola e che ogni coppia si incontri una
 * volta per girone.
 *
 * Tre o quattro giornate sono **infrasettimanali** (SPEC 5.3): servono a dare
 * senso alle rotazioni, perche' giocare due volte in pochi giorni consuma
 * condizione e costringe l'allenatore a cambiare. Le settimane di coppa non
 * generano partite: consumano condizione ai club impegnati in Europa.
 */

import type { Club, Mondo } from './mondo.ts';
import { generatore, seme, type Generatore } from './casuale.ts';

export type Partita = {
  casaId: string;
  ospiteId: string;
};

export type Giornata = {
  /** Numero di giornata, da 1 a 38. */
  numero: number;
  /** Seconda partita in pochi giorni: pesa di piu' sulla condizione. */
  infrasettimanale: boolean;
  /** Settimana di coppa: i club impegnati in Europa consumano condizione. */
  turnoDiCoppa: boolean;
  partite: Partita[];
};

export type Calendario = {
  stagione: string;
  giornate: Giornata[];
};

export type OpzioniCalendario = {
  /** Seme della lega: due leghe diverse hanno calendari diversi. */
  seme: string;
  /** Quante giornate infrasettimanali. Default 4, come da specifica (3-4). */
  giornateInfrasettimanali?: number;
  /** Quanti turni di coppa nella stagione. */
  turniDiCoppa?: number;
};

/**
 * Accoppiamenti di un girone completo col metodo del cerchio.
 *
 * Restituisce `giornate[r][i] = [indiceCasa, indiceOspite]`. L'alternanza di
 * campo dentro la rotazione serve a non dare a nessuno una raffica di partite
 * tutte in casa.
 */
function gironeAllItaliana(numeroSquadre: number): [number, number][][] {
  if (numeroSquadre % 2 !== 0) {
    throw new Error(`Il calendario richiede un numero pari di squadre, ricevute ${numeroSquadre}`);
  }

  const fisso = 0;
  const ruotanti = Array.from({ length: numeroSquadre - 1 }, (_, i) => i + 1);
  const giornate: [number, number][][] = [];

  for (let r = 0; r < numeroSquadre - 1; r++) {
    const partite: [number, number][] = [];

    // La squadra fissa incontra la prima della rotazione, alternando il campo.
    partite.push(r % 2 === 0 ? [fisso, ruotanti[0]!] : [ruotanti[0]!, fisso]);

    // Le altre si accoppiano dalle estremita' verso il centro.
    for (let i = 1; i < numeroSquadre / 2; i++) {
      const a = ruotanti[i]!;
      const b = ruotanti[ruotanti.length - i]!;
      partite.push(i % 2 === 0 ? [a, b] : [b, a]);
    }

    giornate.push(partite);
    ruotanti.unshift(ruotanti.pop()!); // rotazione di un posto
  }

  return giornate;
}

/**
 * Sceglie quali giornate sono infrasettimanali, distribuendole nella stagione.
 *
 * Si evitano la prima e l'ultima giornata, e si tiene una distanza minima fra
 * due turni infrasettimanali: tre turni di fila renderebbero la rotazione
 * obbligatoria invece che una scelta.
 */
function distribuisci(
  quante: number,
  totale: number,
  rng: Generatore,
): Set<number> {
  const scelte = new Set<number>();
  if (quante <= 0) return scelte;

  // Si divide la stagione in `quante` fasce e se ne prende una per fascia:
  // distribuite ma non meccanicamente equidistanti.
  const ampiezza = (totale - 2) / quante;
  for (let i = 0; i < quante; i++) {
    const inizio = Math.floor(2 + i * ampiezza);
    const fine = Math.min(totale - 1, Math.floor(2 + (i + 1) * ampiezza) - 1);
    if (fine < inizio) continue;
    scelte.add(rng.intero(inizio, fine));
  }
  return scelte;
}

export function generaCalendario(mondo: Mondo, opzioni: OpzioniCalendario): Calendario {
  const club: Club[] = mondo.club;
  const rng = generatore(seme(opzioni.seme, 'calendario', mondo.stagione));

  // L'ordine delle squadre nel cerchio decide gli accoppiamenti: mescolarlo
  // rende diversi i calendari di due leghe con lo stesso mondo.
  const ordine = rng.mescola(club);
  const andata = gironeAllItaliana(ordine.length);

  const giornate: Giornata[] = [];
  const infrasettimanali = distribuisci(opzioni.giornateInfrasettimanali ?? 4, 38, rng);
  const coppe = distribuisci(opzioni.turniDiCoppa ?? 6, 38, rng);

  const aggiungi = (partite: [number, number][], invertiCampo: boolean): void => {
    const numero = giornate.length + 1;
    giornate.push({
      numero,
      infrasettimanale: infrasettimanali.has(numero),
      turnoDiCoppa: coppe.has(numero),
      partite: partite.map(([a, b]) => ({
        casaId: ordine[invertiCampo ? b : a]!.id,
        ospiteId: ordine[invertiCampo ? a : b]!.id,
      })),
    });
  };

  for (const giornata of andata) aggiungi(giornata, false);
  for (const giornata of andata) aggiungi(giornata, true); // ritorno, campi invertiti

  return { stagione: mondo.stagione, giornate };
}

/** Tutte le partite di un club, in ordine di giornata. */
export function partiteDi(calendario: Calendario, clubId: string): { giornata: Giornata; partita: Partita }[] {
  const risultato: { giornata: Giornata; partita: Partita }[] = [];
  for (const giornata of calendario.giornate) {
    const partita = giornata.partite.find((p) => p.casaId === clubId || p.ospiteId === clubId);
    if (partita) risultato.push({ giornata, partita });
  }
  return risultato;
}

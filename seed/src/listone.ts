/**
 * Lettura del listone ufficiale Mantra di Fantacalcio.it.
 *
 * Trasforma il foglio `Tutti` in righe tipizzate e validate, e usa il foglio
 * `Ceduti` come lista di esclusione. Tutto cio' che e' specifico del formato
 * del listone finisce qui: chi sta a valle vede solo `RigaListone`.
 */

import { leggiCartella, type Cella, type Foglio } from './xlsx.ts';
import {
  eRuoloClassico,
  leggiRuoliMantra,
  type RuoloClassico,
  type RuoloMantra,
} from './ruoli.ts';

/** Una riga del listone, gia' validata. */
export type RigaListone = {
  /** `Id` di Fantacalcio.it. Riferimento esterno, non la chiave del dominio. */
  idEsterno: number;
  ruoloClassico: RuoloClassico;
  ruoliMantra: RuoloMantra[];
  nome: string;
  /** Nome esteso del club, come scritto nel listone (`Inter`, `Hellas Verona`). */
  squadra: string;
  quotazioneAsta: number;
  quotazioneIniziale: number;
  quotazioneAstaMantra: number;
  quotazioneInizialeMantra: number;
  valoreMercato: number;
  /** FVM Mantra, scala 1-450. E' il segnale principale per i rating. */
  valoreMercatoMantra: number;
  /** Numero della riga nel foglio, solo per i messaggi di errore. */
  riga: number;
};

export type Listone = {
  giocatori: RigaListone[];
  /** Righe del foglio `Ceduti`: giocatori usciti dalla Serie A, da escludere. */
  ceduti: RigaListone[];
  /** Id scartati perche' presenti anche fra i ceduti. */
  esclusiPerCessione: number[];
};

const INTESTAZIONI = [
  'Id', 'R', 'RM', 'Nome', 'Squadra',
  'Qt.A', 'Qt.I', 'Diff.', 'Qt.A M', 'Qt.I M', 'Diff.M', 'FVM', 'FVM M',
] as const;

const FOGLIO_TUTTI = 'Tutti';
const FOGLIO_CEDUTI = 'Ceduti';

/** Una riga piu' corta del previsto restituisce `undefined`: vale cella vuota. */
function normalizza(c: Cella | undefined): string {
  return typeof c === 'string' ? c.trim() : c == null ? '' : String(c);
}

/**
 * Individua la riga delle intestazioni.
 *
 * Ogni foglio del listone ha una riga di titolo prima delle intestazioni, ma
 * cercarle invece di saltare un numero fisso di righe costa poco e protegge da
 * un cambio di formato l'anno prossimo.
 */
function trovaIntestazioni(foglio: Foglio): number {
  const limite = Math.min(foglio.righe.length, 10);
  for (let i = 0; i < limite; i++) {
    const riga = foglio.righe[i] ?? [];
    if (INTESTAZIONI.every((titolo, c) => normalizza(riga[c]) === titolo)) return i;
  }
  throw new Error(
    `Foglio "${foglio.nome}": intestazioni non trovate nelle prime ${limite} righe. ` +
      `Attese: ${INTESTAZIONI.join(', ')}`,
  );
}

function numero(c: Cella | undefined, campo: string, riga: number): number {
  const v = typeof c === 'number' ? c : Number(normalizza(c).replace(',', '.'));
  if (!Number.isFinite(v)) {
    throw new Error(`Riga ${riga}: campo "${campo}" non numerico (${JSON.stringify(c)})`);
  }
  return v;
}

function leggiFoglio(foglio: Foglio): RigaListone[] {
  const intestazioni = trovaIntestazioni(foglio);
  const righe: RigaListone[] = [];

  for (let i = intestazioni + 1; i < foglio.righe.length; i++) {
    const riga = foglio.righe[i] ?? [];
    const numeroRiga = i + 1; // come lo mostra Excel
    if (riga.every((c) => c == null || normalizza(c) === '')) continue; // riga vuota

    const ruoloClassico = normalizza(riga[1]);
    if (!eRuoloClassico(ruoloClassico)) {
      throw new Error(`Riga ${numeroRiga}: ruolo classico sconosciuto "${ruoloClassico}"`);
    }

    const nome = normalizza(riga[3]);
    if (nome === '') throw new Error(`Riga ${numeroRiga}: nome mancante`);
    const squadra = normalizza(riga[4]);
    if (squadra === '') throw new Error(`Riga ${numeroRiga}: squadra mancante per "${nome}"`);

    righe.push({
      idEsterno: numero(riga[0], 'Id', numeroRiga),
      ruoloClassico,
      ruoliMantra: leggiRuoliMantra(normalizza(riga[2])),
      nome,
      squadra,
      quotazioneAsta: numero(riga[5], 'Qt.A', numeroRiga),
      quotazioneIniziale: numero(riga[6], 'Qt.I', numeroRiga),
      quotazioneAstaMantra: numero(riga[8], 'Qt.A M', numeroRiga),
      quotazioneInizialeMantra: numero(riga[9], 'Qt.I M', numeroRiga),
      valoreMercato: numero(riga[11], 'FVM', numeroRiga),
      valoreMercatoMantra: numero(riga[12], 'FVM M', numeroRiga),
      riga: numeroRiga,
    });
  }
  return righe;
}

/** Legge il listone da un buffer .xlsx ed esclude i ceduti. */
export function leggiListone(contenuto: Buffer): Listone {
  return leggiListoneDaFogli(leggiCartella(contenuto));
}

/**
 * Stesso lavoro di `leggiListone`, ma a partire dai fogli gia' estratti.
 * E' la porta d'ingresso dei test: permette di costruire a mano un listone
 * malformato senza dover confezionare un archivio .xlsx.
 */
export function leggiListoneDaFogli(fogli: Foglio[]): Listone {
  const prendi = (nome: string): Foglio => {
    const f = fogli.find((x) => x.nome === nome);
    if (!f) {
      throw new Error(
        `Foglio "${nome}" assente. Fogli presenti: ${fogli.map((x) => x.nome).join(', ')}`,
      );
    }
    return f;
  };

  const tutti = leggiFoglio(prendi(FOGLIO_TUTTI));
  const ceduti = leggiFoglio(prendi(FOGLIO_CEDUTI));

  const visti = new Map<number, RigaListone>();
  for (const g of tutti) {
    const gia = visti.get(g.idEsterno);
    if (gia) {
      throw new Error(
        `Id ${g.idEsterno} duplicato nel foglio "${FOGLIO_TUTTI}": ` +
          `riga ${gia.riga} ("${gia.nome}") e riga ${g.riga} ("${g.nome}")`,
      );
    }
    visti.set(g.idEsterno, g);
  }

  // Nel listone 2026/27 i ceduti non compaiono gia' in `Tutti`, ma l'esclusione
  // resta: e' una garanzia sul formato, non una constatazione sul file di oggi.
  const idCeduti = new Set(ceduti.map((c) => c.idEsterno));
  const esclusiPerCessione = tutti.filter((g) => idCeduti.has(g.idEsterno)).map((g) => g.idEsterno);
  const giocatori = tutti.filter((g) => !idCeduti.has(g.idEsterno));

  return { giocatori, ceduti, esclusiPerCessione };
}

/** Comodita' per l'uso da riga di comando. */
export async function leggiListoneDaFile(percorso: string): Promise<Listone> {
  const { readFile } = await import('node:fs/promises');
  return leggiListone(await readFile(percorso));
}

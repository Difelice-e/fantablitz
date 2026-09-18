/**
 * Lettore CSV minimale.
 *
 * Gli export Fantalab sono CRLF, in UTF-8, con i campi quotati e senza ritorno
 * a capo finale. Serve poco piu' che questo, e scriverlo costa meno che
 * discutere quale libreria adottare: il formato lo conosciamo, i file veri sono
 * in `/fixtures` e i test partono da li'.
 *
 * Una cosa e' voluta: le righe conservano il **numero di riga del file**. Un
 * messaggio d'errore che dice "riga 137" si verifica aprendo il csv; uno che
 * dice "riga 136" fa perdere mezz'ora a chi cerca di capire dove ha sbagliato.
 */

export type RigaCsv = {
  /** Numero di riga come lo mostra un editor, a partire da 1. */
  numero: number;
  campi: string[];
  /** La riga come stava nel file, utile nei messaggi d'errore. */
  originale: string;
};

/**
 * Spezza una riga in campi, rispettando le virgolette.
 *
 * Dentro un campo quotato le virgole non separano, e due virgolette di fila
 * valgono una virgoletta sola. E' la convenzione che Fantalab usa per i nomi
 * di squadra con la virgola e per le liste di ruoli come `"Dc,Dd"`.
 */
export function spezzaRiga(riga: string): string[] {
  const campi: string[] = [];
  let corrente = '';
  let dentroVirgolette = false;

  for (let i = 0; i < riga.length; i++) {
    const c = riga[i]!;

    if (c === '"') {
      if (dentroVirgolette && riga[i + 1] === '"') {
        corrente += '"';
        i++;
      } else {
        dentroVirgolette = !dentroVirgolette;
      }
    } else if (c === ',' && !dentroVirgolette) {
      campi.push(corrente);
      corrente = '';
    } else {
      corrente += c;
    }
  }

  campi.push(corrente);
  return campi;
}

export type OpzioniLettura = {
  /** Salta le righe interamente vuote. Vero di default. */
  saltaRigheVuote?: boolean;
};

/**
 * Legge un CSV in righe numerate.
 *
 * Accetta CRLF e LF, con o senza ritorno a capo finale, con o senza BOM: sono
 * tutte varianti che capitano quando un file passa per un foglio di calcolo o
 * per un editor diverso.
 */
export function leggiCsv(contenuto: string, opzioni: OpzioniLettura = {}): RigaCsv[] {
  const saltaVuote = opzioni.saltaRigheVuote ?? true;
  const testo = contenuto.replace(/^﻿/, '');

  const righe: RigaCsv[] = [];
  testo.split(/\r\n|\n|\r/).forEach((originale, indice) => {
    if (saltaVuote && originale.trim() === '') return;
    righe.push({ numero: indice + 1, campi: spezzaRiga(originale), originale });
  });

  return righe;
}

/** Il file usa i ritorni a capo di Windows? Serve solo per gli avvisi. */
export function haRitorniWindows(contenuto: string): boolean {
  return contenuto.includes('\r\n');
}

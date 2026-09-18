/**
 * Lettura dei due formati di export Fantalab (SPEC 6.1).
 *
 * Entrambi finiscono nella stessa forma, `RigaRosa`, perche' a valle
 * l'importatore non deve sapere da quale dei due e' arrivato. Cambia solo
 * quanti campi ridondanti sono disponibili per la validazione.
 *
 * I casi limite gestiti qui non sono immaginati: vengono dai file veri in
 * `/fixtures`, e ciascuno ha il suo test.
 */

import { leggiCsv, type RigaCsv } from './csv.ts';

export type FormatoExport = 'completo' | 'minimale';

/** Una riga di rosa, normalizzata. I campi facoltativi mancano nel minimale. */
export type RigaRosa = {
  /** Nome della squadra fanta, come scritto nel file. */
  squadra: string;
  /** `Fantacalcio_Id`: la chiave del join, l'unica cosa che identifica davvero. */
  idEsterno: number;
  prezzo: number;
  riga: number;

  nome?: string;
  siglaClub?: string;
  ruoloClassico?: string;
  /** Ruoli Mantra come scritti nel file, separati da virgola. */
  ruoliMantra?: string;
  quotazione?: number;
  quotazioneMantra?: number;
};

export type Lettura = {
  formato: FormatoExport;
  righe: RigaRosa[];
  /** Problemi di formato, che bloccano la lettura. */
  errori: ErroreLettura[];
};

export type ErroreLettura = { riga: number; messaggio: string };

const INTESTAZIONE_COMPLETO = [
  'Squadra', 'Nome', 'Squadra_Appartenenza', 'Ruolo', 'Ruoli_Mantra',
  'Prezzo', 'Quotazione', 'Quotazione_Mantra', 'Fantacalcio_Id',
] as const;

/** La riga che separa le squadre nel formato minimale. */
const SEPARATORE = '$';

/* ------------------------------------------------------------------ */

/**
 * Riconosce il formato dal contenuto, senza fidarsi del nome del file.
 *
 * Il formato completo si riconosce dall'intestazione; il minimale dal fatto
 * che comincia con una riga di separatori. Un file che non e' ne' l'uno ne'
 * l'altro va respinto subito, con un messaggio che dice cosa ci si aspettava.
 */
export function riconosciFormato(contenuto: string): FormatoExport | null {
  const righe = leggiCsv(contenuto);
  const prima = righe[0];
  if (!prima) return null;

  if (prima.campi[0] === INTESTAZIONE_COMPLETO[0]) return 'completo';
  if (prima.campi.every((c) => c.trim() === SEPARATORE)) return 'minimale';
  return null;
}

export function leggiExport(contenuto: string): Lettura {
  const formato = riconosciFormato(contenuto);

  if (formato === null) {
    return {
      formato: 'completo',
      righe: [],
      errori: [{
        riga: 1,
        messaggio:
          'Formato non riconosciuto. Attesi due formati: l’export completo, che comincia ' +
          `con l’intestazione "${INTESTAZIONE_COMPLETO.join(',')}", oppure quello minimale, ` +
          'che comincia con una riga "$,$,$".',
      }],
    };
  }

  return formato === 'completo' ? leggiCompleto(contenuto) : leggiMinimale(contenuto);
}

/* ------------------------------------------------------------------ */
/* Formato completo: rose.csv                                          */
/* ------------------------------------------------------------------ */

function numeroDaCampo(
  grezzo: string | undefined,
  campo: string,
  riga: number,
  errori: ErroreLettura[],
): number | null {
  const testo = (grezzo ?? '').trim();
  if (testo === '') {
    errori.push({ riga, messaggio: `campo "${campo}" vuoto` });
    return null;
  }
  const valore = Number(testo.replace(',', '.'));
  if (!Number.isFinite(valore)) {
    errori.push({ riga, messaggio: `campo "${campo}" non numerico: "${testo}"` });
    return null;
  }
  return valore;
}

function leggiCompleto(contenuto: string): Lettura {
  const errori: ErroreLettura[] = [];
  const righe: RigaRosa[] = [];
  const tutte = leggiCsv(contenuto);

  const intestazione = tutte[0]!;
  const attesa = INTESTAZIONE_COMPLETO;
  const trovata = intestazione.campi.map((c) => c.trim());
  if (trovata.length !== attesa.length || attesa.some((a, i) => trovata[i] !== a)) {
    errori.push({
      riga: intestazione.numero,
      messaggio:
        `intestazione inattesa.\n  attesa:  ${attesa.join(',')}\n  trovata: ${trovata.join(',')}`,
    });
    return { formato: 'completo', righe, errori };
  }

  for (const r of tutte.slice(1)) {
    if (r.campi.length !== attesa.length) {
      errori.push({
        riga: r.numero,
        messaggio: `${r.campi.length} campi invece di ${attesa.length}: "${r.originale}"`,
      });
      continue;
    }

    const squadra = r.campi[0]!.trim();
    if (squadra === '') {
      errori.push({ riga: r.numero, messaggio: 'nome della squadra fanta mancante' });
      continue;
    }

    const prezzo = numeroDaCampo(r.campi[5], 'Prezzo', r.numero, errori);
    const idEsterno = numeroDaCampo(r.campi[8], 'Fantacalcio_Id', r.numero, errori);
    const quotazione = numeroDaCampo(r.campi[6], 'Quotazione', r.numero, errori);
    const quotazioneMantra = numeroDaCampo(r.campi[7], 'Quotazione_Mantra', r.numero, errori);
    if (prezzo === null || idEsterno === null) continue;

    righe.push({
      squadra,
      idEsterno,
      prezzo,
      riga: r.numero,
      nome: r.campi[1]!.trim(),
      siglaClub: r.campi[2]!.trim(),
      ruoloClassico: r.campi[3]!.trim(),
      ruoliMantra: r.campi[4]!.trim(),
      ...(quotazione !== null ? { quotazione } : {}),
      ...(quotazioneMantra !== null ? { quotazioneMantra } : {}),
    });
  }

  return { formato: 'completo', righe, errori };
}

/* ------------------------------------------------------------------ */
/* Formato minimale: file_per_fantaleghe.csv                           */
/* ------------------------------------------------------------------ */

/** La riga e' un separatore fra squadre? Tollera anche la variante tronca. */
function eeSeparatore(r: RigaCsv): boolean {
  return r.campi.every((c) => c.trim() === SEPARATORE || c.trim() === '');
}

/**
 * Formato minimale: squadra, id, prezzo, senza intestazione utile.
 *
 * Il campo della squadra **non e' quotato** e puo' contenere spazi e `&`
 * (`Pulpone & Loris`, `Maicol & Matteo`). Per fortuna non contiene virgole,
 * quindi la riga si spezza sugli **ultimi due** separatori e non sul primo:
 * spezzando sul primo, una squadra con una virgola nel nome manderebbe tutto
 * fuori posto senza che nessuno se ne accorga.
 */
function leggiMinimale(contenuto: string): Lettura {
  const errori: ErroreLettura[] = [];
  const righe: RigaRosa[] = [];

  for (const r of leggiCsv(contenuto)) {
    // I separatori delimitano le squadre e compaiono anche in testa e in coda:
    // non portano dati. La specifica prevede anche una coda tronca ("$,").
    if (eeSeparatore(r)) continue;

    const ultima = r.originale.lastIndexOf(',');
    const penultima = ultima < 0 ? -1 : r.originale.lastIndexOf(',', ultima - 1);
    if (penultima < 0) {
      errori.push({
        riga: r.numero,
        messaggio:
          `attese tre colonne "squadra,id,prezzo", trovata una riga senza separatori: "${r.originale}"`,
      });
      continue;
    }

    const squadra = r.originale.slice(0, penultima).trim();
    const idGrezzo = r.originale.slice(penultima + 1, ultima).trim();
    const prezzoGrezzo = r.originale.slice(ultima + 1).trim();

    if (squadra === '') {
      errori.push({ riga: r.numero, messaggio: 'nome della squadra fanta mancante' });
      continue;
    }

    const idEsterno = numeroDaCampo(idGrezzo, 'Fantacalcio_Id', r.numero, errori);
    const prezzo = numeroDaCampo(prezzoGrezzo, 'Prezzo', r.numero, errori);
    if (idEsterno === null || prezzo === null) continue;

    righe.push({ squadra, idEsterno, prezzo, riga: r.numero });
  }

  return { formato: 'minimale', righe, errori };
}

/* ------------------------------------------------------------------ */

/**
 * Ruoli Mantra di una riga, come insieme ordinabile.
 *
 * Fantalab li separa con la virgola dentro un campo quotato, il listone col
 * punto e virgola: qui si accettano entrambi, perche' lo stesso confronto
 * serve da tutte e due le parti.
 */
export function ruoliDaCampo(grezzo: string): string[] {
  return grezzo
    .split(/[;,/]/)
    .map((x) => x.trim())
    .filter((x) => x !== '');
}

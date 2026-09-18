/**
 * Lettore .xlsx minimale e senza dipendenze.
 *
 * Un file .xlsx e' un archivio ZIP che contiene XML. Qui serve leggere celle di
 * testo e numeri da fogli semplici: niente formule, niente date, niente stili.
 * Bastano l'inflate di `node:zlib` e qualche espressione regolare.
 *
 * Nota per chi legge: questo file e' l'unico punto del progetto che conosce il
 * formato Excel. Tutto il resto lavora su righe gia' normalizzate.
 */

import { inflateRawSync } from 'node:zlib';

export type Cella = string | number | null;
export type Foglio = { nome: string; righe: Cella[][] };

/* ------------------------------------------------------------------ */
/* ZIP                                                                 */
/* ------------------------------------------------------------------ */

const FIRMA_EOCD = 0x06054b50; // End Of Central Directory
const FIRMA_CD = 0x02014b50; // Central Directory header

/** Estrae i file di un archivio ZIP in memoria, come mappa nome -> contenuto. */
function leggiZip(buf: Buffer): Map<string, Buffer> {
  const eocd = trovaEocd(buf);
  const numeroFile = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16); // offset della central directory

  const file = new Map<string, Buffer>();
  for (let i = 0; i < numeroFile; i++) {
    if (buf.readUInt32LE(p) !== FIRMA_CD) {
      throw new Error(`ZIP corrotto: header di directory atteso a ${p}`);
    }
    const metodo = buf.readUInt16LE(p + 10);
    const dimCompressa = buf.readUInt32LE(p + 20);
    const dimNome = buf.readUInt16LE(p + 28);
    const dimExtra = buf.readUInt16LE(p + 30);
    const dimCommento = buf.readUInt16LE(p + 32);
    const offsetLocale = buf.readUInt32LE(p + 42);
    const nome = buf.toString('utf8', p + 46, p + 46 + dimNome);

    // L'header locale ripete nome ed extra, con lunghezze proprie: i dati
    // compressi cominciano subito dopo.
    const dimNomeLoc = buf.readUInt16LE(offsetLocale + 26);
    const dimExtraLoc = buf.readUInt16LE(offsetLocale + 28);
    const inizioDati = offsetLocale + 30 + dimNomeLoc + dimExtraLoc;
    const dati = buf.subarray(inizioDati, inizioDati + dimCompressa);

    if (metodo === 0) file.set(nome, Buffer.from(dati));
    else if (metodo === 8) file.set(nome, inflateRawSync(dati));
    else throw new Error(`Metodo di compressione ${metodo} non supportato (${nome})`);

    p += 46 + dimNome + dimExtra + dimCommento;
  }
  return file;
}

/** Cerca la firma EOCD dal fondo: e' l'unico modo previsto dal formato. */
function trovaEocd(buf: Buffer): number {
  const minimo = Math.max(0, buf.length - 0xffff - 22);
  for (let i = buf.length - 22; i >= minimo; i--) {
    if (buf.readUInt32LE(i) === FIRMA_EOCD) return i;
  }
  throw new Error('Non e’ un file ZIP valido: EOCD non trovato');
}

/* ------------------------------------------------------------------ */
/* XML                                                                 */
/* ------------------------------------------------------------------ */

function decodificaEntita(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g, (intero, corpo: string) => {
    switch (corpo) {
      case 'amp': return '&';
      case 'lt': return '<';
      case 'gt': return '>';
      case 'quot': return '"';
      case 'apos': return "'";
      default:
        if (corpo.startsWith('#x') || corpo.startsWith('#X')) {
          return String.fromCodePoint(parseInt(corpo.slice(2), 16));
        }
        if (corpo.startsWith('#')) return String.fromCodePoint(parseInt(corpo.slice(1), 10));
        return intero;
    }
  });
}

/**
 * Tabella delle stringhe condivise. Excel non ripete il testo nelle celle: le
 * mette qui una volta sola e nelle celle scrive l'indice.
 */
function leggiStringheCondivise(xml: string): string[] {
  const stringhe: string[] = [];
  // Ogni <si> puo' essere <t>testo</t> oppure una sequenza di <r><t>...</t></r>
  // quando il testo ha formattazioni diverse: in quel caso si concatena.
  for (const si of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    let testo = '';
    for (const t of si[1]!.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) {
      testo += decodificaEntita(t[1]!);
    }
    stringhe.push(testo);
  }
  return stringhe;
}

/** Da "BC12" a 1 (indice di colonna a base zero). */
function indiceColonna(riferimento: string): number {
  let n = 0;
  for (let i = 0; i < riferimento.length; i++) {
    const c = riferimento.charCodeAt(i);
    if (c < 65 || c > 90) break; // finite le lettere, comincia il numero di riga
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

function leggiFoglio(xml: string, condivise: string[]): Cella[][] {
  const righe: Cella[][] = [];

  for (const riga of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const celle: Cella[] = [];
    for (const cella of riga[1]!.matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attributi = cella[1]!;
      const corpo = cella[2] ?? '';
      const rif = /\br="([A-Z]+\d+)"/.exec(attributi)?.[1];
      const tipo = /\bt="([^"]+)"/.exec(attributi)?.[1];
      const colonna = rif ? indiceColonna(rif) : celle.length;

      let valore: Cella = null;
      if (tipo === 'inlineStr') {
        let testo = '';
        for (const t of corpo.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) testo += decodificaEntita(t[1]!);
        valore = testo;
      } else {
        const grezzo = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(corpo)?.[1];
        if (grezzo !== undefined) {
          if (tipo === 's') valore = condivise[Number(grezzo)] ?? '';
          else if (tipo === 'str' || tipo === 'e') valore = decodificaEntita(grezzo);
          else valore = Number(grezzo);
        }
      }

      while (celle.length < colonna) celle.push(null);
      celle[colonna] = valore;
    }
    // Le righe con r="N" possono saltare numeri quando sono vuote: le riempiamo
    // per mantenere l'allineamento tra numero di riga e indice dell'array.
    const numero = Number(/<row[^>]*\br="(\d+)"/.exec(riga[0]!)?.[1] ?? righe.length + 1);
    while (righe.length < numero - 1) righe.push([]);
    righe[numero - 1] = celle;
  }
  return righe;
}

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */

/** Legge una cartella di lavoro .xlsx e restituisce i fogli nell'ordine del file. */
export function leggiCartella(buf: Buffer): Foglio[] {
  const file = leggiZip(buf);

  const testo = (nome: string): string => {
    const b = file.get(nome);
    if (!b) throw new Error(`Voce mancante nell’archivio: ${nome}`);
    return b.toString('utf8').replace(/^﻿/, '');
  };

  const condivise = file.has('xl/sharedStrings.xml')
    ? leggiStringheCondivise(testo('xl/sharedStrings.xml'))
    : [];

  // workbook.xml da' nomi e ordine dei fogli; i relationship id puntano ai file.
  const percorsi = new Map<string, string>();
  for (const r of testo('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\s([^>]*)\/>/g)) {
    const id = /\bId="([^"]+)"/.exec(r[1]!)?.[1];
    const target = /\bTarget="([^"]+)"/.exec(r[1]!)?.[1];
    if (id && target) percorsi.set(id, target.replace(/^\/?xl\//, '').replace(/^\//, ''));
  }

  const fogli: Foglio[] = [];
  for (const s of testo('xl/workbook.xml').matchAll(/<sheet\s([^>]*)\/>/g)) {
    const nome = decodificaEntita(/\bname="([^"]*)"/.exec(s[1]!)?.[1] ?? '');
    const rid = /\br:id="([^"]+)"/.exec(s[1]!)?.[1] ?? '';
    const percorso = percorsi.get(rid);
    if (!percorso) throw new Error(`Foglio "${nome}" senza file associato`);
    fogli.push({ nome, righe: leggiFoglio(testo(`xl/${percorso}`), condivise) });
  }
  return fogli;
}

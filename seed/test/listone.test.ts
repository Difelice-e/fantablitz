/**
 * I test partono dal listone vero, non da un esempio inventato: e' il file che
 * l'app dovra' digerire ogni stagione. I volumi attesi sono quelli annotati in
 * SPEC.md 5.1, e servono da allarme se il formato cambia.
 */

import { deepStrictEqual, ok, strictEqual, throws } from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { leggiCartella, type Cella, type Foglio } from '../src/xlsx.ts';
import { leggiListone, leggiListoneDaFogli } from '../src/listone.ts';

const PERCORSO = fileURLToPath(
  new URL('../Quotazioni_Fantacalcio_Stagione_2026_27.xlsx', import.meta.url),
);
const contenuto = readFileSync(PERCORSO);

describe('lettura del file .xlsx', () => {
  const fogli = leggiCartella(contenuto);

  it('trova i sei fogli attesi, nell’ordine del file', () => {
    deepStrictEqual(
      fogli.map((f) => f.nome),
      ['Tutti', 'Portieri', 'Difensori', 'Centrocampisti', 'Attaccanti', 'Ceduti'],
    );
  });

  it('legge la riga di titolo, le intestazioni e i dati alle righe giuste', () => {
    const tutti = fogli[0]!;
    strictEqual(tutti.righe[0]![0], 'Quotazioni Fantacalcio Stagione 2026 27');
    deepStrictEqual(tutti.righe[1]!.slice(0, 5), ['Id', 'R', 'RM', 'Nome', 'Squadra']);
    deepStrictEqual(tutti.righe[2]!.slice(0, 5), [5841, 'P', 'Por', 'Svilar', 'Roma']);
  });

  it('conserva gli accenti', () => {
    const nomi = fogli[0]!.righe.slice(2).map((r) => r[3]);
    ok(nomi.includes('Calò'), 'atteso "Calò" fra i nomi');
  });

  it('distingue i numeri dalle stringhe', () => {
    const riga = fogli[0]!.righe[2]!;
    strictEqual(typeof riga[0], 'number');
    strictEqual(typeof riga[3], 'string');
  });
});

describe('lettura del listone', () => {
  const listone = leggiListone(contenuto);

  it('rispetta i volumi di riferimento della specifica', () => {
    strictEqual(listone.giocatori.length, 533);
    strictEqual(listone.ceduti.length, 63);
    strictEqual(new Set(listone.giocatori.map((g) => g.squadra)).size, 20);
  });

  it('non contiene identificativi duplicati', () => {
    const id = listone.giocatori.map((g) => g.idEsterno);
    strictEqual(new Set(id).size, id.length);
  });

  it('nessun ceduto sopravvive nel listone', () => {
    const ceduti = new Set(listone.ceduti.map((c) => c.idEsterno));
    strictEqual(listone.giocatori.filter((g) => ceduti.has(g.idEsterno)).length, 0);
  });

  it('interpreta i ruoli Mantra di ogni riga', () => {
    ok(listone.giocatori.every((g) => g.ruoliMantra.length >= 1));
    const svilar = listone.giocatori.find((g) => g.idEsterno === 5841)!;
    deepStrictEqual(svilar.ruoliMantra, ['Por']);
    strictEqual(svilar.ruoloClassico, 'P');
  });

  it('legge i due segnali di mercato usati per i rating', () => {
    const migliore = [...listone.giocatori].sort(
      (a, b) => b.valoreMercatoMantra - a.valoreMercatoMantra,
    )[0]!;
    strictEqual(migliore.valoreMercatoMantra, 450);
    strictEqual(migliore.quotazioneAstaMantra, 37);
  });
});

/* ------------------------------------------------------------------ */
/* Casi limite, su fogli costruiti a mano                              */
/* ------------------------------------------------------------------ */

const INTESTAZIONI: Cella[] = [
  'Id', 'R', 'RM', 'Nome', 'Squadra',
  'Qt.A', 'Qt.I', 'Diff.', 'Qt.A M', 'Qt.I M', 'Diff.M', 'FVM', 'FVM M',
];

const TITOLO: Cella[] = ['Quotazioni Fantacalcio Stagione 2026 27'];

function giocatore(id: number, nome: string, rm = 'Dc', squadra = 'Inter'): Cella[] {
  return [id, 'D', rm, nome, squadra, 10, 10, 0, 10, 10, 0, 20, 20];
}

function fogli(tutti: Cella[][], ceduti: Cella[][] = []): Foglio[] {
  return [
    { nome: 'Tutti', righe: [TITOLO, INTESTAZIONI, ...tutti] },
    { nome: 'Ceduti', righe: [TITOLO, INTESTAZIONI, ...ceduti] },
  ];
}

describe('casi limite del listone', () => {
  it('salta la riga di titolo e trova le intestazioni ovunque siano', () => {
    const conDueTitoli: Foglio[] = [
      { nome: 'Tutti', righe: [TITOLO, [], INTESTAZIONI, giocatore(1, 'Tizio')] },
      { nome: 'Ceduti', righe: [TITOLO, INTESTAZIONI] },
    ];
    strictEqual(leggiListoneDaFogli(conDueTitoli).giocatori.length, 1);
  });

  it('esclude dal listone i giocatori che compaiono anche fra i ceduti', () => {
    const listone = leggiListoneDaFogli(
      fogli([giocatore(1, 'Resta'), giocatore(2, 'Venduto')], [giocatore(2, 'Venduto')]),
    );
    deepStrictEqual(listone.giocatori.map((g) => g.idEsterno), [1]);
    deepStrictEqual(listone.esclusiPerCessione, [2]);
  });

  it('ignora le righe completamente vuote in coda', () => {
    const listone = leggiListoneDaFogli(fogli([giocatore(1, 'Tizio'), [], [null, null]]));
    strictEqual(listone.giocatori.length, 1);
  });

  it('si ferma su un identificativo duplicato, indicando le due righe', () => {
    throws(
      () => leggiListoneDaFogli(fogli([giocatore(7, 'Uno'), giocatore(7, 'Due')])),
      /Id 7 duplicato .* riga 3 \("Uno"\) e riga 4 \("Due"\)/s,
    );
  });

  it('si ferma su un ruolo classico sconosciuto', () => {
    const riga = giocatore(1, 'Tizio');
    riga[1] = 'X';
    throws(() => leggiListoneDaFogli(fogli([riga])), /ruolo classico sconosciuto "X"/);
  });

  it('si ferma su un nome mancante', () => {
    const riga = giocatore(1, '');
    throws(() => leggiListoneDaFogli(fogli([riga])), /riga 3: nome mancante/i);
  });

  it('si ferma su una quotazione non numerica', () => {
    const riga = giocatore(1, 'Tizio');
    riga[12] = 'n.d.';
    throws(() => leggiListoneDaFogli(fogli([riga])), /"FVM M" non numerico/);
  });

  it('si ferma se mancano le intestazioni', () => {
    throws(
      () => leggiListoneDaFogli([
        { nome: 'Tutti', righe: [TITOLO, giocatore(1, 'Tizio')] },
        { nome: 'Ceduti', righe: [TITOLO, INTESTAZIONI] },
      ]),
      /intestazioni non trovate/,
    );
  });

  it('si ferma se manca un foglio, elencando quelli presenti', () => {
    throws(
      () => leggiListoneDaFogli([{ nome: 'Tutti', righe: [TITOLO, INTESTAZIONI] }]),
      /Foglio "Ceduti" assente\. Fogli presenti: Tutti/,
    );
  });
});

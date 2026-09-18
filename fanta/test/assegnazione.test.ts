/**
 * Test dell'assegnazione ottima.
 *
 * Il caso che conta e' quello in cui un algoritmo goloso sbaglia: e' la ragione
 * per cui qui dentro c'e' l'ungherese e non un ciclo con il "meglio
 * disponibile".
 */

import { deepStrictEqual, ok, strictEqual, throws } from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assegnazioneOttima, VIETATO } from '../src/assegnazione.ts';

describe('assegnazione ottima', () => {
  it('risolve il caso banale', () => {
    const s = assegnazioneOttima([[0, 5], [5, 0]]);
    deepStrictEqual(s.perRiga, [0, 1]);
    strictEqual(s.costo, 0);
  });

  it('sceglie la combinazione col costo totale minimo, non il minimo per riga', () => {
    // Riga 0 preferirebbe la colonna 0 (costo 1), ma cosi' la riga 1 sarebbe
    // costretta alla colonna 1 a costo 10, per un totale di 11. Scambiando si
    // ottiene 2 + 0 = 2.
    const s = assegnazioneOttima([[1, 2], [0, 10]]);
    deepStrictEqual(s.perRiga, [1, 0]);
    strictEqual(s.costo, 2);
  });

  it('gestisce piu’ candidati che caselle', () => {
    const s = assegnazioneOttima([
      [3, 1, 9, 9],
      [9, 4, 2, 9],
    ]);
    strictEqual(s.righeScoperte.length, 0);
    strictEqual(s.costo, 3); // 1 + 2
    strictEqual(new Set(s.perRiga).size, 2, 'due righe sulla stessa colonna');
  });

  it('il caso in cui l’algoritmo goloso sbaglia', () => {
    // Tre caselle, tre candidati. Il candidato 0 e' l'unico che puo' occupare
    // la casella 2. Un algoritmo goloso che riempie la casella 0 col migliore
    // disponibile prenderebbe proprio lui, e poi dichiarerebbe la casella 2
    // impossibile da riempire. Non lo e'.
    const V = VIETATO;
    const costi = [
      [0, 0, V], // casella 0: candidati 0 o 1
      [0, V, 0], // casella 1: candidati 0 o 2
      [0, V, V], // casella 2: solo il candidato 0
    ];
    const s = assegnazioneOttima(costi);
    strictEqual(s.righeScoperte.length, 0, 'ha dichiarato impossibile una formazione schierabile');
    strictEqual(s.perRiga[2], 0, 'la casella esclusiva non e’ andata al solo che poteva occuparla');
    strictEqual(s.perRiga[0], 1);
    strictEqual(s.perRiga[1], 2);
  });

  it('segnala le caselle che nessuno puo’ occupare', () => {
    const s = assegnazioneOttima([
      [0, VIETATO],
      [VIETATO, VIETATO],
    ]);
    deepStrictEqual(s.righeScoperte, [1]);
    strictEqual(s.perRiga[1], -1);
    strictEqual(s.perRiga[0], 0);
    strictEqual(s.costo, 0, 'il costo non deve contenere l’accoppiamento vietato');
  });

  it('preferisce un adattamento a una casella scoperta', () => {
    // Meglio schierare qualcuno fuori ruolo che presentarsi in dieci.
    const s = assegnazioneOttima([
      [0, VIETATO],
      [1, VIETATO],
    ]);
    strictEqual(s.righeScoperte.length, 1);
    ok(s.perRiga[0] === 0 || s.perRiga[1] === 0, 'la sola colonna utile e’ rimasta libera');
  });

  it('non sceglie mai lo stesso candidato per due caselle', () => {
    const costi = Array.from({ length: 11 }, (_, r) =>
      Array.from({ length: 25 }, (_, c) => ((r * 7 + c * 13) % 5)),
    );
    const s = assegnazioneOttima(costi);
    const usati = s.perRiga.filter((c) => c >= 0);
    strictEqual(new Set(usati).size, usati.length);
  });

  it('gestisce l’insieme vuoto e rifiuta i casi impossibili', () => {
    deepStrictEqual(assegnazioneOttima([]).perRiga, []);
    throws(() => assegnazioneOttima([[0, 0], [0, 0], [0, 0]]), /solo 2 candidati/);
  });

  it('e’ deterministica', () => {
    const costi = Array.from({ length: 8 }, (_, r) =>
      Array.from({ length: 20 }, (_, c) => ((r * 3 + c * 11) % 7)),
    );
    deepStrictEqual(assegnazioneOttima(costi), assegnazioneOttima(costi));
  });
});

import { deepStrictEqual, ok, strictEqual, throws } from 'node:assert/strict';
import { describe, it } from 'node:test';
import { leggiRuoliMantra, ordinaCanonico, stessiRuoli, RUOLI_MANTRA } from '../src/ruoli.ts';

describe('lettura dei ruoli Mantra', () => {
  it('accetta il punto e virgola del listone .xlsx', () => {
    deepStrictEqual(leggiRuoliMantra('E;W'), ['E', 'W']);
    deepStrictEqual(leggiRuoliMantra('Dd;Ds;Dc'), ['Dd', 'Ds', 'Dc']);
  });

  it('accetta la virgola degli export Fantalab', () => {
    deepStrictEqual(leggiRuoliMantra('Dc,Dd'), ['Dc', 'Dd']);
    deepStrictEqual(leggiRuoliMantra('W,T'), ['W', 'T']);
  });

  it('tollera spazi attorno ai separatori', () => {
    deepStrictEqual(leggiRuoliMantra(' W ,  T '), ['W', 'T']);
  });

  it('conserva l’ordine: il primo ruolo e’ quello principale', () => {
    deepStrictEqual(leggiRuoliMantra('W;T'), ['W', 'T']);
    deepStrictEqual(leggiRuoliMantra('T;W'), ['T', 'W']);
  });

  it('scarta i doppioni conservando la prima occorrenza', () => {
    deepStrictEqual(leggiRuoliMantra('C;C;T'), ['C', 'T']);
  });

  it('riconosce tutti e dodici i ruoli', () => {
    for (const ruolo of RUOLI_MANTRA) deepStrictEqual(leggiRuoliMantra(ruolo), [ruolo]);
  });

  it('rifiuta un ruolo sconosciuto invece di ignorarlo', () => {
    throws(() => leggiRuoliMantra('Dc;Zz'), /Ruolo Mantra sconosciuto: "Zz"/);
  });

  it('rifiuta una lista vuota', () => {
    throws(() => leggiRuoliMantra('   '), /vuota/);
  });

  it('distingue la C di centrocampista Mantra dalla C del ruolo classico', () => {
    // Nel listone la colonna R usa "C" per centrocampista e la colonna RM usa
    // "C" per centrale: sono due alfabeti diversi che condividono una lettera.
    deepStrictEqual(leggiRuoliMantra('C'), ['C']);
    ok(RUOLI_MANTRA.includes('C'));
  });
});

describe('confronto fra liste di ruoli', () => {
  it('ordina secondo la sequenza canonica', () => {
    deepStrictEqual(ordinaCanonico(['W', 'Dc', 'Pc']), ['Dc', 'W', 'Pc']);
  });

  it('considera uguali due liste con lo stesso contenuto in ordine diverso', () => {
    strictEqual(stessiRuoli(['W', 'T'], ['T', 'W']), true);
    strictEqual(stessiRuoli(['W', 'T'], ['W']), false);
    strictEqual(stessiRuoli(['W', 'T'], ['W', 'A']), false);
  });
});

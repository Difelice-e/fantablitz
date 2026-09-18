/**
 * Test del calendario della lega e della classifica.
 *
 * Con dieci squadre 38 non e' un multiplo di nove, quindi il calendario non e'
 * un girone all'italiana ovvio: e' il punto dove vale la pena verificare gli
 * invarianti invece di fidarsi.
 */

import { deepStrictEqual, ok, strictEqual, throws } from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { generaCalendarioFanta, scontriDi } from '../src/calendarioFanta.ts';
import { calcolaClassifica, risolviGiornata, risolviScontro } from '../src/classifica.ts';
import { validaConfigurazioneLega, type ConfigurazioneLega } from '../src/fantavoto.ts';

const lega = validaConfigurazioneLega(
  JSON.parse(
    readFileSync(fileURLToPath(new URL('../config/lega.json', import.meta.url)), 'utf8'),
  ) as ConfigurazioneLega,
);

const SQUADRE = [
  'Fonzie', 'Lele', 'Christian', 'Pulpone', 'Pier',
  'Martinelli', 'Sirbu', 'Penio', 'Potty', 'Maicol',
];

const calendario = generaCalendarioFanta({ squadre: SQUADRE });

describe('struttura del calendario', () => {
  it('genera 38 giornate da 5 scontri', () => {
    strictEqual(calendario.giornate.length, 38);
    for (const g of calendario.giornate) strictEqual(g.scontri.length, 5, `giornata ${g.numero}`);
  });

  it('numera le giornate da 1 a 38 senza salti', () => {
    deepStrictEqual(
      calendario.giornate.map((g) => g.numero),
      Array.from({ length: 38 }, (_, i) => i + 1),
    );
  });

  it('ogni squadra gioca una volta sola per giornata', () => {
    for (const g of calendario.giornate) {
      const impegnate = g.scontri.flatMap((s) => [s.casaId, s.ospiteId]);
      strictEqual(new Set(impegnate).size, 10, `giornata ${g.numero}`);
    }
  });

  it('nessuna squadra affronta se stessa', () => {
    for (const g of calendario.giornate) {
      for (const s of g.scontri) ok(s.casaId !== s.ospiteId, `giornata ${g.numero}`);
    }
  });

  it('ogni squadra gioca 38 partite', () => {
    for (const s of SQUADRE) strictEqual(scontriDi(calendario, s).length, 38, s);
  });
});

describe('quattro gironi piu’ due giornate ripetute', () => {
  it('le ultime due giornate sono marcate come ripetute, le altre no', () => {
    const ripetute = calendario.giornate.filter((g) => g.ripetuta).map((g) => g.numero);
    deepStrictEqual(ripetute, [37, 38]);
  });

  it('le giornate 37 e 38 ripetono la 1 e la 2 a campi invertiti', () => {
    for (const [ripetuta, originale] of [[37, 1], [38, 2]] as const) {
      const dopo = calendario.giornate[ripetuta - 1]!;
      const prima = calendario.giornate[originale - 1]!;

      const coppie = (g: typeof prima) =>
        g.scontri.map((s) => [s.casaId, s.ospiteId].sort().join('|')).sort();
      deepStrictEqual(coppie(dopo), coppie(prima), `giornata ${ripetuta}: accoppiamenti diversi`);

      // Campi invertiti: chi era in casa alla 1 e' fuori alla 37.
      for (const s of prima.scontri) {
        ok(
          dopo.scontri.some((d) => d.casaId === s.ospiteId && d.ospiteId === s.casaId),
          `giornata ${ripetuta}: ${s.casaId}-${s.ospiteId} non e’ invertita`,
        );
      }
    }
  });

  it('nei 36 giorni dei gironi ogni coppia si affronta quattro volte', () => {
    const incontri = new Map<string, number>();
    for (const g of calendario.giornate.slice(0, 36)) {
      for (const s of g.scontri) {
        const chiave = [s.casaId, s.ospiteId].sort().join('|');
        incontri.set(chiave, (incontri.get(chiave) ?? 0) + 1);
      }
    }
    strictEqual(incontri.size, 45, 'le coppie possibili fra dieci squadre sono 45');
    for (const [coppia, quante] of incontri) strictEqual(quante, 4, coppia);
  });

  it('nei 36 giorni ogni squadra gioca 18 volte in casa', () => {
    // I gironi si alternano di campo: chi e' in casa al primo e' fuori al
    // secondo, quindi su quattro gironi il conto torna esatto.
    for (const s of SQUADRE) {
      const inCasa = scontriDi(calendario, s)
        .slice(0, 36)
        .filter((x) => x.scontro.casaId === s).length;
      strictEqual(inCasa, 18, s);
    }
  });
});

describe('calendario configurabile', () => {
  it('accetta un numero di giornate diverso', () => {
    strictEqual(generaCalendarioFanta({ squadre: SQUADRE, giornate: 18 }).giornate.length, 18);
  });

  it('funziona anche con poche squadre', () => {
    const piccolo = generaCalendarioFanta({ squadre: ['a', 'b', 'c', 'd'], giornate: 6 });
    strictEqual(piccolo.giornate.length, 6);
    for (const g of piccolo.giornate) strictEqual(g.scontri.length, 2);
  });

  it('e’ deterministico', () => {
    strictEqual(
      JSON.stringify(generaCalendarioFanta({ squadre: SQUADRE })),
      JSON.stringify(generaCalendarioFanta({ squadre: SQUADRE })),
    );
  });

  it('rifiuta un numero dispari di squadre', () => {
    throws(() => generaCalendarioFanta({ squadre: SQUADRE.slice(0, 9) }), /numero pari/);
  });

  it('rifiuta due squadre con lo stesso identificativo', () => {
    throws(
      () => generaCalendarioFanta({ squadre: ['a', 'b', 'a', 'c'] }),
      /stesso identificativo/,
    );
  });
});

/* ------------------------------------------------------------------ */

describe('scontri diretti', () => {
  const scontro = { casaId: 'Fonzie', ospiteId: 'Lele' };

  it('converte i fantapunti in gol secondo le soglie', () => {
    const r = risolviScontro(1, scontro, new Map([['Fonzie', 72], ['Lele', 66]]), lega);
    strictEqual(r.golCasa, 2);
    strictEqual(r.golOspite, 1);
  });

  it('sotto la soglia base si pareggia a reti bianche', () => {
    const r = risolviScontro(1, scontro, new Map([['Fonzie', 65], ['Lele', 60]]), lega);
    strictEqual(r.golCasa, 0);
    strictEqual(r.golOspite, 0);
  });

  it('piu’ fantapunti non basta: contano le soglie', () => {
    // Fonzie ne fa cinque in piu' e finisce comunque 1-1: e' il cuore del
    // fantacalcio, e va verificato che il codice non "aiuti" chi ha fatto di
    // piu' arrotondando a suo favore.
    const r = risolviScontro(1, scontro, new Map([['Fonzie', 71], ['Lele', 66]]), lega);
    strictEqual(r.golCasa, 1);
    strictEqual(r.golOspite, 1);
  });

  it('una squadra senza punteggio prende zero, non fa eccezione', () => {
    const r = risolviScontro(1, scontro, new Map([['Fonzie', 80]]), lega);
    strictEqual(r.golOspite, 0);
    strictEqual(r.fantapuntiOspite, 0);
  });

  it('risolve tutta la giornata', () => {
    const fantapunti = new Map(SQUADRE.map((s, i) => [s, 60 + i * 3]));
    const risultati = risolviGiornata(calendario.giornate[0]!, fantapunti, lega);
    strictEqual(risultati.length, 5);
    for (const r of risultati) strictEqual(r.giornata, 1);
  });
});

describe('classifica', () => {
  const risultati = [
    { giornata: 1, casaId: 'a', ospiteId: 'b', fantapuntiCasa: 80, fantapuntiOspite: 60, golCasa: 3, golOspite: 0 },
    { giornata: 1, casaId: 'c', ospiteId: 'd', fantapuntiCasa: 70, fantapuntiOspite: 70, golCasa: 1, golOspite: 1 },
    { giornata: 2, casaId: 'b', ospiteId: 'c', fantapuntiCasa: 90, fantapuntiOspite: 66, golCasa: 6, golOspite: 1 },
  ];

  it('tre punti a vittoria, uno a pareggio', () => {
    const classifica = calcolaClassifica(['a', 'b', 'c', 'd'], risultati);
    const per = new Map(classifica.map((r) => [r.squadraId, r]));
    strictEqual(per.get('a')!.punti, 3);
    strictEqual(per.get('b')!.punti, 3, 'una vittoria e una sconfitta');
    strictEqual(per.get('c')!.punti, 1);
    strictEqual(per.get('d')!.punti, 1);
  });

  it('i conti tornano', () => {
    for (const r of calcolaClassifica(['a', 'b', 'c', 'd'], risultati)) {
      strictEqual(r.vinte + r.pareggiate + r.perse, r.giocate, r.squadraId);
      strictEqual(r.punti, r.vinte * 3 + r.pareggiate, r.squadraId);
    }
    const tutti = calcolaClassifica(['a', 'b', 'c', 'd'], risultati);
    strictEqual(
      tutti.reduce((s, r) => s + r.golFatti, 0),
      tutti.reduce((s, r) => s + r.golSubiti, 0),
      'i gol fatti devono pareggiare i gol subiti',
    );
  });

  it('accumula i fantapunti, che sono il criterio di spareggio', () => {
    const classifica = calcolaClassifica(['a', 'b', 'c', 'd'], risultati);
    strictEqual(classifica.find((r) => r.squadraId === 'b')!.fantapunti, 60 + 90);
  });

  it('a pari punti decide la differenza reti, poi i gol fatti, poi i fantapunti', () => {
    const pari = [
      { giornata: 1, casaId: 'x', ospiteId: 'z', fantapuntiCasa: 80, fantapuntiOspite: 50, golCasa: 3, golOspite: 0 },
      { giornata: 1, casaId: 'y', ospiteId: 'w', fantapuntiCasa: 99, fantapuntiOspite: 50, golCasa: 3, golOspite: 0 },
    ];
    const classifica = calcolaClassifica(['x', 'y', 'z', 'w'], pari);
    // x e y hanno 3 punti, +3 di differenza e 3 gol fatti: decide chi ha
    // raccolto piu' fantapunti sul campo.
    strictEqual(classifica[0]!.squadraId, 'y');
    strictEqual(classifica[1]!.squadraId, 'x');
  });

  it('e’ sempre nello stesso ordine a parita’ di tutto', () => {
    // Senza un ultimo criterio deterministico due esecuzioni potrebbero
    // mostrare ordini diversi, e nessuno si fiderebbe piu' della tabella.
    const nessunRisultato = calcolaClassifica(['b', 'a', 'c'], []);
    deepStrictEqual(nessunRisultato.map((r) => r.squadraId), ['a', 'b', 'c']);
  });

  it('elenca anche le squadre che non hanno ancora giocato', () => {
    const classifica = calcolaClassifica(['a', 'b', 'c', 'd', 'e'], risultati);
    strictEqual(classifica.length, 5);
    strictEqual(classifica.find((r) => r.squadraId === 'e')!.giocate, 0);
  });
});

describe('una stagione intera, sui fantapunti', () => {
  it('le 38 giornate danno una classifica coerente', () => {
    const risultati = calendario.giornate.flatMap((g) => {
      // Punteggi finti ma stabili, diversi per squadra e per giornata.
      const fantapunti = new Map(
        SQUADRE.map((s, i) => [s, 55 + ((i * 7 + g.numero * 3) % 30)]),
      );
      return risolviGiornata(g, fantapunti, lega);
    });

    const classifica = calcolaClassifica(SQUADRE, risultati);
    strictEqual(classifica.length, 10);
    for (const r of classifica) strictEqual(r.giocate, 38, r.squadraId);
    strictEqual(
      classifica.reduce((s, r) => s + r.punti, 0) % 1,
      0,
      'i punti devono essere interi',
    );
    // Ogni giornata assegna 3 punti per scontro (vittoria) o 2 (pareggio).
    const totale = classifica.reduce((s, r) => s + r.punti, 0);
    ok(totale >= 38 * 5 * 2 && totale <= 38 * 5 * 3, `punti totali ${totale}`);
  });
});

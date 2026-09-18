/**
 * Test del punteggio di lega: soglie gol, fantavoto, modificatori.
 *
 * `CLAUDE.md` chiede per nome i test sui valori di confine delle soglie
 * (65, 66, 71, 72, ...): sono quelli dove un `>` al posto di un `>=` costa una
 * vittoria a qualcuno, e nessuno se ne accorge finche' non e' troppo tardi.
 */

import { deepStrictEqual, ok, strictEqual, throws } from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  EVENTI_VUOTI, bonusPerSoglia, calcolaFantavoto, modificatoreDifesa,
  modificatorePortiere, punteggioSquadra, validaConfigurazioneLega,
  type ConfigurazioneLega, type EventiFanta, type PrestazioneFanta,
} from '../src/fantavoto.ts';
import { golDaFantapunti, puntiAlProssimoGol, soglia, soglie } from '../src/soglie.ts';
import type { RuoloClassico, RuoloMantra, Schierabile } from '../src/tipi.ts';

const lega = validaConfigurazioneLega(
  JSON.parse(
    readFileSync(fileURLToPath(new URL('../config/lega.json', import.meta.url)), 'utf8'),
  ) as ConfigurazioneLega,
);

function g(id: string, ruoloClassico: RuoloClassico, ruoliMantra?: RuoloMantra[]): Schierabile {
  const predefiniti: Record<RuoloClassico, RuoloMantra[]> = {
    P: ['Por'], D: ['Dc'], C: ['C'], A: ['Pc'],
  };
  return { id, ruoloClassico, ruoliMantra: ruoliMantra ?? predefiniti[ruoloClassico] };
}

function prestazione(
  giocatore: Schierabile,
  voto: number | null,
  eventi: Partial<EventiFanta> = {},
  adattato = false,
): PrestazioneFanta {
  return { giocatore, voto, eventi: { ...EVENTI_VUOTI, ...eventi }, adattato };
}

/* ------------------------------------------------------------------ */
/* Soglie gol                                                          */
/* ------------------------------------------------------------------ */

describe('soglie gol', () => {
  it('genera le soglie classiche dalla base e dagli scarti', () => {
    // 66, 72, 77, 81, 85, 89, 93, 97, 101, 105 e poi ogni 4 (SPEC 4).
    deepStrictEqual(soglie(10, lega.soglieGol), [66, 72, 77, 81, 85, 89, 93, 97, 101, 105]);
    strictEqual(soglia(11, lega.soglieGol), 109);
    strictEqual(soglia(12, lega.soglieGol), 113);
  });

  it('i valori di confine: 65 non basta, 66 si’', () => {
    strictEqual(golDaFantapunti(65, lega.soglieGol), 0);
    strictEqual(golDaFantapunti(65.5, lega.soglieGol), 0);
    strictEqual(golDaFantapunti(66, lega.soglieGol), 1);
  });

  it('i valori di confine: 71 vale uno, 72 vale due', () => {
    strictEqual(golDaFantapunti(71, lega.soglieGol), 1);
    strictEqual(golDaFantapunti(71.5, lega.soglieGol), 1);
    strictEqual(golDaFantapunti(72, lega.soglieGol), 2);
  });

  it('i valori di confine di tutte le soglie generate', () => {
    // Per ogni soglia: un centesimo sotto vale un gol in meno, la soglia esatta
    // vale il gol. E' la verifica che il confronto sia >= e non >.
    for (let n = 1; n <= 20; n++) {
      const s = soglia(n, lega.soglieGol);
      strictEqual(golDaFantapunti(s, lega.soglieGol), n, `${s} punti`);
      strictEqual(golDaFantapunti(s - 0.01, lega.soglieGol), n - 1, `${s - 0.01} punti`);
    }
  });

  it('un punteggio bassissimo o negativo non segna', () => {
    strictEqual(golDaFantapunti(0, lega.soglieGol), 0);
    strictEqual(golDaFantapunti(-10, lega.soglieGol), 0);
  });

  it('i mezzi punti contano, perche’ i fantavoti li producono', () => {
    strictEqual(golDaFantapunti(65.99, lega.soglieGol), 0);
    strictEqual(golDaFantapunti(66.01, lega.soglieGol), 1);
  });

  it('dice quanti punti mancano al gol successivo', () => {
    strictEqual(puntiAlProssimoGol(60, lega.soglieGol), 6);
    strictEqual(puntiAlProssimoGol(66, lega.soglieGol), 6);
    strictEqual(puntiAlProssimoGol(71.5, lega.soglieGol), 0.5);
  });

  it('la scala e’ configurabile: base e scarti diversi danno soglie diverse', () => {
    deepStrictEqual(soglie(5, { base: 60, scarti: [10] }), [60, 70, 80, 90, 100]);
    deepStrictEqual(soglie(4, { base: 50, scarti: [5, 3] }), [50, 55, 58, 61]);
  });

  it('rifiuta un numero di gol sotto uno', () => {
    throws(() => soglia(0, lega.soglieGol), /parte da 1/);
  });
});

/* ------------------------------------------------------------------ */
/* Fantavoto                                                           */
/* ------------------------------------------------------------------ */

describe('fantavoto individuale', () => {
  it('senza eventi il fantavoto e’ il voto', () => {
    strictEqual(calcolaFantavoto(prestazione(g('x', 'C'), 6), lega).fantavoto, 6);
  });

  it('un gol vale tre punti', () => {
    strictEqual(calcolaFantavoto(prestazione(g('x', 'A'), 6, { gol: 1 }), lega).fantavoto, 9);
  });

  it('i bonus si sommano', () => {
    const p = prestazione(g('x', 'A'), 6.5, { gol: 2, assist: 1 });
    strictEqual(calcolaFantavoto(p, lega).fantavoto, 6.5 + 6 + 1);
  });

  it('i malus si sottraggono', () => {
    strictEqual(
      calcolaFantavoto(prestazione(g('x', 'C'), 6, { ammonizioni: 1 }), lega).fantavoto,
      5.5,
    );
    strictEqual(
      calcolaFantavoto(prestazione(g('x', 'C'), 6, { espulso: true }), lega).fantavoto,
      5,
    );
    strictEqual(
      calcolaFantavoto(prestazione(g('x', 'C'), 6, { autogol: 1 }), lega).fantavoto,
      4,
    );
    strictEqual(
      calcolaFantavoto(prestazione(g('x', 'A'), 6, { rigoriSbagliati: 1 }), lega).fantavoto,
      3,
    );
  });

  it('il portiere paga i gol subiti e incassa il rigore parato', () => {
    strictEqual(
      calcolaFantavoto(prestazione(g('p', 'P'), 6, { golSubiti: 2 }), lega).fantavoto,
      4,
    );
    strictEqual(
      calcolaFantavoto(prestazione(g('p', 'P'), 6, { golSubiti: 1, rigoriParati: 1 }), lega).fantavoto,
      8,
    );
  });

  it('solo il portiere paga i gol subiti', () => {
    // Il difensore non prende malus per i gol della sua squadra: quello e'
    // compito del modificatore di difesa.
    strictEqual(
      calcolaFantavoto(prestazione(g('d', 'D'), 6, { golSubiti: 3 }), lega).fantavoto,
      6,
    );
  });

  it('il malus di adattamento si applica a chi e’ fuori posizione', () => {
    const dritto = calcolaFantavoto(prestazione(g('x', 'C'), 6), lega).fantavoto!;
    const storto = calcolaFantavoto(prestazione(g('x', 'C'), 6, {}, true), lega).fantavoto!;
    strictEqual(dritto - storto, lega.malus.adattamento);
  });

  it('senza voto il fantavoto e’ nullo, non il solo bonus', () => {
    // Chi non porta voto vale zero: e' la ragione per cui prima di arrivare qui
    // si prova a sostituirlo con la panchina.
    const p = calcolaFantavoto(prestazione(g('x', 'A'), null, { gol: 1 }), lega);
    strictEqual(p.fantavoto, null);
    strictEqual(p.bonus, 3, 'il bonus resta calcolato, ma non diventa punteggio');
  });

  it('il rigore segnato ha una voce sua, separata dal gol', () => {
    // Alcune leghe lo pagano meno: la voce separata serve a poterlo fare senza
    // toccare codice.
    const con = { ...lega, bonus: { ...lega.bonus, rigoreSegnato: 2.5 } };
    strictEqual(
      calcolaFantavoto(prestazione(g('x', 'A'), 6, { rigoriSegnati: 1 }), con).fantavoto,
      8.5,
    );
  });

  it('la porta inviolata vale un punto, e solo al portiere', () => {
    strictEqual(calcolaFantavoto(prestazione(g('p', 'P'), 6), lega).fantavoto, 7);
    strictEqual(
      calcolaFantavoto(prestazione(g('p', 'P'), 6, { golSubiti: 1 }), lega).fantavoto,
      5,
      'con un gol subito non c’e’ imbattibilita’: 6 - 1 di malus',
    );
    // Un difensore a porta inviolata non prende niente: nel fantacalcio il
    // bonus e' del portiere, e la difesa la premia semmai il modificatore.
    strictEqual(calcolaFantavoto(prestazione(g('d', 'D'), 6), lega).fantavoto, 6);
  });

  it('senza voto non c’e’ imbattibilita’: il portiere non ha giocato', () => {
    strictEqual(calcolaFantavoto(prestazione(g('p', 'P'), null), lega).bonus, 0);
  });
});

/* ------------------------------------------------------------------ */
/* Modificatori                                                        */
/* ------------------------------------------------------------------ */

describe('bonus per soglia', () => {
  const soglieProva = [{ media: 6, bonus: 1 }, { media: 6.5, bonus: 3 }, { media: 7, bonus: 6 }];

  it('prende la soglia piu’ alta raggiunta', () => {
    strictEqual(bonusPerSoglia(5.99, soglieProva), 0);
    strictEqual(bonusPerSoglia(6, soglieProva), 1);
    strictEqual(bonusPerSoglia(6.49, soglieProva), 1);
    strictEqual(bonusPerSoglia(6.5, soglieProva), 3);
    strictEqual(bonusPerSoglia(6.99, soglieProva), 3);
    strictEqual(bonusPerSoglia(7, soglieProva), 6);
    strictEqual(bonusPerSoglia(9, soglieProva), 6);
  });
});

describe('modificatore di difesa', () => {
  const attivo: ConfigurazioneLega = {
    ...lega,
    modificatoreDifesa: { ...lega.modificatoreDifesa, attivo: true },
  };

  const conDifesa = (voti: (number | null)[], votoPortiere: number | null = 6) => {
    const prestazioni = [
      prestazione(g('p', 'P'), votoPortiere),
      ...voti.map((v, i) => prestazione(g(`d${i}`, 'D'), v)),
    ];
    return punteggioSquadra(prestazioni, attivo);
  };

  it('acceso nella configurazione della lega', () => {
    strictEqual(lega.modificatoreDifesa.attivo, true);
    strictEqual(lega.modificatoreDifesa.includiPortiere, true);
    strictEqual(lega.modificatoreDifesa.difensoriRichiesti, 4, 'solo con la difesa a quattro');
  });

  it('spegnerlo e’ una riga, e i fantavoti individuali non cambiano', () => {
    const spento: ConfigurazioneLega = {
      ...lega,
      modificatoreDifesa: { ...lega.modificatoreDifesa, attivo: false },
    };
    const undici = [prestazione(g('p', 'P'), 7), ...[0, 1, 2, 3].map((i) => prestazione(g(`d${i}`, 'D'), 7))];
    const esito = punteggioSquadra(undici, spento);
    strictEqual(esito.difesa.applicato, false);
    strictEqual(esito.difesa.bonus, 0);
    strictEqual(esito.sommaFantavoti, punteggioSquadra(undici, lega).sommaFantavoti);
  });

  it('media del portiere piu’ i tre migliori difensori', () => {
    // 6 + 7 + 7 + 6 = 26 / 4 = 6.5 -> +3. Il quarto difensore, il peggiore,
    // non entra nel conto.
    const esito = conDifesa([7, 7, 6, 4]);
    strictEqual(esito.difesa.applicato, true);
    strictEqual(esito.difesa.media, 6.5);
    strictEqual(esito.difesa.bonus, 3);
  });

  it('usa i voti puri, non i fantavoti', () => {
    // Un difensore che segna non rende la difesa piu' solida.
    const conGol = punteggioSquadra(
      [
        prestazione(g('p', 'P'), 6),
        prestazione(g('d0', 'D'), 6, { gol: 1 }),
        prestazione(g('d1', 'D'), 6),
        prestazione(g('d2', 'D'), 6),
        prestazione(g('d3', 'D'), 6),
      ],
      attivo,
    );
    strictEqual(conGol.difesa.media, 6, 'il gol non deve alzare la media difensiva');
    strictEqual(conGol.difesa.bonus, 1);
  });

  it('non si applica con meno di quattro difensori col voto', () => {
    const esito = conDifesa([7, 7, 7]);
    strictEqual(esito.difesa.applicato, false);
    ok(esito.difesa.motivo!.includes('ce ne sono 3'));
    strictEqual(esito.difesa.bonus, 0);
  });

  it('un difensore senza voto non conta come difensore', () => {
    const esito = conDifesa([7, 7, 7, null]);
    strictEqual(esito.difesa.applicato, false, 'con tre difensori validi non si applica');
  });

  it('non si applica se il portiere non porta voto', () => {
    const esito = conDifesa([7, 7, 7, 7], null);
    strictEqual(esito.difesa.applicato, false);
    ok(esito.difesa.motivo!.includes('portiere'));
  });

  it('senza portiere nel conto usa i quattro migliori difensori', () => {
    const senzaPortiere: ConfigurazioneLega = {
      ...attivo,
      modificatoreDifesa: { ...attivo.modificatoreDifesa, includiPortiere: false },
    };
    const esito = punteggioSquadra(
      [
        prestazione(g('p', 'P'), 3),
        ...[7, 7, 7, 7].map((v, i) => prestazione(g(`d${i}`, 'D'), v)),
      ],
      senzaPortiere,
    );
    strictEqual(esito.difesa.media, 7, 'il voto del portiere non deve entrare');
    strictEqual(esito.difesa.bonus, 5);
  });

  it('le sei fasce, al centesimo', () => {
    // La tabella scelta dalla lega: un punto ogni quarto di voto, da 6.00 a
    // 7.25. E' il punto in cui un > al posto di un >= toglie un bonus a
    // qualcuno, e se ne accorge solo chi rifa' i conti a mano.
    const t = lega.modificatoreDifesa.soglie;
    strictEqual(t.length, 6, 'sei fasce');

    strictEqual(bonusPerSoglia(5.99, t), 0, 'sotto il 6 non si prende niente');
    for (const [media, bonus] of [
      [6.0, 1], [6.25, 2], [6.5, 3], [6.75, 4], [7.0, 5], [7.25, 6],
    ] as const) {
      strictEqual(bonusPerSoglia(media, t), bonus, `media ${media} vale +${bonus}`);
      strictEqual(
        bonusPerSoglia(media - 0.01, t),
        bonus - 1,
        `un centesimo sotto ${media} vale +${bonus - 1}`,
      );
    }
    strictEqual(bonusPerSoglia(9, t), 6, 'sopra l’ultima fascia non si sale piu’');
  });

  it('le sei fasce, viste dalla squadra in campo', () => {
    // Le stesse soglie raggiunte davvero, portiere piu’ tre difensori.
    strictEqual(conDifesa([6, 6, 6, 6]).difesa.bonus, 1, 'media 6.00');
    strictEqual(conDifesa([6.5, 6.5, 6, 6]).difesa.bonus, 2, 'media 6.25');
    strictEqual(conDifesa([7, 7, 6, 6]).difesa.bonus, 3, 'media 6.50');
    strictEqual(conDifesa([7, 7, 7, 6]).difesa.bonus, 4, 'media 6.75');
    strictEqual(conDifesa([7, 7, 7, 7], 7).difesa.bonus, 5, 'media 7.00');
    strictEqual(conDifesa([7.5, 7.5, 7, 7], 7).difesa.bonus, 6, 'media 7.25');

    // Per scendere sotto il 6 non basta un difensore scarso: viene scartato,
    // perche' contano i TRE MIGLIORI. Servono tre voti bassi.
    strictEqual(conDifesa([5, 5, 5, 7]).difesa.bonus, 0, 'media (6+7+5+5)/4 = 5.75');
  });

  it('il difensore peggiore viene scartato, non media tutti e quattro', () => {
    // Con quattro difensori a 7 e uno a 3, la media non deve risentirne: il 3
    // e' il quarto e resta fuori.
    const esito = conDifesa([7, 7, 7, 3]);
    strictEqual(esito.difesa.media, 6.75, 'media (6+7+7+7)/4');
  });
});

describe('modificatore portiere', () => {
  const attivo: ConfigurazioneLega = {
    ...lega,
    modificatorePortiere: { ...lega.modificatorePortiere, attivo: true },
  };

  it('spento di default', () => {
    strictEqual(punteggioSquadra([prestazione(g('p', 'P'), 8)], lega).portiere.applicato, false);
  });

  it('dipende dal solo voto del portiere', () => {
    strictEqual(punteggioSquadra([prestazione(g('p', 'P'), 6)], attivo).portiere.bonus, 0);
    strictEqual(punteggioSquadra([prestazione(g('p', 'P'), 6.5)], attivo).portiere.bonus, 1);
    strictEqual(punteggioSquadra([prestazione(g('p', 'P'), 7)], attivo).portiere.bonus, 2);
  });

  it('usa il voto puro, non il fantavoto', () => {
    // Un rigore parato vale gia' +3 di bonus: non deve valere due volte.
    const esito = punteggioSquadra(
      [prestazione(g('p', 'P'), 6, { rigoriParati: 1 })],
      attivo,
    );
    strictEqual(esito.portiere.media, 6);
    strictEqual(esito.portiere.bonus, 0);
  });
});

/* ------------------------------------------------------------------ */
/* Punteggio di squadra                                                */
/* ------------------------------------------------------------------ */

describe('fantapunti di squadra', () => {
  const undici = (): PrestazioneFanta[] => [
    prestazione(g('p', 'P'), 6),
    ...[0, 1, 2, 3].map((i) => prestazione(g(`d${i}`, 'D'), 6)),
    ...[0, 1, 2, 3].map((i) => prestazione(g(`c${i}`, 'C'), 6)),
    ...[0, 1].map((i) => prestazione(g(`a${i}`, 'A'), 6)),
  ];

  it('somma gli undici fantavoti, il bonus del portiere e il modificatore', () => {
    const esito = punteggioSquadra(undici(), lega);
    // Undici volte sei fa 66, piu' un punto di porta inviolata al portiere
    // (67) piu' il modificatore, che con una difesa tutta da 6 vale +1 (68).
    strictEqual(esito.sommaFantavoti, 67);
    strictEqual(esito.difesa.media, 6);
    strictEqual(esito.difesa.bonus, 1);
    strictEqual(esito.fantapunti, 68);
  });

  it('una squadra tutta da 6 segna esattamente un gol', () => {
    // 68 punti stanno fra 66 e 72: un gol, non due. E' il caso di confine
    // piu' facile da sbagliare e il piu' facile da contestare.
    strictEqual(golDaFantapunti(punteggioSquadra(undici(), lega).fantapunti, lega.soglieGol), 1);
  });

  it('chi resta senza voto vale zero e viene elencato', () => {
    const prestazioni = undici();
    prestazioni[3] = prestazione(g('d2', 'D'), null, { gol: 1 });
    const esito = punteggioSquadra(prestazioni, lega);
    // 60 di fantavoti piu' la porta inviolata. Il modificatore non si applica:
    // con un difensore senza voto la difesa a quattro non c'e' piu'.
    strictEqual(esito.difesa.applicato, false);
    strictEqual(esito.fantapunti, 61);
    deepStrictEqual(esito.senzaVoto, ['d2']);
  });

  it('i modificatori si sommano ai fantavoti', () => {
    const attivi: ConfigurazioneLega = {
      ...lega,
      modificatoreDifesa: { ...lega.modificatoreDifesa, attivo: true },
      modificatorePortiere: { ...lega.modificatorePortiere, attivo: true },
    };
    const prestazioni = undici().map((p) =>
      p.giocatore.ruoloClassico === 'P' || p.giocatore.ruoloClassico === 'D'
        ? prestazione(p.giocatore, 7)
        : p,
    );
    const esito = punteggioSquadra(prestazioni, attivi);
    // Il portiere prende anche la porta inviolata: nessuno gli ha segnato.
    strictEqual(esito.sommaFantavoti, 5 * 7 + 6 * 6 + 1);
    strictEqual(esito.difesa.bonus, 5, 'media 7.00');
    strictEqual(esito.portiere.bonus, 2);
    strictEqual(esito.fantapunti, esito.sommaFantavoti + 7);
  });
});

/* ------------------------------------------------------------------ */

describe('configurazione di lega', () => {
  it('rifiuta soglie non crescenti', () => {
    throws(
      () =>
        validaConfigurazioneLega({
          ...lega,
          modificatoreDifesa: {
            ...lega.modificatoreDifesa,
            soglie: [{ media: 7, bonus: 6 }, { media: 6, bonus: 1 }],
          },
        }),
      /ordine crescente/,
    );
  });

  it('rifiuta una fascia che paga meno della precedente', () => {
    // In una tabella a sei fasce un bonus fuori ordine non si nota a occhio.
    throws(
      () =>
        validaConfigurazioneLega({
          ...lega,
          modificatoreDifesa: {
            ...lega.modificatoreDifesa,
            soglie: [{ media: 6, bonus: 3 }, { media: 6.5, bonus: 2 }],
          },
        }),
      /non puo’ calare/,
    );
  });

  it('rifiuta scarti non positivi', () => {
    throws(
      () => validaConfigurazioneLega({ ...lega, soglieGol: { base: 66, scarti: [6, 0] } }),
      /scarti devono essere positivi/,
    );
  });
});

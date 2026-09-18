/**
 * Test della modalita' Mantra.
 *
 * I test verificano il **meccanismo**: che gli adattamenti costino, che gli
 * aggravi costino di piu', che le eccezioni per modulo vengano applicate e che
 * la strategia Basic sappia usarli nell'ordine giusto.
 *
 * Non verificano che la matrice ruolo x casella sia quella ufficiale, perche'
 * la matrice in `config/mantra.json` e' una ricostruzione da confrontare col
 * regolamento. I due piani sono separati apposta: quando la matrice verra'
 * corretta, questi test continueranno a valere.
 */

import { deepStrictEqual, ok, strictEqual, throws } from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { regoleMantra, validaConfigurazioneMantra, type ConfigurazioneMantra } from '../src/mantra.ts';
import { coperturaModuli, disponi } from '../src/schieramento.ts';
import { strategiaBasic } from '../src/sostituzione.ts';
import type { RuoloClassico, RuoloMantra, Schierabile } from '../src/tipi.ts';

const configurazione = JSON.parse(
  readFileSync(fileURLToPath(new URL('../config/mantra.json', import.meta.url)), 'utf8'),
) as ConfigurazioneMantra;

const mantra = regoleMantra(configurazione);

function m(id: string, ruoli: RuoloMantra[], ruoloClassico: RuoloClassico = 'C'): Schierabile {
  return { id, ruoliMantra: ruoli, ruoloClassico };
}

const slotDi = (modulo: string, tipo: string) => {
  const mod = mantra.modulo(modulo)!;
  const slot = mod.slot.find((s) => s.id === tipo || s.id.startsWith(tipo));
  if (!slot) throw new Error(`Casella ${tipo} non trovata nel modulo ${modulo}`);
  return { modulo: mod, slot };
};

describe('struttura dei moduli', () => {
  it('espone gli undici moduli della specifica', () => {
    deepStrictEqual(
      mantra.moduli.map((x) => x.nome).sort(),
      ['3-4-1-2', '3-4-2-1', '3-4-3', '3-5-1-1', '3-5-2', '4-1-4-1', '4-2-3-1', '4-3-1-2', '4-3-3', '4-4-1-1', '4-4-2'],
    );
  });

  it('ogni modulo ha undici caselle con identificativi unici', () => {
    for (const mod of mantra.moduli) {
      strictEqual(mod.slot.length, 11, mod.nome);
      strictEqual(new Set(mod.slot.map((s) => s.id)).size, 11, `${mod.nome}: caselle duplicate`);
    }
  });

  it('ogni modulo ha cinque caselle difensive e cinque offensive', () => {
    // E' l'invariante strutturale di SPEC 6.2, gia' imposto in validazione.
    // Qui si verifica che la configurazione vera lo rispetti davvero.
    for (const mod of configurazione.moduli) {
      const stampi = mod.slot.map((t) => configurazione.tipiSlot[t]!);
      strictEqual(stampi.filter((s) => s.reparto === 'P').length, 1, mod.nome);
      strictEqual(
        stampi.filter((s) => s.reparto !== 'P' && s.stampo === 'difensivo').length,
        5,
        `${mod.nome}: caselle difensive`,
      );
      strictEqual(
        stampi.filter((s) => s.reparto !== 'P' && s.stampo === 'offensivo').length,
        5,
        `${mod.nome}: caselle offensive`,
      );
    }
  });

  it('rifiuta un modulo che non rispetta il cinque e cinque', () => {
    const rotta: ConfigurazioneMantra = {
      ...configurazione,
      moduli: [{ nome: 'rotto', slot: ['POR', 'DD', 'DC', 'DC', 'DS', 'M', 'M', 'C', 'C', 'C', 'PC'] }],
      eccezioni: [],
    };
    throws(() => validaConfigurazioneMantra(rotta), /caselle difensive e .* offensive/);
  });

  it('rifiuta una casella che sia insieme titolare e adattata per lo stesso ruolo', () => {
    const rotta: ConfigurazioneMantra = {
      ...configurazione,
      tipiSlot: {
        ...configurazione.tipiSlot,
        DC: { reparto: 'D', stampo: 'difensivo', ruoli: ['Dc'], adattati: ['Dc'] },
      },
    };
    throws(() => validaConfigurazioneMantra(rotta), /sia titolare sia adattato/);
  });
});

describe('matrice di compatibilita’', () => {
  it('il ruolo titolare non costa nulla', () => {
    const { modulo, slot } = slotDi('4-4-2', 'DC');
    deepStrictEqual(mantra.valuta(m('x', ['Dc'], 'D'), slot, modulo), { ammesso: true, costo: 0 });
  });

  it('un ruolo adattato costa un adattamento', () => {
    const { modulo, slot } = slotDi('4-4-2', 'DC');
    strictEqual(mantra.valuta(m('x', ['B'], 'D'), slot, modulo).costo, configurazione.costi.adattamento);
  });

  it('un ruolo aggravato costa di piu’ di uno adattato', () => {
    const { modulo, slot } = slotDi('4-2-3-1', 'W');
    const aggravato = mantra.valuta(m('x', ['T'], 'C'), slot, modulo);
    const adattato = mantra.valuta(m('y', ['E'], 'C'), slot, modulo);
    ok(aggravato.ammesso && adattato.ammesso);
    ok(aggravato.costo > adattato.costo, `aggravato ${aggravato.costo}, adattato ${adattato.costo}`);
  });

  it('un ruolo estraneo non e’ ammesso', () => {
    const { modulo, slot } = slotDi('4-4-2', 'DC');
    strictEqual(mantra.valuta(m('x', ['Pc'], 'A'), slot, modulo).ammesso, false);
  });

  it('il portiere occupa solo la porta, e la porta solo il portiere', () => {
    const { modulo, slot } = slotDi('4-4-2', 'POR');
    strictEqual(mantra.valuta(m('p', ['Por'], 'P'), slot, modulo).costo, 0);
    for (const ruolo of ['Dc', 'C', 'Pc'] as RuoloMantra[]) {
      strictEqual(mantra.valuta(m('x', [ruolo]), slot, modulo).ammesso, false, ruolo);
    }
    const altrove = slotDi('4-4-2', 'DC');
    strictEqual(mantra.valuta(m('p', ['Por'], 'P'), altrove.slot, altrove.modulo).ammesso, false);
  });

  it('chi ha due ruoli entra col migliore dei due, non col primo dichiarato', () => {
    // Un W;T in una casella T deve entrare da trequartista senza malus, anche
    // se il suo ruolo principale e' ala.
    const { modulo, slot } = slotDi('4-4-1-1', 'T');
    strictEqual(mantra.valuta(m('x', ['W', 'T']), slot, modulo).costo, 0);
    strictEqual(mantra.valuta(m('y', ['T', 'W']), slot, modulo).costo, 0);
  });
});

describe('eccezioni che dipendono dal modulo', () => {
  it('W e T sono intercambiabili con aggravio nei moduli normali', () => {
    const { modulo, slot } = slotDi('4-2-3-1', 'W');
    const esito = mantra.valuta(m('x', ['T']), slot, modulo);
    strictEqual(esito.ammesso, true);
    strictEqual(esito.costo, configurazione.costi.aggravato);
  });

  it('nel 4-1-4-1 non lo sono nemmeno con malus', () => {
    // E' l'unica eccezione che la specifica nomina esplicitamente, ed e' la
    // ragione per cui `valuta` riceve anche il modulo e non solo la casella.
    const { modulo, slot } = slotDi('4-1-4-1', 'W');
    strictEqual(mantra.valuta(m('x', ['T']), slot, modulo).ammesso, false);
  });

  it('l’eccezione non tocca gli altri ruoli della stessa casella', () => {
    const { modulo, slot } = slotDi('4-1-4-1', 'W');
    strictEqual(mantra.valuta(m('x', ['W']), slot, modulo).costo, 0);
    strictEqual(mantra.valuta(m('y', ['E']), slot, modulo).ammesso, true);
  });

  it('un giocatore con due ruoli aggira l’eccezione col ruolo buono', () => {
    const { modulo, slot } = slotDi('4-1-4-1', 'W');
    strictEqual(mantra.valuta(m('x', ['T', 'W']), slot, modulo).costo, 0);
  });
});

describe('composizione della rosa in Mantra', () => {
  const rosa = (quanti: number, portieri = 2): Schierabile[] => [
    ...Array.from({ length: portieri }, (_, i) => m(`p${i}`, ['Por'], 'P')),
    ...Array.from({ length: quanti - portieri }, (_, i) => m(`g${i}`, ['C'])),
  ];

  it('accetta il minimo di ventitre con due portieri', () => {
    deepStrictEqual(mantra.validaRosa(rosa(23)), []);
  });

  it('non ha un massimo, al contrario di classic', () => {
    deepStrictEqual(mantra.validaRosa(rosa(40)), []);
  });

  it('rifiuta una rosa sotto il minimo o senza portieri a sufficienza', () => {
    ok(mantra.validaRosa(rosa(22)).some((p) => p.messaggio.includes('minimo')));
    ok(mantra.validaRosa(rosa(23, 1)).some((p) => p.messaggio.includes('portieri')));
  });
});

/* ------------------------------------------------------------------ */

/** Una rosa Mantra plausibile da venticinque, con ruoli assortiti. */
function rosaMantra(): Schierabile[] {
  const voci: [string, RuoloMantra[], RuoloClassico][] = [
    ['por1', ['Por'], 'P'], ['por2', ['Por'], 'P'], ['por3', ['Por'], 'P'],
    ['dc1', ['Dc'], 'D'], ['dc2', ['Dc'], 'D'], ['dc3', ['Dc'], 'D'], ['dc4', ['Dc', 'B'], 'D'],
    ['dd1', ['Dd'], 'D'], ['dd2', ['Dd', 'E'], 'D'], ['ds1', ['Ds'], 'D'], ['ds2', ['Ds', 'E'], 'D'],
    ['m1', ['M'], 'C'], ['m2', ['M', 'C'], 'C'],
    ['c1', ['C'], 'C'], ['c2', ['C', 'T'], 'C'], ['c3', ['C'], 'C'],
    ['e1', ['E'], 'C'], ['e2', ['E', 'W'], 'C'],
    ['w1', ['W'], 'C'], ['w2', ['W', 'A'], 'C'],
    ['t1', ['T'], 'C'], ['t2', ['T', 'A'], 'C'],
    ['a1', ['A'], 'A'], ['pc1', ['Pc'], 'A'], ['pc2', ['Pc', 'A'], 'A'],
  ];
  return voci.map(([id, ruoli, classico]) => m(id, ruoli, classico));
}

describe('schieramento con una rosa Mantra vera', () => {
  const rosa = rosaMantra();

  it('copre almeno qualche modulo senza alcun adattamento', () => {
    const copertura = coperturaModuli(rosa, mantra);
    ok(
      copertura.some((c) => c.livello === 'perfetta'),
      `nessun modulo perfetto: ${copertura.map((c) => `${c.modulo}=${c.livello}`).join(' ')}`,
    );
  });

  it('la copertura e’ tipicamente parziale, ed e’ l’informazione utile', () => {
    // SPEC 6.1: con rose da venticinque la copertura e' tipicamente parziale,
    // ed e' quello che l'utente vuole vedere subito dopo l'import.
    const copertura = coperturaModuli(rosa, mantra);
    strictEqual(copertura.length, 11);
    for (const c of copertura) {
      ok(['perfetta', 'adattata', 'impossibile'].includes(c.livello), c.modulo);
      if (c.livello === 'adattata') ok(c.adattamenti > 0, `${c.modulo}: adattata senza adattamenti`);
      if (c.livello === 'perfetta') strictEqual(c.adattamenti, 0, c.modulo);
    }
  });

  it('la disposizione non mette mai nessuno in una casella vietata', () => {
    for (const modulo of mantra.moduli) {
      const d = disponi(rosa, modulo, mantra);
      const perId = new Map(rosa.map((g) => [g.id, g]));
      for (const [slotId, id] of d.titolari) {
        const slot = modulo.slot.find((s) => s.id === slotId)!;
        ok(
          mantra.valuta(perId.get(id)!, slot, modulo).ammesso,
          `${modulo.nome}: ${id} in ${slotId} non e’ ammesso`,
        );
      }
    }
  });

  it('preferisce zero adattamenti a uno, anche cambiando modulo', () => {
    const conAdattamenti = coperturaModuli(rosa, mantra).filter((c) => c.livello === 'adattata');
    const perfetti = coperturaModuli(rosa, mantra).filter((c) => c.livello === 'perfetta');
    if (perfetti.length === 0 || conAdattamenti.length === 0) return; // niente da confrontare

    const esito = strategiaBasic.adatta({
      formazione: {
        modulo: conAdattamenti[0]!.modulo,
        titolari: new Map(),
        panchina: rosa.map((g) => g.id),
      },
      rosa,
      indisponibili: new Set(),
      regole: mantra,
    });
    strictEqual(esito.adattati.length, 0, 'ha accettato un adattamento evitabile');
    strictEqual(esito.livello, 'efficiente');
  });
});

describe('sostituzioni in Mantra', () => {
  const rosa = rosaMantra();

  const schiera = (modulo: string, indisponibili: string[]) => {
    const d = disponi(rosa, mantra.modulo(modulo)!, mantra);
    const titolari = new Set(d.titolari.values());
    return strategiaBasic.adatta({
      formazione: {
        modulo,
        titolari: d.titolari,
        panchina: rosa.filter((g) => !titolari.has(g.id)).map((g) => g.id),
      },
      rosa,
      indisponibili: new Set(indisponibili),
      regole: mantra,
    });
  };

  it('sostituisce senza adattamenti quando puo’', () => {
    const esito = schiera('3-5-2', ['dc1']);
    ok(esito.livello === 'perfetta' || esito.livello === 'efficiente', esito.livello);
    strictEqual(esito.adattati.length, 0);
  });

  it('ricorre all’adattamento solo quando non c’e’ altro', () => {
    // Fuori tutti i centrali puri: resta solo chi puo' adattarsi.
    const esito = schiera('3-5-2', ['dc1', 'dc2', 'dc3']);
    ok(esito.formazione.titolari.size >= 10, 'ha rinunciato troppo presto');
    if (esito.livello === 'adattata') ok(esito.adattati.length > 0);
  });

  it('non schiera mai un indisponibile, nemmeno adattando', () => {
    const fuori = ['por1', 'dc1', 'w1', 'pc1'];
    const esito = schiera('4-3-3', fuori);
    for (const id of esito.formazione.titolari.values()) {
      ok(!fuori.includes(id), `${id} e’ indisponibile`);
    }
  });

  it('e’ deterministica', () => {
    const uno = schiera('4-4-2', ['dc1', 'c1']);
    const due = schiera('4-4-2', ['dc1', 'c1']);
    deepStrictEqual([...uno.formazione.titolari.entries()], [...due.formazione.titolari.entries()]);
  });
});

describe('la stessa strategia serve entrambe le modalita’', () => {
  it('Basic non conosce la modalita’ in cui sta girando', () => {
    // La prova che i due contratti sono davvero ortogonali: la stessa funzione,
    // senza un solo ramo dedicato, produce risultati validi in Mantra come in
    // classic. Qui si verifica solo che accetti le regole Mantra e produca
    // qualcosa di sensato.
    const rosa = rosaMantra();
    const esito = strategiaBasic.adatta({
      formazione: { modulo: '4-4-2', titolari: new Map(), panchina: rosa.map((g) => g.id) },
      rosa,
      indisponibili: new Set(),
      regole: mantra,
    });
    strictEqual(esito.formazione.titolari.size, 11);
    strictEqual(strategiaBasic.nome, 'basic');
  });
});

/**
 * Test della modalita' Mantra.
 *
 * Le regole generali vengono dal regolamento ufficiale e sono verificate qui:
 * gli stampi, il vincolo dei cinque e cinque, la direzione degli adattamenti,
 * i ruoli alternativi nella stessa casella.
 *
 * La sequenza esatta delle caselle di ogni modulo resta invece una nostra
 * costruzione, vincolata ma non verificata. I test sono scritti apposta per
 * non dipenderne: verificano il meccanismo e gli invarianti, non quale casella
 * stia in quale posizione. Quando la sequenza verra' confermata o corretta,
 * continueranno a valere.
 */

import { deepStrictEqual, ok, strictEqual, throws } from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  lineaDi, regoleMantra, stampoDi, validaConfigurazioneMantra, type ConfigurazioneMantra,
} from '../src/mantra.ts';
import { coperturaModuli, disponi } from '../src/schieramento.ts';
import { strategiaBasic } from '../src/sostituzione.ts';
import { RUOLI_MANTRA, type RuoloClassico, type RuoloMantra, type Schierabile } from '../src/tipi.ts';

const configurazione = JSON.parse(
  readFileSync(fileURLToPath(new URL('../config/mantra.json', import.meta.url)), 'utf8'),
) as ConfigurazioneMantra;

const mantra = regoleMantra(configurazione);

function m(id: string, ruoli: RuoloMantra[], ruoloClassico: RuoloClassico = 'C'): Schierabile {
  return { id, ruoliMantra: ruoli, ruoloClassico };
}

/** Trova nel modulo una casella del tipo indicato. */
function casella(modulo: string, tipo: string) {
  const mod = mantra.modulo(modulo)!;
  const slot = mod.slot.find((s) => s.id === tipo || s.id.replace(/\d+$/, '') === tipo);
  if (!slot) throw new Error(`Casella ${tipo} non trovata nel modulo ${modulo}`);
  return { modulo: mod, slot };
}

/** Il primo modulo che contiene una casella di quel tipo. */
function moduloCon(tipo: string): string {
  for (const mod of configurazione.moduli) if (mod.slot.includes(tipo)) return mod.nome;
  throw new Error(`Nessun modulo contiene la casella ${tipo}`);
}

/* ------------------------------------------------------------------ */
/* Regole verificate sul regolamento                                   */
/* ------------------------------------------------------------------ */

describe('stampo difensivo e offensivo', () => {
  it('i ruoli stanno nei gruppi del regolamento', () => {
    // Testuale: cinque di stampo difensivo (Dd, Ds, Dc, B, E, M) e cinque
    // offensivo (C, T, W, A, Pc). Da notare che E e M sono difensivi e C
    // offensivo, pur essendo tutti e tre centrocampisti.
    for (const r of ['Dd', 'Ds', 'Dc', 'B', 'E', 'M'] as RuoloMantra[]) {
      strictEqual(stampoDi(configurazione, r), 'difensivo', r);
    }
    for (const r of ['C', 'T', 'W', 'A', 'Pc'] as RuoloMantra[]) {
      strictEqual(stampoDi(configurazione, r), 'offensivo', r);
    }
  });

  it('ogni ruolo ha una linea di gioco dichiarata', () => {
    for (const r of RUOLI_MANTRA) ok(lineaDi(configurazione, r), r);
  });

  it('ogni modulo schiera cinque uomini di stampo difensivo e cinque offensivo', () => {
    // E' il vincolo che tiene equivalenti fra loro tutti i moduli del gioco.
    for (const mod of configurazione.moduli) {
      const stampi = mod.slot.map((tipo) => {
        const ruoli = configurazione.tipiSlot[tipo] as RuoloMantra[];
        return configurazione.ruoli[ruoli[0]!]!;
      });
      strictEqual(stampi.filter((s) => s.linea === 'porta').length, 1, mod.nome);
      strictEqual(
        stampi.filter((s) => s.linea !== 'porta' && s.stampo === 'difensivo').length,
        5,
        `${mod.nome}: uomini di stampo difensivo`,
      );
      strictEqual(
        stampi.filter((s) => s.linea !== 'porta' && s.stampo === 'offensivo').length,
        5,
        `${mod.nome}: uomini di stampo offensivo`,
      );
    }
  });

  it('rifiuta un modulo che non rispetta il cinque e cinque', () => {
    const rotta: ConfigurazioneMantra = {
      ...configurazione,
      moduli: [{ nome: 'rotto', slot: ['POR', 'DD', 'DC', 'DC', 'DS', 'M', 'E', 'C', 'C', 'C', 'PC'] }],
      eccezioni: [],
    };
    throws(() => validaConfigurazioneMantra(rotta), /stampo difensivo e .* offensivo/);
  });
});

describe('direzione degli adattamenti', () => {
  // Regola del regolamento: ci si adatta nella propria linea di gioco o in una
  // piu' avanzata, mai in una piu' arretrata. Un difensore puo' fare la punta
  // con un malus, una punta non puo' fare il difensore nemmeno con un malus.

  it('un difensore puo’ giocare in attacco, col malus', () => {
    const { modulo, slot } = casella(moduloCon('PC'), 'PC');
    const esito = mantra.valuta(m('x', ['Dc'], 'D'), slot, modulo);
    strictEqual(esito.ammesso, true);
    strictEqual(esito.costo, configurazione.costi.adattamento);
  });

  it('una punta non puo’ giocare in difesa, nemmeno col malus', () => {
    const { modulo, slot } = casella(moduloCon('DC'), 'DC');
    strictEqual(mantra.valuta(m('x', ['Pc'], 'A'), slot, modulo).ammesso, false);
  });

  it('la direzione vale su ogni coppia di linee', () => {
    const coppie: [RuoloMantra, string][] = [
      ['Dc', 'M'], ['Dc', 'C'], ['Dc', 'T'], ['Dc', 'PC'],
      ['M', 'C'], ['M', 'T'], ['M', 'PC'],
      ['C', 'T'], ['C', 'PC'],
      ['T', 'PC'],
    ];
    for (const [ruolo, tipo] of coppie) {
      const avanti = casella(moduloCon(tipo), tipo);
      ok(
        mantra.valuta(m('x', [ruolo]), avanti.slot, avanti.modulo).ammesso,
        `${ruolo} dovrebbe poter giocare in ${tipo}`,
      );
    }
  });

  it('nella stessa linea ci si adatta in entrambi i versi', () => {
    // E e M sono entrambi centrocampisti: l'uno puo' fare il ruolo dell'altro.
    const versoM = casella(moduloCon('M'), 'M');
    ok(mantra.valuta(m('x', ['E']), versoM.slot, versoM.modulo).ammesso);
    const versoE = casella(moduloCon('E'), 'E');
    ok(mantra.valuta(m('y', ['M']), versoE.slot, versoE.modulo).ammesso);
  });

  it('il portiere non esce dalla porta e nessuno ci entra al posto suo', () => {
    // Senza una regola esplicita la direzione lo lascerebbe giocare ovunque,
    // perche' la porta e' la linea piu' arretrata di tutte.
    const porta = casella('4-4-2', 'POR');
    strictEqual(mantra.valuta(m('p', ['Por'], 'P'), porta.slot, porta.modulo).costo, 0);
    for (const ruolo of ['Dc', 'C', 'Pc'] as RuoloMantra[]) {
      strictEqual(mantra.valuta(m('x', [ruolo]), porta.slot, porta.modulo).ammesso, false, ruolo);
    }

    for (const tipo of ['DC', 'C', 'PC']) {
      const altrove = casella(moduloCon(tipo), tipo);
      strictEqual(
        mantra.valuta(m('p', ['Por'], 'P'), altrove.slot, altrove.modulo).ammesso,
        false,
        `il portiere non deve poter giocare in ${tipo}`,
      );
    }
  });
});

describe('costo di un accoppiamento', () => {
  it('il ruolo titolare non costa nulla', () => {
    const { modulo, slot } = casella(moduloCon('DC'), 'DC');
    deepStrictEqual(mantra.valuta(m('x', ['Dc'], 'D'), slot, modulo), { ammesso: true, costo: 0 });
  });

  it('due ruoli nella stessa casella sono alternativi, entrambi senza malus', () => {
    // Dal regolamento: dove sono indicati due ruoli in una posizione, essi sono
    // alternativi, e lo restano anche in caso di sostituzione.
    const tipo = 'APC';
    const { modulo, slot } = casella(moduloCon(tipo), tipo);
    strictEqual(mantra.valuta(m('x', ['A'], 'A'), slot, modulo).costo, 0);
    strictEqual(mantra.valuta(m('y', ['Pc'], 'A'), slot, modulo).costo, 0);
  });

  it('chi ha due ruoli entra col migliore dei due, non col primo dichiarato', () => {
    const { modulo, slot } = casella(moduloCon('T'), 'T');
    strictEqual(mantra.valuta(m('x', ['W', 'T']), slot, modulo).costo, 0);
    strictEqual(mantra.valuta(m('y', ['T', 'W']), slot, modulo).costo, 0);
  });

  it('un aggravio costa piu’ di un adattamento normale', () => {
    const { modulo, slot } = casella('4-2-3-1', 'W');
    const aggravato = mantra.valuta(m('x', ['T']), slot, modulo);
    const normale = mantra.valuta(m('y', ['C']), slot, modulo);
    ok(aggravato.ammesso && normale.ammesso);
    ok(aggravato.costo > normale.costo, `aggravato ${aggravato.costo}, normale ${normale.costo}`);
  });
});

describe('eccezioni che dipendono dal modulo', () => {
  it('W e T sono intercambiabili con aggravio nei moduli normali', () => {
    const { modulo, slot } = casella('4-2-3-1', 'W');
    const esito = mantra.valuta(m('x', ['T']), slot, modulo);
    strictEqual(esito.ammesso, true);
    strictEqual(esito.costo, configurazione.costi.aggravato);
  });

  it('nel 4-1-4-1 non lo sono nemmeno con malus', () => {
    // E' la ragione per cui `valuta` riceve anche il modulo e non solo la
    // casella: senza, questa eccezione non sarebbe esprimibile.
    const { modulo, slot } = casella('4-1-4-1', 'W');
    strictEqual(mantra.valuta(m('x', ['T']), slot, modulo).ammesso, false);
  });

  it('l’eccezione non tocca gli altri ruoli della stessa casella', () => {
    const { modulo, slot } = casella('4-1-4-1', 'W');
    strictEqual(mantra.valuta(m('x', ['W']), slot, modulo).costo, 0);
    ok(mantra.valuta(m('y', ['C']), slot, modulo).ammesso);
  });

  it('un giocatore con due ruoli aggira l’eccezione col ruolo buono', () => {
    const { modulo, slot } = casella('4-1-4-1', 'W');
    strictEqual(mantra.valuta(m('x', ['T', 'W']), slot, modulo).costo, 0);
  });
});

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

  it('il numero di difensori del modulo corrisponde al nome', () => {
    for (const mod of configurazione.moduli) {
      const difensori = mod.slot.filter((tipo) => {
        const ruoli = configurazione.tipiSlot[tipo] as RuoloMantra[];
        return configurazione.ruoli[ruoli[0]!]!.linea === 'difesa';
      }).length;
      strictEqual(difensori, Number(mod.nome.split('-')[0]), `${mod.nome}: difensori`);
    }
  });

  it('rifiuta ruoli alternativi con linea o stampo diversi', () => {
    const rotta: ConfigurazioneMantra = {
      ...configurazione,
      tipiSlot: { ...configurazione.tipiSlot, APC: ['A', 'C'] },
    };
    throws(() => validaConfigurazioneMantra(rotta), /non condividono linea e stampo/);
  });
});

/* ------------------------------------------------------------------ */
/* Schieramento                                                        */
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

  it('la copertura e’ coerente con se stessa', () => {
    // SPEC 6.1: la copertura va mostrata subito dopo l'import, ed e'
    // l'informazione che l'utente vuole vedere per prima.
    const copertura = coperturaModuli(rosa, mantra);
    strictEqual(copertura.length, 11);
    for (const c of copertura) {
      if (c.livello === 'adattata') ok(c.adattamenti > 0, `${c.modulo}: adattata senza adattamenti`);
      if (c.livello === 'perfetta') strictEqual(c.adattamenti, 0, c.modulo);
      if (c.livello === 'impossibile') ok(c.slotScoperti.length > 0, c.modulo);
    }
  });

  it('non mette mai nessuno in una casella vietata', () => {
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

  it('non manda mai un portiere in campo ne’ un giocatore di movimento in porta', () => {
    for (const modulo of mantra.moduli) {
      const d = disponi(rosa, modulo, mantra);
      const perId = new Map(rosa.map((g) => [g.id, g]));
      for (const [slotId, id] of d.titolari) {
        const eePortiere = perId.get(id)!.ruoliMantra.includes('Por');
        const eeLaPorta = slotId.startsWith('POR');
        strictEqual(eePortiere, eeLaPorta, `${modulo.nome}: ${id} in ${slotId}`);
      }
    }
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
    const esito = schiera('3-5-2', ['dc1', 'dc2', 'dc3', 'dc4']);
    ok(esito.formazione.titolari.size >= 10, 'ha rinunciato troppo presto');
    if (esito.livello === 'adattata') ok(esito.adattati.length > 0);
  });

  it('senza portieri resta scoperta la porta e non altro', () => {
    const esito = schiera('4-4-2', ['por1', 'por2', 'por3']);
    deepStrictEqual(esito.slotScoperti, ['POR']);
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

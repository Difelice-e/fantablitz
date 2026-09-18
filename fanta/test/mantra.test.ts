/**
 * Test della modalita' Mantra.
 *
 * Ora che la configurazione e' la trascrizione del materiale ufficiale, i test
 * verificano due cose distinte: che la trascrizione sia coerente con se stessa
 * e con gli invarianti dichiarati dal regolamento, e che il codice interpreti
 * correttamente l'alfabeto della tabella delle sostituzioni.
 *
 * Le celle usate come esempi sono citate con riga e colonna, cosi' si
 * ritrovano nella tabella ufficiale senza doverla ricostruire a memoria.
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
const MODULI = Object.keys(configurazione.moduli).filter((k) => !k.startsWith('_'));

function m(id: string, ruoli: RuoloMantra[], ruoloClassico: RuoloClassico = 'C'): Schierabile {
  return { id, ruoliMantra: ruoli, ruoloClassico };
}

/** La prima casella del modulo il cui identificativo comincia per `prefisso`. */
function casella(modulo: string, prefisso: string) {
  const mod = mantra.modulo(modulo)!;
  const slot = mod.slot.find((s) => s.id === prefisso || s.id === `${prefisso}1`);
  if (!slot) throw new Error(`Casella ${prefisso} non trovata in ${modulo}: ${mod.slot.map((s) => s.id).join(',')}`);
  return { modulo: mod, slot };
}

/* ------------------------------------------------------------------ */
/* La trascrizione                                                     */
/* ------------------------------------------------------------------ */

describe('tabella dei ruoli', () => {
  it('le linee di gioco sono quelle ufficiali', () => {
    const attese: Record<string, string> = {
      Por: 'porta',
      Ds: 'difesa', Dc: 'difesa', Dd: 'difesa', B: 'difesa',
      E: 'centrocampo', M: 'centrocampo', C: 'centrocampo',
      W: 'trequarti', T: 'trequarti',
      A: 'attacco', Pc: 'attacco',
    };
    for (const ruolo of RUOLI_MANTRA) {
      strictEqual(lineaDi(configurazione, ruolo), attese[ruolo], ruolo);
    }
  });

  it('gli stampi sono quelli ufficiali', () => {
    // Cinque di movimento di stampo difensivo e cinque offensivo per schema.
    // Nel centrocampo convivono entrambi: E e M difensivi, C offensivo.
    for (const r of ['Dd', 'Ds', 'Dc', 'B', 'E', 'M'] as RuoloMantra[]) {
      strictEqual(stampoDi(configurazione, r), 'difensivo', r);
    }
    for (const r of ['C', 'T', 'W', 'A', 'Pc'] as RuoloMantra[]) {
      strictEqual(stampoDi(configurazione, r), 'offensivo', r);
    }
  });
});

describe('tabella delle sostituzioni', () => {
  it('e’ completa: dodici righe per dodici colonne', () => {
    const codici = Object.keys(configurazione.codici).filter((k) => !k.startsWith('_'));
    strictEqual(codici.length, 12);
    for (const riga of codici) {
      const voce = configurazione.matrice[riga] as Record<string, string>;
      for (const colonna of codici) ok(voce[colonna], `manca la cella ${riga}/${colonna}`);
    }
  });

  it('rifiuta una matrice incompleta', () => {
    const rotta = {
      ...configurazione,
      matrice: { ...configurazione.matrice, PC: { PC: 'OK' } },
    } as ConfigurazioneMantra;
    throws(() => validaConfigurazioneMantra(rotta), /manca la cella PC\//);
  });

  it('rifiuta una diagonale che non sia OK', () => {
    const rotta = {
      ...configurazione,
      matrice: {
        ...configurazione.matrice,
        C: { ...(configurazione.matrice.C as object), C: '-1' },
      },
    } as ConfigurazioneMantra;
    throws(() => validaConfigurazioneMantra(rotta), /nel proprio posto deve dare OK/);
  });
});

describe('gli undici schemi', () => {
  it('ci sono tutti e hanno undici caselle', () => {
    deepStrictEqual(
      [...MODULI].sort(),
      ['3-4-1-2', '3-4-2-1', '3-4-3', '3-5-1-1', '3-5-2', '4-1-4-1', '4-2-3-1', '4-3-1-2', '4-3-3', '4-4-1-1', '4-4-2'],
    );
    for (const mod of mantra.moduli) {
      strictEqual(mod.slot.length, 11, mod.nome);
      strictEqual(new Set(mod.slot.map((s) => s.id)).size, 11, `${mod.nome}: caselle duplicate`);
    }
  });

  it('il numero di difensori corrisponde al nome dello schema', () => {
    for (const nome of MODULI) {
      const caselle = configurazione.moduli[nome] as string[];
      const difensori = caselle.filter(
        (x) => configurazione.ruoli[x.split('/')[0]!]!.linea === 'difesa',
      ).length;
      strictEqual(difensori, Number(nome.split('-')[0]), `${nome}: difensori`);
    }
  });

  it('ogni schema puo’ arrivare a cinque difensivi e cinque offensivi', () => {
    // Le caselle con ruoli di stampo diverso in alternativa, come M/C, lasciano
    // la scelta al fantallenatore: il vincolo dev'essere raggiungibile, non
    // gia' deciso dallo schema.
    for (const nome of MODULI) {
      const caselle = (configurazione.moduli[nome] as string[]).filter(
        (x) => configurazione.ruoli[x.split('/')[0]!]!.linea !== 'porta',
      );
      let difensivi = 0;
      let offensivi = 0;
      let misti = 0;
      for (const x of caselle) {
        const stampi = new Set(x.split('/').map((p) => configurazione.ruoli[p]!.stampo));
        if (stampi.size > 1) misti++;
        else if (stampi.has('difensivo')) difensivi++;
        else offensivi++;
      }
      ok(difensivi <= 5 && difensivi + misti >= 5, `${nome}: difensivi ${difensivi}, misti ${misti}`);
      ok(offensivi <= 5 && offensivi + misti >= 5, `${nome}: offensivi ${offensivi}, misti ${misti}`);
    }
  });

  it('rifiuta uno schema con un numero di caselle sbagliato', () => {
    const rotta = {
      ...configurazione,
      moduli: { rotto: ['P', 'DC', 'DC'] },
    } as unknown as ConfigurazioneMantra;
    throws(() => validaConfigurazioneMantra(rotta), /3 caselle invece di undici/);
  });
});

/* ------------------------------------------------------------------ */
/* L'interpretazione dell'alfabeto                                     */
/* ------------------------------------------------------------------ */

describe('celle semplici della tabella', () => {
  it('OK: il ruolo nella propria casella non costa nulla', () => {
    const { modulo, slot } = casella('4-4-2', 'DC');
    deepStrictEqual(mantra.valuta(m('x', ['Dc'], 'D'), slot, modulo), { ammesso: true, costo: 0 });
  });

  it('-1: un difensore copre la punta col malus (riga PC, colonna DC)', () => {
    // E' il caso citato dal regolamento: il difensore che in estrema ratio
    // sostituisce l'attaccante.
    const { modulo, slot } = casella('4-4-2', 'APC');
    const esito = mantra.valuta(m('x', ['Dc'], 'D'), slot, modulo);
    strictEqual(esito.ammesso, true);
    strictEqual(esito.costo, configurazione.costi.adattamento);
  });

  it('NO: una punta non copre il difensore (riga DC, colonna PC)', () => {
    const { modulo, slot } = casella('4-4-2', 'DC');
    strictEqual(mantra.valuta(m('x', ['Pc'], 'A'), slot, modulo).ammesso, false);
  });

  it('OK fuori dalla diagonale: un centrale copre il braccetto (riga B, colonna DC)', () => {
    // Nella casella DC/B del 3-5-2 il centrale e' gia' nativo; la cella
    // interessante e' che B e DC si coprono a vicenda senza malus.
    strictEqual((configurazione.matrice.B as Record<string, string>).DC, 'OK');
    const { modulo, slot } = casella('3-5-2', 'DCB');
    strictEqual(mantra.valuta(m('x', ['Dc'], 'D'), slot, modulo).costo, 0);
    strictEqual(mantra.valuta(m('y', ['B'], 'D'), slot, modulo).costo, 0);
  });

  it('il portiere non esce dalla porta e nessuno ci entra', () => {
    const porta = casella('4-4-2', 'P');
    strictEqual(mantra.valuta(m('p', ['Por'], 'P'), porta.slot, porta.modulo).costo, 0);
    for (const ruolo of ['Dc', 'C', 'Pc'] as RuoloMantra[]) {
      strictEqual(mantra.valuta(m('x', [ruolo]), porta.slot, porta.modulo).ammesso, false, ruolo);
    }
    for (const [modulo, prefisso] of [['4-4-2', 'DC'], ['4-4-2', 'C'], ['4-4-2', 'APC']] as const) {
      const altrove = casella(modulo, prefisso);
      strictEqual(
        mantra.valuta(m('p', ['Por'], 'P'), altrove.slot, altrove.modulo).ammesso,
        false,
        `il portiere non deve poter giocare in ${prefisso}`,
      );
    }
  });
});

describe('i simboli che dipendono dallo schema', () => {
  it('ruoli in alternativa nella casella: entrambi senza malus', () => {
    // Nel 4-4-2 la casella E/W accoglie sia l'esterno basso sia l'ala.
    const { modulo, slot } = casella('4-4-2', 'EW');
    strictEqual(mantra.valuta(m('e', ['E']), slot, modulo).costo, 0);
    strictEqual(mantra.valuta(m('w', ['W']), slot, modulo).costo, 0);
  });

  it('* fuori alternativa e’ un divieto (riga C, colonna T)', () => {
    strictEqual((configurazione.matrice.C as Record<string, string>).T, '*');
    // Nel 4-1-4-1 esiste una casella C/T: li' il trequartista e' al suo posto.
    const inAlternativa = casella('4-1-4-1', 'CT');
    strictEqual(mantra.valuta(m('t', ['T']), inAlternativa.slot, inAlternativa.modulo).costo, 0);
    // Nel 4-4-2 la casella C e' pura: li' il trequartista non entra.
    const pura = casella('4-4-2', 'C');
    strictEqual(mantra.valuta(m('t', ['T']), pura.slot, pura.modulo).ammesso, false);
  });

  it('** fuori alternativa e’ un malus (riga C, colonna M)', () => {
    strictEqual((configurazione.matrice.C as Record<string, string>).M, '**');
    const inAlternativa = casella('4-4-2', 'MC');
    strictEqual(mantra.valuta(m('x', ['M']), inAlternativa.slot, inAlternativa.modulo).costo, 0);
    const pura = casella('4-4-2', 'C');
    const esito = mantra.valuta(m('x', ['M']), pura.slot, pura.modulo);
    strictEqual(esito.ammesso, true);
    strictEqual(esito.costo, configurazione.costi.adattamento);
  });

  it('*** vale come ** ma il 4-1-4-1 lo vieta (righe W e T)', () => {
    strictEqual((configurazione.matrice.W as Record<string, string>).T, '***');
    strictEqual((configurazione.matrice.T as Record<string, string>).W, '***');

    // Nel 4-1-4-1 la casella W e' pura e il trequartista non entra.
    const nel41 = casella('4-1-4-1', 'W');
    strictEqual(mantra.valuta(m('t', ['T']), nel41.slot, nel41.modulo).ammesso, false);

    // Nel 4-2-3-1 la casella T e' pura: l'ala entra col malus.
    const altrove = casella('4-2-3-1', 'T');
    const esito = mantra.valuta(m('w', ['W']), altrove.slot, altrove.modulo);
    strictEqual(esito.ammesso, true);
    strictEqual(esito.costo, configurazione.costi.adattamento);
  });

  it('la casella in alternativa vale la riga piu’ generosa', () => {
    // W/T nel 4-2-3-1: chi non e' ne' ala ne' trequartista entra col migliore
    // dei due trattamenti previsti dalla tabella.
    const { modulo, slot } = casella('4-2-3-1', 'WT');
    const conC = mantra.valuta(m('c', ['C']), slot, modulo);
    // riga W colonna C = -1, riga T colonna C = ** -> fuori alternativa vale -1
    strictEqual(conC.ammesso, true);
    strictEqual(conC.costo, configurazione.costi.adattamento);
  });

  it('chi ha due ruoli entra col migliore dei suoi', () => {
    const { modulo, slot } = casella('4-2-3-1', 'T');
    strictEqual(mantra.valuta(m('x', ['W', 'T']), slot, modulo).costo, 0);
    strictEqual(mantra.valuta(m('y', ['T', 'W']), slot, modulo).costo, 0);
  });
});

describe('il verso della tabella', () => {
  it('non e’ simmetrica: si copre in avanti, non all’indietro', () => {
    const codici = ['PC', 'A', 'T', 'W', 'C', 'M', 'E', 'B', 'DC', 'DD', 'DS'];
    let asimmetrie = 0;
    for (const a of codici) {
      for (const b of codici) {
        const ab = (configurazione.matrice[a] as Record<string, string>)[b];
        const ba = (configurazione.matrice[b] as Record<string, string>)[a];
        if (ab !== ba) asimmetrie++;
      }
    }
    ok(asimmetrie > 0, 'la tabella risulta simmetrica: la trascrizione e’ sospetta');
  });

  it('un difensore copre ogni linea piu’ avanzata, mai il contrario', () => {
    const avanti: [RuoloMantra, string, string][] = [
      ['Dc', '4-4-2', 'C'],
      ['Dc', '4-4-2', 'APC'],
      ['M', '4-4-2', 'C'],
      ['M', '4-2-3-1', 'T'],
    ];
    for (const [ruolo, modulo, prefisso] of avanti) {
      const { modulo: mod, slot } = casella(modulo, prefisso);
      ok(mantra.valuta(m('x', [ruolo]), slot, mod).ammesso, `${ruolo} verso ${prefisso}`);
    }

    const indietro: [RuoloMantra, string, string][] = [
      ['Pc', '4-4-2', 'DC'],
      ['Pc', '4-4-2', 'C'],
      ['C', '4-4-2', 'DC'],
      ['T', '4-4-2', 'DC'],
    ];
    for (const [ruolo, modulo, prefisso] of indietro) {
      const { modulo: mod, slot } = casella(modulo, prefisso);
      strictEqual(
        mantra.valuta(m('x', [ruolo]), slot, mod).ammesso,
        false,
        `${ruolo} non deve poter coprire ${prefisso}`,
      );
    }
  });
});

/* ------------------------------------------------------------------ */
/* Schieramento                                                        */
/* ------------------------------------------------------------------ */

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

  it('copre almeno qualche schema senza alcun adattamento', () => {
    const copertura = coperturaModuli(rosa, mantra);
    ok(
      copertura.some((c) => c.livello === 'perfetta'),
      `nessuno schema perfetto: ${copertura.map((c) => `${c.modulo}=${c.livello}`).join(' ')}`,
    );
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

  it('non manda un portiere in campo ne’ un giocatore di movimento in porta', () => {
    for (const modulo of mantra.moduli) {
      const d = disponi(rosa, modulo, mantra);
      const perId = new Map(rosa.map((g) => [g.id, g]));
      for (const [slotId, id] of d.titolari) {
        strictEqual(
          perId.get(id)!.ruoliMantra.includes('Por'),
          slotId === 'P',
          `${modulo.nome}: ${id} in ${slotId}`,
        );
      }
    }
  });

  it('la copertura e’ coerente con se stessa', () => {
    for (const c of coperturaModuli(rosa, mantra)) {
      if (c.livello === 'adattata') ok(c.adattamenti > 0, `${c.modulo}: adattata senza adattamenti`);
      if (c.livello === 'perfetta') strictEqual(c.adattamenti, 0, c.modulo);
      if (c.livello === 'impossibile') ok(c.slotScoperti.length > 0, c.modulo);
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
    deepStrictEqual(esito.slotScoperti, ['P']);
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

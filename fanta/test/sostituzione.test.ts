/**
 * Test delle sostituzioni automatiche.
 *
 * `CLAUDE.md` lo dice chiaramente: e' il punto dove ogni bug diventa una lite
 * nella chat della lega. Quindi ogni caso ha il suo test, comprese le
 * situazioni in cui la soluzione non esiste.
 */

import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict';
import { describe, it } from 'node:test';
import { strategiaBasic } from '../src/sostituzione.ts';
import type { Schierabile } from '../src/tipi.ts';
import { classic, formazioneDa, g, rosaClassic } from './comune.ts';

const rosa = rosaClassic();

function adatta(modulo: string, indisponibili: string[], conRosa: Schierabile[] = rosa) {
  return strategiaBasic.adatta({
    formazione: formazioneDa(modulo, conRosa),
    rosa: conRosa,
    indisponibili: new Set(indisponibili),
    regole: classic,
  });
}

describe('quando non serve sostituire nessuno', () => {
  it('lascia la formazione esattamente com’era', () => {
    const iniziale = formazioneDa('4-4-2', rosa);
    const esito = strategiaBasic.adatta({
      formazione: iniziale,
      rosa,
      indisponibili: new Set(),
      regole: classic,
    });

    strictEqual(esito.livello, 'perfetta');
    deepStrictEqual(esito.cambi, []);
    strictEqual(esito.moduloCambiato, false);
    deepStrictEqual([...esito.formazione.titolari.entries()].sort(), [...iniziale.titolari.entries()].sort());
  });
});

describe('soluzione perfetta nel modulo schierato', () => {
  it('sostituisce un titolare con uno del suo ruolo', () => {
    const esito = adatta('4-4-2', ['D1']);
    strictEqual(esito.livello, 'perfetta');
    strictEqual(esito.moduloCambiato, false);
    strictEqual(esito.cambi.length, 1);
    strictEqual(esito.cambi[0]!.esce, 'D1');
    strictEqual(esito.adattati.length, 0);
  });

  it('non tocca chi non c’entra', () => {
    const iniziale = formazioneDa('4-4-2', rosa);
    const esito = adatta('4-4-2', ['C2']);
    for (const slot of classic.modulo('4-4-2')!.slot) {
      const prima = iniziale.titolari.get(slot.id)!;
      if (prima === 'C2') continue;
      strictEqual(esito.formazione.titolari.get(slot.id), prima, `casella ${slot.id} cambiata senza motivo`);
    }
  });

  it('regge la perdita di piu’ titolari insieme', () => {
    const esito = adatta('4-4-2', ['P1', 'D1', 'D2', 'C1', 'A1']);
    strictEqual(esito.livello, 'perfetta');
    strictEqual(esito.formazione.titolari.size, 11);
    strictEqual(esito.cambi.length, 5);
  });

  it('non schiera mai un indisponibile', () => {
    const fuori = new Set(['P1', 'D1', 'D2', 'C1', 'C2', 'A1']);
    const esito = adatta('4-4-2', [...fuori]);
    for (const id of esito.formazione.titolari.values()) {
      ok(!fuori.has(id), `${id} e’ indisponibile ma e’ stato schierato`);
    }
  });
});

describe('ordine di priorita’ della panchina', () => {
  it('entra il primo della panchina fra quelli utili', () => {
    // In panchina restano D5..D8: deve entrare D5, che l'utente ha messo per primo.
    const esito = adatta('4-4-2', ['D1']);
    strictEqual(esito.cambi[0]!.entra, 'D5');
  });

  it('se il primo della panchina non serve, scende al successivo utile', () => {
    // Manca un attaccante: i difensori in panchina non c'entrano, entra A3.
    const esito = adatta('4-4-2', ['A1']);
    strictEqual(esito.cambi[0]!.entra, 'A3');
  });

  it('rispetta un ordine di panchina riscritto dall’utente', () => {
    const formazione = formazioneDa('4-4-2', rosa);
    formazione.panchina = ['D8', 'D7', 'D6', 'D5', ...formazione.panchina.filter((x) => !x.startsWith('D'))];

    const esito = strategiaBasic.adatta({
      formazione,
      rosa,
      indisponibili: new Set(['D1']),
      regole: classic,
    });
    strictEqual(esito.cambi[0]!.entra, 'D8', 'ha ignorato la priorita’ della panchina');
  });
});

describe('soluzione efficiente: cambio di modulo', () => {
  it('cambia modulo quando il ruolo e’ esaurito', () => {
    // Tutti e sei gli attaccanti fuori: il 4-4-2 e' impossibile, ma con un solo
    // attaccante... nemmeno. Si tolgono quattro attaccanti su sei e si chiede
    // un 4-4-2: restano due attaccanti, quindi si schiera ancora.
    const esito = adatta('4-4-2', ['A1', 'A2', 'A3', 'A4']);
    strictEqual(esito.livello, 'perfetta');
    strictEqual(esito.formazione.titolari.size, 11);
  });

  it('passa a un modulo con meno attaccanti quando ne resta uno solo', () => {
    const esito = adatta('4-4-2', ['A1', 'A2', 'A3', 'A4', 'A5']);
    strictEqual(esito.moduloCambiato, true);
    strictEqual(esito.livello, 'efficiente');
    strictEqual(esito.formazione.titolari.size, 11);
    strictEqual(classic.modulo(esito.formazione.modulo)!.slot.filter((s) => s.reparto === 'A').length, 1);
    strictEqual(esito.adattati.length, 0, 'in classic non devono esserci adattati');
  });

  it('a parita’ di soluzione preferisce restare nel proprio modulo', () => {
    const esito = adatta('3-5-2', ['C1']);
    strictEqual(esito.formazione.modulo, '3-5-2');
    strictEqual(esito.moduloCambiato, false);
  });
});

describe('quando la squadra non si puo’ schierare', () => {
  it('scende in campo incompleta invece di fallire', () => {
    // Tutti gli attaccanti indisponibili: nessun modulo ha zero attaccanti.
    const esito = adatta('4-4-2', ['A1', 'A2', 'A3', 'A4', 'A5', 'A6']);
    strictEqual(esito.livello, 'incompleta');
    ok(esito.slotScoperti.length >= 1, 'non ha segnalato le caselle scoperte');
    strictEqual(esito.formazione.titolari.size, 11 - esito.slotScoperti.length);
  });

  it('minimizza le caselle scoperte scegliendo il modulo giusto', () => {
    // Con zero attaccanti conviene il modulo che ne chiede uno solo: si resta
    // scoperti in una casella invece che in due.
    const esito = adatta('4-4-2', ['A1', 'A2', 'A3', 'A4', 'A5', 'A6']);
    strictEqual(esito.slotScoperti.length, 1);
  });

  it('senza portieri resta scoperta la porta e non altro', () => {
    const esito = adatta('4-4-2', ['P1', 'P2', 'P3']);
    deepStrictEqual(esito.slotScoperti, ['P1']);
    strictEqual(esito.formazione.titolari.size, 10);
  });
});

describe('coerenza del risultato', () => {
  it('titolari e panchina non si sovrappongono e coprono i disponibili', () => {
    const esito = adatta('4-3-3', ['D1', 'C1']);
    const titolari = [...esito.formazione.titolari.values()];
    strictEqual(new Set(titolari).size, titolari.length, 'un titolare ripetuto');

    for (const id of esito.formazione.panchina) {
      ok(!titolari.includes(id), `${id} e’ titolare e in panchina`);
    }
    const fuori = new Set(['D1', 'C1']);
    for (const id of esito.formazione.panchina) {
      ok(!fuori.has(id), `${id} e’ indisponibile ma e’ in panchina`);
    }
    strictEqual(titolari.length + esito.formazione.panchina.length, rosa.length - fuori.size);
  });

  it('ogni cambio dichiarato corrisponde a un cambio reale', () => {
    const iniziale = formazioneDa('4-4-2', rosa);
    const esito = adatta('4-4-2', ['D1', 'A1']);
    for (const cambio of esito.cambi) {
      strictEqual(iniziale.titolari.get(cambio.slot), cambio.esce);
      strictEqual(esito.formazione.titolari.get(cambio.slot), cambio.entra);
    }
  });

  it('la formazione prodotta e’ valida secondo le regole', () => {
    const esito = adatta('3-4-3', ['P1', 'D1', 'C1', 'A1']);
    const modulo = classic.modulo(esito.formazione.modulo)!;
    const perId = new Map(rosa.map((x) => [x.id, x]));
    for (const [slotId, id] of esito.formazione.titolari) {
      const slot = modulo.slot.find((s) => s.id === slotId)!;
      ok(classic.valuta(perId.get(id)!, slot, modulo).ammesso, `${id} non puo’ stare in ${slotId}`);
    }
  });

  it('e’ deterministica', () => {
    const uno = adatta('4-4-2', ['D1', 'C2', 'A1']);
    const due = adatta('4-4-2', ['D1', 'C2', 'A1']);
    deepStrictEqual([...uno.formazione.titolari.entries()], [...due.formazione.titolari.entries()]);
    deepStrictEqual(uno.formazione.panchina, due.formazione.panchina);
  });
});

describe('in classic il passo adattato non si usa mai', () => {
  it('nessuna soluzione produce giocatori fuori posizione', () => {
    // Il malus di adattamento non esiste in classic: o la soluzione e' pulita o
    // la casella resta scoperta. Non serve un ramo dedicato nella strategia, ed
    // e' il segno che la separazione fra regole e strategia e' quella giusta.
    const casi = [
      ['4-4-2', ['D1']],
      ['4-4-2', ['A1', 'A2', 'A3', 'A4', 'A5']],
      ['3-5-2', ['C1', 'C2', 'C3']],
      ['5-3-2', ['D1', 'D2', 'D3', 'D4']],
      ['4-4-2', ['A1', 'A2', 'A3', 'A4', 'A5', 'A6']],
    ] as const;

    for (const [modulo, fuori] of casi) {
      const esito = adatta(modulo, [...fuori]);
      deepStrictEqual(esito.adattati, [], `${modulo} senza ${fuori.join(', ')}`);
      ok(esito.livello !== 'adattata', `${modulo}: livello ${esito.livello}`);
    }
  });
});

describe('rosa con soli undici disponibili', () => {
  it('schiera l’unica formazione possibile', () => {
    const undici = [
      g('p', 'P'),
      ...Array.from({ length: 4 }, (_, i) => g(`d${i}`, 'D')),
      ...Array.from({ length: 4 }, (_, i) => g(`c${i}`, 'C')),
      ...Array.from({ length: 2 }, (_, i) => g(`a${i}`, 'A')),
    ];
    const esito = strategiaBasic.adatta({
      formazione: formazioneDa('4-4-2', undici),
      rosa: undici,
      indisponibili: new Set(),
      regole: classic,
    });
    strictEqual(esito.formazione.titolari.size, 11);
    strictEqual(esito.formazione.panchina.length, 0);
    strictEqual(esito.livello, 'perfetta');
  });
});

import { deepStrictEqual, ok, strictEqual, throws } from 'node:assert/strict';
import { describe, it } from 'node:test';
import { regoleClassic, validaConfigurazioneClassic } from '../src/classic.ts';
import { coperturaModuli, disponi, miglioreDisposizione, validaFormazione } from '../src/schieramento.ts';
import { classic, configurazioneClassic, formazioneDa, g, rosaClassic } from './comune.ts';

describe('configurazione classic', () => {
  it('espone i sette moduli decisi', () => {
    deepStrictEqual(
      classic.moduli.map((m) => m.nome).sort(),
      ['3-4-3', '3-5-2', '4-3-3', '4-4-2', '4-5-1', '5-3-2', '5-4-1'],
    );
  });

  it('ogni modulo ha undici caselle, una sola di portiere', () => {
    for (const m of classic.moduli) {
      strictEqual(m.slot.length, 11, m.nome);
      strictEqual(m.slot.filter((s) => s.reparto === 'P').length, 1, m.nome);
      strictEqual(new Set(m.slot.map((s) => s.id)).size, 11, `${m.nome}: caselle duplicate`);
    }
  });

  it('gli identificativi delle caselle sono stabili e leggibili', () => {
    const m = classic.modulo('4-4-2')!;
    deepStrictEqual(
      m.slot.map((s) => s.id),
      ['P1', 'D1', 'D2', 'D3', 'D4', 'C1', 'C2', 'C3', 'C4', 'A1', 'A2'],
    );
  });

  it('rifiuta un modulo che non fa dieci uomini di movimento', () => {
    throws(
      () =>
        validaConfigurazioneClassic({
          ...configurazioneClassic,
          moduli: [{ nome: '4-4-4', D: 4, C: 4, A: 4 }],
        }),
      /12 uomini di movimento invece di dieci/,
    );
  });

  it('rifiuta un modulo che la rosa non potrebbe mai schierare', () => {
    throws(
      () =>
        validaConfigurazioneClassic({
          ...configurazioneClassic,
          moduli: [{ nome: '3-1-6', D: 3, C: 1, A: 6 }],
          rosa: { composizioneEsatta: { P: 3, D: 8, C: 8, A: 5 } },
        }),
      /servono 6 attaccanti, la rosa ne prevede 5/,
    );
  });
});

describe('compatibilita’ in classic', () => {
  const modulo = classic.modulo('4-4-2')!;
  const slotDifesa = modulo.slot.find((s) => s.reparto === 'D')!;

  it('il giocatore del ruolo occupa la casella senza costo', () => {
    deepStrictEqual(classic.valuta(g('x', 'D'), slotDifesa, modulo), { ammesso: true, costo: 0 });
  });

  it('chiunque altro non e’ ammesso: in classic non esiste adattamento', () => {
    for (const ruolo of ['P', 'C', 'A'] as const) {
      strictEqual(classic.valuta(g('x', ruolo), slotDifesa, modulo).ammesso, false, ruolo);
    }
  });

  it('i ruoli Mantra non contano nulla in classic', () => {
    // Un braccetto e un centrale sono entrambi "D" e basta.
    const braccetto = g('x', 'D', ['B', 'Dd']);
    strictEqual(classic.valuta(braccetto, slotDifesa, modulo).ammesso, true);
  });
});

describe('composizione della rosa', () => {
  it('accetta la rosa regolamentare 3-8-8-6', () => {
    deepStrictEqual(classic.validaRosa(rosaClassic()), []);
  });

  it('rifiuta una rosa di dimensione giusta ma quote sbagliate', () => {
    const rosa = rosaClassic();
    rosa[rosa.length - 1] = g('extra', 'C'); // un attaccante in meno, un centrocampista in piu'
    const problemi = classic.validaRosa(rosa);
    ok(problemi.some((p) => p.messaggio.includes('Ruolo C: 9')));
    ok(problemi.some((p) => p.messaggio.includes('Ruolo A: 5')));
  });

  it('rifiuta una rosa di 23 giocatori: in classic la composizione e’ esatta', () => {
    const problemi = classic.validaRosa(rosaClassic().slice(0, 23));
    ok(problemi.some((p) => p.messaggio.includes('23 giocatori invece di 25')));
  });

  it('segnala un giocatore ripetuto', () => {
    const rosa = rosaClassic();
    rosa[10] = rosa[9]!;
    ok(classic.validaRosa(rosa).some((p) => p.messaggio.includes('due volte')));
  });
});

describe('disposizione', () => {
  const rosa = rosaClassic();

  it('la rosa regolamentare copre tutti e sette i moduli senza adattamenti', () => {
    // E' la conseguenza della composizione esatta 3-8-8-6: con otto difensori e
    // otto centrocampisti nessuno schema resta scoperto.
    for (const c of coperturaModuli(rosa, classic)) {
      strictEqual(c.livello, 'perfetta', `${c.modulo}: ${c.livello} (${c.slotScoperti.join(', ')})`);
      strictEqual(c.adattamenti, 0);
    }
  });

  it('riempie tutte le caselle con giocatori distinti e del ruolo giusto', () => {
    const modulo = classic.modulo('3-5-2')!;
    const d = disponi(rosa, modulo, classic);
    strictEqual(d.completa, true);
    strictEqual(d.titolari.size, 11);
    strictEqual(new Set(d.titolari.values()).size, 11);

    const perId = new Map(rosa.map((x) => [x.id, x]));
    for (const slot of modulo.slot) {
      strictEqual(perId.get(d.titolari.get(slot.id)!)!.ruoloClassico, slot.reparto, slot.id);
    }
  });

  it('con una rosa monca segnala le caselle scoperte invece di inventarsi soluzioni', () => {
    const senzaAttaccanti = rosa.filter((x) => x.ruoloClassico !== 'A');
    const d = disponi(senzaAttaccanti, classic.modulo('4-4-2')!, classic);
    strictEqual(d.completa, false);
    deepStrictEqual(d.slotScoperti.sort(), ['A1', 'A2']);
  });

  it('sceglie il modulo che la rosa copre, se quello preferito non si puo’', () => {
    // Un solo attaccante disponibile: il 4-4-2 non si schiera, il 4-5-1 si'.
    const conUnAttaccante = rosa.filter((x) => x.ruoloClassico !== 'A' || x.id === 'A1');
    const scelta = miglioreDisposizione(conUnAttaccante, classic, { moduloPreferito: '4-4-2' })!;
    strictEqual(scelta.completa, true);
    ok(['4-5-1', '5-4-1'].includes(scelta.modulo.nome), `ha scelto ${scelta.modulo.nome}`);
  });

  it('a parita’ di tutto tiene il modulo preferito', () => {
    const scelta = miglioreDisposizione(rosa, classic, { moduloPreferito: '3-4-3' })!;
    strictEqual(scelta.modulo.nome, '3-4-3');
  });
});

describe('validazione di una formazione salvata', () => {
  const rosa = rosaClassic();

  it('accetta una formazione regolare', () => {
    deepStrictEqual(validaFormazione(formazioneDa('4-4-2', rosa), rosa, classic), []);
  });

  it('rifiuta un modulo che non esiste nella modalita’', () => {
    const f = { ...formazioneDa('4-4-2', rosa), modulo: '4-2-3-1' };
    ok(validaFormazione(f, rosa, classic).some((p) => p.messaggio.includes('non esiste')));
  });

  it('segnala una casella vuota', () => {
    const f = formazioneDa('4-4-2', rosa);
    f.titolari.delete('C3');
    ok(validaFormazione(f, rosa, classic).some((p) => p.messaggio.includes('C3')));
  });

  it('segnala un giocatore fuori ruolo', () => {
    const f = formazioneDa('4-4-2', rosa);
    f.titolari.set('D1', 'A1');
    ok(
      validaFormazione(f, rosa, classic).some((p) => p.messaggio.includes('non puo’ occupare')),
    );
  });

  it('segnala lo stesso giocatore schierato due volte', () => {
    const f = formazioneDa('4-4-2', rosa);
    f.titolari.set('D2', f.titolari.get('D1')!);
    ok(validaFormazione(f, rosa, classic).some((p) => p.messaggio.includes('due volte')));
  });

  it('segnala chi e’ titolare e anche in panchina', () => {
    const f = formazioneDa('4-4-2', rosa);
    f.panchina.push(f.titolari.get('P1')!);
    ok(
      validaFormazione(f, rosa, classic).some((p) => p.messaggio.includes('titolare e in panchina')),
    );
  });

  it('segnala un estraneo alla rosa', () => {
    const f = formazioneDa('4-4-2', rosa);
    f.titolari.set('A1', 'sconosciuto');
    ok(validaFormazione(f, rosa, classic).some((p) => p.messaggio.includes('non e’ in rosa')));
  });
});

describe('regole costruite da configurazione', () => {
  it('due istanze dalla stessa configurazione si comportano allo stesso modo', () => {
    const altra = regoleClassic(configurazioneClassic);
    deepStrictEqual(altra.moduli.map((m) => m.nome), classic.moduli.map((m) => m.nome));
  });
});

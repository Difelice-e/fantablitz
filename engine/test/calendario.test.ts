import { deepStrictEqual, ok, strictEqual, throws } from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { caricaMondo, type Mondo } from '../src/mondo.ts';
import { generaCalendario, partiteDi } from '../src/calendario.ts';

const mondo: Mondo = caricaMondo(
  JSON.parse(readFileSync(fileURLToPath(new URL('../../seed/out/mondo.json', import.meta.url)), 'utf8')),
);

const calendario = generaCalendario(mondo, { seme: 'lega-di-prova' });

describe('struttura del calendario', () => {
  it('genera 38 giornate da 10 partite', () => {
    strictEqual(calendario.giornate.length, 38);
    for (const g of calendario.giornate) {
      strictEqual(g.partite.length, 10, `giornata ${g.numero}`);
    }
  });

  it('numera le giornate da 1 a 38 senza salti', () => {
    deepStrictEqual(
      calendario.giornate.map((g) => g.numero),
      Array.from({ length: 38 }, (_, i) => i + 1),
    );
  });

  it('ogni club gioca una volta sola per giornata', () => {
    for (const g of calendario.giornate) {
      const impegnati = g.partite.flatMap((p) => [p.casaId, p.ospiteId]);
      strictEqual(new Set(impegnati).size, 20, `giornata ${g.numero}: qualcuno gioca due volte`);
    }
  });

  it('nessuno gioca contro se stesso', () => {
    for (const g of calendario.giornate) {
      for (const p of g.partite) ok(p.casaId !== p.ospiteId, `giornata ${g.numero}`);
    }
  });
});

describe('equita’ del calendario', () => {
  it('ogni club gioca 38 partite, 19 in casa e 19 fuori', () => {
    for (const c of mondo.club) {
      const sue = partiteDi(calendario, c.id);
      strictEqual(sue.length, 38, c.nome);
      strictEqual(sue.filter((s) => s.partita.casaId === c.id).length, 19, `${c.nome}: partite in casa`);
    }
  });

  it('ogni coppia si affronta esattamente due volte, una per campo', () => {
    const incontri = new Map<string, number>();
    for (const g of calendario.giornate) {
      for (const p of g.partite) {
        const ordinata = [p.casaId, p.ospiteId].sort().join('|');
        incontri.set(ordinata, (incontri.get(ordinata) ?? 0) + 1);
        // Il verso preciso: casa->ospite deve capitare una volta sola.
        const diretto = `${p.casaId}>${p.ospiteId}`;
        incontri.set(diretto, (incontri.get(diretto) ?? 0) + 1);
      }
    }

    for (const a of mondo.club) {
      for (const b of mondo.club) {
        if (a.id === b.id) continue;
        strictEqual(
          incontri.get([a.id, b.id].sort().join('|')),
          2,
          `${a.nome} e ${b.nome} non si affrontano due volte`,
        );
        strictEqual(incontri.get(`${a.id}>${b.id}`), 1, `${a.nome} non ospita ${b.nome} una volta sola`);
      }
    }
  });

  it('nessuno gioca piu’ di tre partite di fila sullo stesso campo', () => {
    // Una raffica lunga sarebbe un vantaggio o uno svantaggio ingiustificato.
    for (const c of mondo.club) {
      let massimo = 1;
      let corrente = 1;
      const sue = partiteDi(calendario, c.id);
      for (let i = 1; i < sue.length; i++) {
        const prima = sue[i - 1]!.partita.casaId === c.id;
        const adesso = sue[i]!.partita.casaId === c.id;
        corrente = prima === adesso ? corrente + 1 : 1;
        massimo = Math.max(massimo, corrente);
      }
      ok(massimo <= 3, `${c.nome}: ${massimo} partite di fila sullo stesso campo`);
    }
  });
});

describe('turni infrasettimanali e di coppa', () => {
  it('produce il numero di turni infrasettimanali richiesto', () => {
    const quanti = calendario.giornate.filter((g) => g.infrasettimanale).length;
    ok(quanti >= 3 && quanti <= 4, `attesi 3-4 turni infrasettimanali, trovati ${quanti}`);
  });

  it('non mette il primo turno infrasettimanale alla prima giornata', () => {
    // Alla prima giornata nessuno ha ancora consumato condizione: un turno
    // infrasettimanale li' non avrebbe nessun effetto sulle rotazioni.
    ok(!calendario.giornate[0]!.infrasettimanale);
  });

  it('distribuisce i turni infrasettimanali invece di ammassarli', () => {
    const numeri = calendario.giornate.filter((g) => g.infrasettimanale).map((g) => g.numero);
    for (let i = 1; i < numeri.length; i++) {
      ok(numeri[i]! - numeri[i - 1]! >= 4, `turni troppo vicini: ${numeri.join(', ')}`);
    }
  });

  it('accetta di non avere turni infrasettimanali ne’ di coppa', () => {
    const piatto = generaCalendario(mondo, {
      seme: 'lega-di-prova',
      giornateInfrasettimanali: 0,
      turniDiCoppa: 0,
    });
    strictEqual(piatto.giornate.filter((g) => g.infrasettimanale).length, 0);
    strictEqual(piatto.giornate.filter((g) => g.turnoDiCoppa).length, 0);
  });
});

describe('determinismo', () => {
  it('stesso seme, stesso calendario', () => {
    strictEqual(
      JSON.stringify(generaCalendario(mondo, { seme: 'uguale' })),
      JSON.stringify(generaCalendario(mondo, { seme: 'uguale' })),
    );
  });

  it('semi diversi, calendari diversi', () => {
    // Due leghe sullo stesso mondo non devono vivere la stessa stagione.
    ok(
      JSON.stringify(generaCalendario(mondo, { seme: 'lega-a' })) !==
        JSON.stringify(generaCalendario(mondo, { seme: 'lega-b' })),
    );
  });
});

describe('errori', () => {
  it('rifiuta un numero dispari di squadre', () => {
    const dispari: Mondo = { ...mondo, club: mondo.club.slice(0, 19) };
    throws(() => generaCalendario(dispari, { seme: 'x' }), /numero pari di squadre/);
  });
});

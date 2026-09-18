/**
 * Test di distribuzione sulle metriche calibrate.
 *
 * `CLAUDE.md` chiede esplicitamente questi, non solo unit test sulle funzioni:
 * il motore puo' avere tutte le funzioni corrette e produrre lo stesso un
 * campionato in cui si segnano cinque gol a partita.
 *
 * Qui si simulano poche stagioni con bande piu' larghe di quelle dello script
 * di calibrazione: servono ad accorgersi di una regressione grossa a ogni
 * `npm test`, non a tarare. La taratura fine resta compito di
 * `npm run calibra`, che gira su centinaia di stagioni.
 */

import { ok } from 'node:assert/strict';
import { describe, it } from 'node:test';
import { simulaStagione } from '../src/stagione.ts';
import { gruppoDi, GRUPPI_RUOLO, type GruppoRuolo } from '../src/ruoli.ts';
import { mondo, motore, voto } from './comune.ts';

const STAGIONI = 6;

const stagioni = Array.from({ length: STAGIONI }, (_, i) =>
  simulaStagione(mondo, motore, voto, { seme: `distribuzione-${i}` }),
);
const partite = stagioni.flatMap((s) => s.partite);
const prestazioni = partite.flatMap((p) => p.prestazioni);
const voti = prestazioni.map((p) => p.voto).filter((v): v is number => v !== null);

const media = (v: readonly number[]): number => v.reduce((a, b) => a + b, 0) / v.length;
const deviazione = (v: readonly number[]): number => {
  const m = media(v);
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length);
};
const quota = (v: readonly number[], test: (x: number) => boolean): number =>
  v.filter(test).length / v.length;

/** Fra `min` e `max`, con il valore trovato nel messaggio d'errore. */
function dentro(valore: number, min: number, max: number, cosa: string): void {
  ok(valore >= min && valore <= max, `${cosa}: ${valore.toFixed(3)}, atteso fra ${min} e ${max}`);
}

describe('gol e risultati', () => {
  it('la media gol a partita e’ da campionato italiano', () => {
    const gol = media(partite.map((p) => p.golCasa + p.golOspite));
    dentro(gol, 2.3, 3.1, 'gol a partita');
  });

  it('giocare in casa conta, ma non decide', () => {
    dentro(quota(partite.map((p) => p.golCasa - p.golOspite), (d) => d > 0), 0.38, 0.5, 'vittorie in casa');
    dentro(quota(partite.map((p) => p.golCasa - p.golOspite), (d) => d === 0), 0.19, 0.32, 'pareggi');
  });

  it('i risultati assurdi restano rari', () => {
    const goleade = quota(partite.map((p) => Math.abs(p.golCasa - p.golOspite)), (d) => d >= 5);
    ok(goleade < 0.03, `troppe goleade da cinque gol di scarto: ${goleade.toFixed(3)}`);
  });
});

describe('distribuzione dei voti', () => {
  it('la media e’ intorno al sei', () => {
    dentro(media(voti), 5.85, 6.15, 'media dei voti');
  });

  it('la forbice e’ quella delle pagelle', () => {
    dentro(deviazione(voti), 0.55, 0.78, 'deviazione standard dei voti');
  });

  it('i voti alti e i voti bassi restano rari', () => {
    dentro(quota(voti, (v) => v >= 8), 0.005, 0.03, 'quota di voti >= 8');
    dentro(quota(voti, (v) => v <= 4.5), 0.01, 0.045, 'quota di voti <= 4.5');
  });

  it('nessun voto esce dai limiti', () => {
    ok(voti.every((v) => v >= voto.minimo && v <= voto.massimo), 'voto fuori dai limiti');
  });

  it('nessun ruolo ha una varianza sistematicamente piu’ bassa degli altri', () => {
    // SPEC 5.6 lo segnala come rischio, coi portieri come indiziato numero uno:
    // se il portiere prende sempre 6 il ruolo diventa irrilevante all'asta.
    const perGruppo = new Map<GruppoRuolo, number[]>(GRUPPI_RUOLO.map((g) => [g, []]));
    for (const p of prestazioni) {
      if (p.voto === null) continue;
      const g = mondo.giocatorePerId.get(p.giocatoreId);
      if (g) perGruppo.get(gruppoDi(g))!.push(p.voto);
    }

    const deviazioni = GRUPPI_RUOLO.map((g) => deviazione(perGruppo.get(g)!));
    const rapporto = Math.min(...deviazioni) / Math.max(...deviazioni);
    ok(
      rapporto >= 0.7,
      `varianza squilibrata fra i ruoli (${rapporto.toFixed(2)}): ` +
        GRUPPI_RUOLO.map((g, i) => `${g} ${deviazioni[i]!.toFixed(2)}`).join(', '),
    );
  });
});

describe('disciplina e infortuni', () => {
  it('i cartellini sono quelli di un campionato vero', () => {
    dentro(prestazioni.filter((p) => p.ammonito).length / partite.length, 3.5, 6.0, 'ammonizioni a partita');
    dentro(prestazioni.filter((p) => p.espulso).length / partite.length, 0.1, 0.45, 'espulsioni a partita');
  });

  it('gli infortuni ci sono e non sono un’epidemia', () => {
    const infortuni = partite.flatMap((p) => p.eventi.filter((e) => e.tipo === 'infortunio')).length;
    dentro(infortuni / partite.length, 0.3, 1.6, 'infortuni a partita');
  });
});

describe('minuti e rotazioni', () => {
  it('ogni squadra manda in campo undici uomini per partita', () => {
    for (const p of partite.slice(0, 200)) {
      const perClub = new Map<string, number>();
      for (const pr of p.prestazioni) {
        if (pr.minuti > 0) perClub.set(pr.clubId, (perClub.get(pr.clubId) ?? 0) + pr.minuti);
      }
      for (const [clubId, minuti] of perClub) {
        ok(minuti === 11 * 90, `giornata ${p.giornata}, ${clubId}: ${minuti} minuti invece di 990`);
      }
    }
  });

  it('i turni infrasettimanali e le coppe producono rotazione', () => {
    // Se tutti giocassero sempre, la condizione non servirebbe a niente e i
    // turni infrasettimanali sarebbero decorativi.
    const usati = mondo.club.map((c) => {
      const rosa = mondo.rosaPerClub.get(c.id) ?? [];
      return rosa.filter((g) => (stagioni[0]!.stati.giocatori.get(g.id)?.minutiStagione ?? 0) > 0).length;
    });
    dentro(media(usati), 18, 32, 'giocatori usati per squadra in una stagione');
  });

  it('gli impegni europei fanno ruotare chi li ha', () => {
    // Il confronto e' fra gli **stessi** club con e senza turni di coppa, non
    // fra club europei e non europei: quelli europei sono anche i piu' forti, e
    // le squadre forti concentrano i minuti perche' hanno un divario netto fra
    // undici e panchina. Confrontandoli con gli altri si misurerebbe la forza
    // delle rose, non l'effetto delle coppe.
    const concentrazione = (stagione: (typeof stagioni)[number], clubId: string): number => {
      const rosa = mondo.rosaPerClub.get(clubId) ?? [];
      const minuti = rosa
        .map((g) => stagione.stati.giocatori.get(g.id)?.minutiStagione ?? 0)
        .sort((a, b) => b - a);
      const totale = minuti.reduce((a, b) => a + b, 0);
      // Quota dei minuti giocata dagli undici piu' impiegati: piu' e' bassa,
      // piu' la squadra ha ruotato.
      return totale === 0 ? 1 : minuti.slice(0, 11).reduce((a, b) => a + b, 0) / totale;
    };

    const europei = mondo.club.filter((c) => c.coppa !== null).map((c) => c.id);
    ok(europei.length > 0, 'premessa del test: nessun club con impegni europei');

    let conCoppe = 0;
    let senzaCoppe = 0;
    for (let i = 0; i < 3; i++) {
      const seme = `coppe-${i}`;
      const con = simulaStagione(mondo, motore, voto, { seme });
      const senza = simulaStagione(mondo, motore, voto, { seme, turniDiCoppa: 0 });
      conCoppe += media(europei.map((id) => concentrazione(con, id)));
      senzaCoppe += media(europei.map((id) => concentrazione(senza, id)));
    }

    ok(
      conCoppe < senzaCoppe,
      'gli stessi club ruotano di piu’ senza coppe che con le coppe: ' +
        `${(conCoppe / 3).toFixed(4)} con, ${(senzaCoppe / 3).toFixed(4)} senza`,
    );
  });
});

describe('classifica', () => {
  it('le squadre forti stanno davanti, ma non vincono sempre', () => {
    const forza = new Map(
      mondo.club.map((c) => {
        const rosa = [...(mondo.rosaPerClub.get(c.id) ?? [])].sort((a, b) => b.overall - a.overall);
        return [c.id, rosa.slice(0, 13).reduce((a, g) => a + g.overall, 0)];
      }),
    );
    const piuForte = [...forza.entries()].sort((a, b) => b[1] - a[1])[0]![0];

    const vittorie = stagioni.filter((s) => s.classifica[0]!.clubId === piuForte).length;
    ok(vittorie >= 1, 'la squadra piu’ forte non vince mai: il campionato e’ troppo casuale');
    ok(
      vittorie < STAGIONI,
      'la squadra piu’ forte vince sempre: il campionato e’ troppo prevedibile',
    );
  });

  it('i conti della classifica tornano', () => {
    for (const s of stagioni) {
      for (const r of s.classifica) {
        ok(r.giocate === 38, `${r.clubId}: ${r.giocate} partite giocate`);
        ok(r.vinte + r.pareggiate + r.perse === 38, `${r.clubId}: somma degli esiti sbagliata`);
        ok(r.punti === r.vinte * 3 + r.pareggiate, `${r.clubId}: punti non coerenti`);
      }
      const golFatti = s.classifica.reduce((a, r) => a + r.golFatti, 0);
      const golSubiti = s.classifica.reduce((a, r) => a + r.golSubiti, 0);
      ok(golFatti === golSubiti, 'i gol fatti non pareggiano i gol subiti');
    }
  });
});

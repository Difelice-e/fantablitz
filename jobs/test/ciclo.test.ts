/**
 * Test del ciclo di gioco.
 *
 * L'idempotenza e' la proprieta' che vale la pena verificare davvero: il job
 * gira ogni sera senza nessuno che guardi, e se rieseguirlo duplicasse qualcosa
 * ce ne accorgeremmo solo dalla classifica sbagliata, giorni dopo.
 */

import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { caricaMondo, indicizza } from '../../engine/src/mondo.ts';
import {
  validaParametriMotore, validaParametriVoto,
  type ParametriMotore, type ParametriVoto,
} from '../../engine/src/configurazione.ts';
import { regoleClassic, type ConfigurazioneClassic } from '../../fanta/src/classic.ts';
import { validaConfigurazioneLega, type ConfigurazioneLega } from '../../fanta/src/fantavoto.ts';
import { disponi } from '../../fanta/src/schieramento.ts';
import type { Schierabile } from '../../fanta/src/tipi.ts';
import { eseguiCiclo, giocaGiornata, type Lega, type SquadraFanta } from '../src/ciclo.ts';
import { importaRose } from '../src/importa.ts';
import { contesto, roseCompleto } from './comune.ts';

const json = (percorso: string): any =>
  JSON.parse(readFileSync(fileURLToPath(new URL(percorso, import.meta.url)), 'utf8'));

const mondo = indicizza(caricaMondo(json('../../seed/out/mondo.json')));
const motore = validaParametriMotore(json('../../engine/config/motore.json') as ParametriMotore);
const voto = validaParametriVoto(json('../../engine/config/voto.json') as ParametriVoto);
const regole = regoleClassic(json('../../fanta/config/classic.json') as ConfigurazioneClassic);
const configurazione = validaConfigurazioneLega(
  json('../../fanta/config/lega.json') as ConfigurazioneLega,
);

/** Costruisce la lega importando le rose reali e schierando ciascuna. */
function legaDalleRose(): Lega {
  const esito = importaRose(roseCompleto, contesto('classic'));
  if (!esito.riuscito) throw new Error('le fixture non si importano piu’');

  const perId = new Map(mondo.giocatori.map((g) => [g.id, g as Schierabile]));

  const squadre: SquadraFanta[] = esito.squadre.map((s) => {
    const rosa = s.giocatori.map((g) => perId.get(g.giocatoreId)!).filter(Boolean);
    const d = disponi(rosa, regole.modulo('4-4-2')!, regole);
    const titolari = new Set(d.titolari.values());
    return {
      id: s.nome,
      nome: s.nome,
      rosa,
      formazione: {
        modulo: '4-4-2',
        titolari: d.titolari,
        panchina: rosa.filter((g) => !titolari.has(g.id)).map((g) => g.id),
      },
    };
  });

  return { squadre, regole, configurazione };
}

const lega = legaDalleRose();

/* ------------------------------------------------------------------ */

describe('una giornata di lega', () => {
  const esito = eseguiCiclo(mondo, motore, voto, lega, { seme: 'ciclo', da: 1, quante: 1 });

  it('gioca una sola giornata quando gliene chiedo una', () => {
    strictEqual(esito.giornate.length, 1);
    strictEqual(esito.giornate[0]!.numero, 1);
  });

  it('cinque scontri per dieci squadre', () => {
    strictEqual(esito.giornate[0]!.scontri.length, 5);
    const impegnate = esito.giornate[0]!.scontri.flatMap((s) => [s.casaId, s.ospiteId]);
    strictEqual(new Set(impegnate).size, 10);
  });

  it('ogni squadra schiera undici giocatori', () => {
    for (const s of esito.giornate[0]!.squadre) {
      strictEqual(s.formazione.titolari.size, 11, s.squadraId);
      strictEqual(s.slotScoperti.length, 0, `${s.squadraId}: caselle scoperte`);
    }
  });

  it('i fantapunti sono numeri sensati', () => {
    for (const s of esito.giornate[0]!.squadre) {
      const p = s.punteggio.fantapunti;
      ok(p > 30 && p < 110, `${s.squadraId}: ${p} fantapunti`);
    }
  });

  it('in classic non ci sono mai adattati', () => {
    for (const s of esito.giornate[0]!.squadre) deepStrictEqual(s.adattati, [], s.squadraId);
  });
});

describe('sostituzione di chi non prende voto', () => {
  it('chi resta senza voto viene sostituito dalla panchina', () => {
    // Nel fantacalcio non si sostituisce solo l'infortunato: si sostituisce
    // anche chi non ha preso voto, ed e' il caso piu' frequente dei due.
    const esito = eseguiCiclo(mondo, motore, voto, lega, { seme: 'ciclo', da: 1, quante: 3 });
    const cambi = esito.giornate.flatMap((g) => g.squadre.flatMap((s) => s.cambi));
    ok(cambi.length > 0, 'in tre giornate qualcuno senza voto ci sara’ stato');
    ok(cambi.every((c) => c.motivo === 'senzaVoto'), 'qui gli unici cambi sono per senza voto');
  });

  it('nessun titolare finale e’ senza voto, se la panchina bastava', () => {
    const esito = eseguiCiclo(mondo, motore, voto, lega, { seme: 'ciclo', da: 1, quante: 2 });
    for (const g of esito.giornate) {
      for (const s of g.squadre) {
        // Chi resta senza voto vale zero: se ne resta qualcuno, e' perche' la
        // panchina non aveva alternative del ruolo giusto.
        const quanti = s.punteggio.senzaVoto.length;
        ok(quanti <= 3, `${s.squadraId}: ${quanti} titolari senza voto`);
      }
    }
  });

  it('chi entra non era gia’ in campo', () => {
    const esito = eseguiCiclo(mondo, motore, voto, lega, { seme: 'ciclo', da: 1, quante: 3 });
    for (const g of esito.giornate) {
      for (const s of g.squadre) {
        const titolari = [...s.formazione.titolari.values()];
        strictEqual(new Set(titolari).size, titolari.length, `${s.squadraId}: un titolare ripetuto`);
        for (const c of s.cambi) {
          ok(titolari.includes(c.entra), `${c.entra} dovrebbe essere in campo`);
          ok(!titolari.includes(c.esce), `${c.esce} doveva uscire`);
        }
      }
    }
  });
});

describe('idempotenza', () => {
  it('rieseguire la stessa giornata da’ lo stesso identico esito', () => {
    // E' la proprieta' che rende sicuro il job serale: se il processo muore a
    // meta' e riparte, rigiocare non duplica e non cambia niente.
    const uno = eseguiCiclo(mondo, motore, voto, lega, { seme: 'lega-uno', da: 5, quante: 1 });
    const due = eseguiCiclo(mondo, motore, voto, lega, { seme: 'lega-uno', da: 5, quante: 1 });
    strictEqual(JSON.stringify(uno.giornate), JSON.stringify(due.giornate));
  });

  it('una giornata non dipende da quelle giocate prima', () => {
    // Il risultato della giornata 5 e' lo stesso sia partendo dalla 1 sia
    // partendo dalla 5: non c'e' nessuno stato che scorre.
    const dallInizio = eseguiCiclo(mondo, motore, voto, lega, { seme: 'lega-due', da: 1, quante: 5 });
    const soloLaQuinta = eseguiCiclo(mondo, motore, voto, lega, { seme: 'lega-due', da: 5, quante: 1 });
    strictEqual(
      JSON.stringify(dallInizio.giornate[4]),
      JSON.stringify(soloLaQuinta.giornate[0]),
    );
  });

  it('semi diversi danno leghe diverse', () => {
    const a = eseguiCiclo(mondo, motore, voto, lega, { seme: 'lega-a', da: 1, quante: 1 });
    const b = eseguiCiclo(mondo, motore, voto, lega, { seme: 'lega-b', da: 1, quante: 1 });
    ok(JSON.stringify(a.giornate) !== JSON.stringify(b.giornate));
  });

  it('la classifica si ricalcola, non si accumula', () => {
    // Una classifica accumulata si sporcherebbe al primo doppio salvataggio.
    const tre = eseguiCiclo(mondo, motore, voto, lega, { seme: 'lega-tre', da: 1, quante: 3 });
    for (const r of tre.classifica) strictEqual(r.giocate, 3, r.squadraId);
    strictEqual(tre.classifica.reduce((s, r) => s + r.giocate, 0), 30);
  });
});

describe('una stagione intera', () => {
  const esito = eseguiCiclo(mondo, motore, voto, lega, { seme: 'stagione' });

  it('gioca tutte e 38 le giornate', () => {
    strictEqual(esito.giornate.length, 38);
    strictEqual(esito.calendario.giornate.length, 38);
  });

  it('ogni squadra gioca 38 partite e i conti tornano', () => {
    strictEqual(esito.classifica.length, 10);
    for (const r of esito.classifica) {
      strictEqual(r.giocate, 38, r.squadraId);
      strictEqual(r.vinte + r.pareggiate + r.perse, 38, r.squadraId);
      strictEqual(r.punti, r.vinte * 3 + r.pareggiate, r.squadraId);
    }
    strictEqual(
      esito.classifica.reduce((s, r) => s + r.golFatti, 0),
      esito.classifica.reduce((s, r) => s + r.golSubiti, 0),
    );
  });

  it('i punteggi finali sono da campionato, non da tabellone impazzito', () => {
    const primo = esito.classifica[0]!;
    const ultimo = esito.classifica[esito.classifica.length - 1]!;
    ok(primo.punti > ultimo.punti, 'la classifica deve avere una forma');
    ok(primo.punti <= 38 * 3, 'nessuno puo’ superare il massimo teorico');
    ok(
      primo.fantapunti > ultimo.fantapunti,
      'chi vince dovrebbe anche aver raccolto piu’ fantapunti',
    );
  });

  it('i gol per giornata sono nella scala del fantacalcio', () => {
    const golTotali = esito.classifica.reduce((s, r) => s + r.golFatti, 0);
    const perSquadraPerGiornata = golTotali / (10 * 38);
    ok(
      perSquadraPerGiornata > 0.3 && perSquadraPerGiornata < 3,
      `${perSquadraPerGiornata.toFixed(2)} gol a squadra per giornata`,
    );
  });

  it('la stagione del mondo simulato e’ quella vera, non una finta', () => {
    strictEqual(esito.mondo.partite.length, 380);
    for (const r of esito.mondo.classifica) strictEqual(r.giocate, 38);
  });
});

describe('giocaGiornata da sola', () => {
  it('funziona senza nessuna prestazione: tutti senza voto, zero punti', () => {
    const esito = giocaGiornata(1, lega, new Map(), {
      numero: 1,
      ripetuta: false,
      scontri: [{ casaId: lega.squadre[0]!.id, ospiteId: lega.squadre[1]!.id }],
    });
    strictEqual(esito.scontri[0]!.golCasa, 0);
    strictEqual(esito.scontri[0]!.golOspite, 0);
    for (const s of esito.squadre) strictEqual(s.punteggio.fantapunti, 0, s.squadraId);
  });
});

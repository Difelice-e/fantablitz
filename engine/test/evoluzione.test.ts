/**
 * Test dell'evoluzione del mondo fra una stagione e la successiva
 * (SPEC 5.8 punti 4 e 6).
 */

import { deepStrictEqual, notStrictEqual, ok, strictEqual, throws } from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { generatore } from '../src/casuale.ts';
import {
  evolviGiocatore, evolviMondo, validaParametriEvoluzione, type ParametriEvoluzione,
} from '../src/evoluzione.ts';
import type { Giocatore, Mondo } from '../src/mondo.ts';
import { mondo } from './comune.ts';

const json = (percorso: string): any =>
  JSON.parse(readFileSync(fileURLToPath(new URL(percorso, import.meta.url)), 'utf8'));

const config = validaParametriEvoluzione(json('../config/evoluzione.json') as ParametriEvoluzione);

function configDiProva(mod: Partial<ParametriEvoluzione> = {}): ParametriEvoluzione {
  return {
    versione: 1,
    overall: { minimo: 30, massimo: 99, tassoCrescita: 0.25, tassoDeclino: 0.6 },
    trasferimenti: { quotaPerStagione: 0.1 },
    ...mod,
  };
}

function giocatoreDiProva(mod: Partial<Giocatore> = {}): Giocatore {
  return {
    id: 'g1', nome: 'Prova', clubId: 'c1', ruoliMantra: ['C'], ruoloClassico: 'C',
    eta: 20, etaPicco: 27, overall: 70, potenziale: 80,
    rating: { attacco: 70, difesa: 70, tecnica: 70, fisico: 70 },
    propensioni: { gol: 0.1, assist: 0.1, cartellino: 0.1, infortunio: 0.1 },
    ...mod,
  };
}

/* ------------------------------------------------------------------ */

describe('validaParametriEvoluzione', () => {
  it('accetta una configurazione sensata', () => {
    ok(validaParametriEvoluzione(configDiProva()));
  });

  it('rifiuta un tasso di crescita fuori da [0,1]', () => {
    throws(() => validaParametriEvoluzione(configDiProva({ overall: { minimo: 30, massimo: 99, tassoCrescita: 1.5, tassoDeclino: 0.6 } })));
  });

  it('rifiuta massimo <= minimo', () => {
    throws(() => validaParametriEvoluzione(configDiProva({ overall: { minimo: 99, massimo: 30, tassoCrescita: 0.2, tassoDeclino: 0.6 } })));
  });
});

describe('evolviGiocatore', () => {
  it('invecchia di un anno', () => {
    const g = giocatoreDiProva({ eta: 24 });
    strictEqual(evolviGiocatore(g, configDiProva()).eta, 25);
  });

  it('prima del picco, l’overall si avvicina al potenziale senza superarlo', () => {
    const g = giocatoreDiProva({ eta: 20, etaPicco: 27, overall: 70, potenziale: 80 });
    const evoluto = evolviGiocatore(g, configDiProva({ overall: { minimo: 30, massimo: 99, tassoCrescita: 0.25, tassoDeclino: 0.6 } }));
    ok(evoluto.overall > g.overall, 'deve crescere');
    ok(evoluto.overall <= g.potenziale, 'non deve superare il potenziale');
    strictEqual(evoluto.overall, 72.5, 'il 25% del divario di 10 punti sono 2.5');
  });

  it('dopo il picco, l’overall declina e il potenziale lo segue', () => {
    const g = giocatoreDiProva({ eta: 33, etaPicco: 30, overall: 75, potenziale: 78 });
    const evoluto = evolviGiocatore(g, configDiProva());
    ok(evoluto.overall < g.overall, 'deve calare');
    strictEqual(evoluto.potenziale, evoluto.overall, 'chi ha passato il picco non cresce piu’');
  });

  it('il declino accelera con gli anni oltre il picco', () => {
    const cfg = configDiProva();
    const vicinoAlPicco = giocatoreDiProva({ eta: 31, etaPicco: 30, overall: 80, potenziale: 80 });
    const lontanoDalPicco = giocatoreDiProva({ eta: 38, etaPicco: 30, overall: 80, potenziale: 80 });
    const caloVicino = vicinoAlPicco.overall - evolviGiocatore(vicinoAlPicco, cfg).overall;
    const caloLontano = lontanoDalPicco.overall - evolviGiocatore(lontanoDalPicco, cfg).overall;
    ok(caloLontano > caloVicino, 'un trentottenne deve calare piu’ di un trentunenne');
  });

  it('l’overall resta dentro i limiti configurati', () => {
    const g = giocatoreDiProva({ eta: 40, etaPicco: 28, overall: 31, potenziale: 31 });
    const evoluto = evolviGiocatore(g, configDiProva({ overall: { minimo: 30, massimo: 99, tassoCrescita: 0.25, tassoDeclino: 5 } }));
    ok(evoluto.overall >= 30);
  });

  it('i quattro rating si scalano in proporzione alla variazione dell’overall', () => {
    const g = giocatoreDiProva({
      eta: 20, etaPicco: 27, overall: 70, potenziale: 80,
      rating: { attacco: 80, difesa: 60, tecnica: 70, fisico: 65 },
    });
    const evoluto = evolviGiocatore(g, configDiProva());
    const fattore = evoluto.overall / g.overall;
    ok(Math.abs(evoluto.rating.attacco - g.rating.attacco * fattore) < 0.2);
    ok(Math.abs(evoluto.rating.difesa - g.rating.difesa * fattore) < 0.2);
  });

  it('non tocca id, nome, club, ruoli', () => {
    const g = giocatoreDiProva();
    const evoluto = evolviGiocatore(g, configDiProva());
    strictEqual(evoluto.id, g.id);
    strictEqual(evoluto.nome, g.nome);
    strictEqual(evoluto.clubId, g.clubId);
    deepStrictEqual(evoluto.ruoliMantra, g.ruoliMantra);
  });
});

describe('evolviMondo', () => {
  it('e’ deterministico per lo stesso seme', () => {
    const a = evolviMondo(mondo, config, generatore(42));
    const b = evolviMondo(mondo, config, generatore(42));
    deepStrictEqual(a, b);
  });

  it('tutti i giocatori invecchiano di un anno', () => {
    const evoluto = evolviMondo(mondo, config, generatore(1));
    for (const g of evoluto.giocatori) {
      const originale = mondo.giocatorePerId.get(g.id)!;
      strictEqual(g.eta, originale.eta + 1);
    }
  });

  it('una quota di giocatori vicina a quella configurata cambia club', () => {
    const evoluto = evolviMondo(mondo, config, generatore(7));
    const cambiati = evoluto.giocatori.filter((g) => g.clubId !== mondo.giocatorePerId.get(g.id)!.clubId);
    const atteso = Math.round(mondo.giocatori.length * config.trasferimenti.quotaPerStagione);
    strictEqual(cambiati.length, atteso);
  });

  it('chi cambia club non finisce mai nello stesso club di partenza', () => {
    const evoluto = evolviMondo(mondo, config, generatore(7));
    for (const g of evoluto.giocatori) {
      const originale = mondo.giocatorePerId.get(g.id)!;
      if (g.clubId !== originale.clubId) {
        notStrictEqual(g.clubId, originale.clubId);
        ok(mondo.clubPerId.has(g.clubId), 'il nuovo club deve esistere davvero');
      }
    }
  });

  it('con quota zero nessuno cambia club', () => {
    const senzaTrasferimenti: ParametriEvoluzione = { ...config, trasferimenti: { quotaPerStagione: 0 } };
    const evoluto = evolviMondo(mondo, senzaTrasferimenti, generatore(3));
    for (const g of evoluto.giocatori) {
      strictEqual(g.clubId, mondo.giocatorePerId.get(g.id)!.clubId);
    }
  });

  it('non cambia il numero di giocatori o di club', () => {
    const evoluto = evolviMondo(mondo, config, generatore(9));
    strictEqual(evoluto.giocatori.length, mondo.giocatori.length);
    strictEqual(evoluto.club.length, mondo.club.length);
  });
});

describe('applicazione ripetuta (piu’ stagioni)', () => {
  it('applicata piu’ volte resta stabile: nessun overall esplode o collassa', () => {
    let corrente: Mondo = mondo;
    for (let stagione = 0; stagione < 10; stagione++) {
      corrente = evolviMondo(corrente, config, generatore(100 + stagione));
    }
    for (const g of corrente.giocatori) {
      ok(g.overall >= config.overall.minimo && g.overall <= config.overall.massimo, `${g.id}: overall ${g.overall} fuori scala dopo 10 stagioni`);
    }
  });
});

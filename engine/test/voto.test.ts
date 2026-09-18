/**
 * Test della formula del voto (SPEC 5.6).
 *
 * Qui stanno i test sui valori di confine, che sono quelli dove i bug fanno
 * litigare la chat della lega: le soglie di minuti, l'arrotondamento a mezzo
 * punto e i limiti 3-10.
 */

import { ok, strictEqual } from 'node:assert/strict';
import { describe, it } from 'node:test';
import { arrotondaAMezzoPunto, calcolaVoto, indiceDiRuolo, type ContestoVoto } from '../src/voto.ts';
import { NOMI_STATISTICHE } from '../src/configurazione.ts';
import type { Statistiche } from '../src/partita.ts';
import type { Giocatore, RuoloMantra } from '../src/mondo.ts';
import { voto as p } from './comune.ts';

function statistiche(campi: Partial<Statistiche> = {}): Statistiche {
  const s = { minuti: 90 } as Statistiche;
  for (const nome of NOMI_STATISTICHE) s[nome] = 0;
  return { ...s, ...campi };
}

function giocatore(ruolo: RuoloMantra): Giocatore {
  return {
    id: 'g1', nome: 'Tizio', clubId: 'c1',
    ruoliMantra: [ruolo], ruoloClassico: ruolo === 'Por' ? 'P' : 'C',
    eta: 26, etaPicco: 27, overall: 70, potenziale: 70,
    rating: { attacco: 70, difesa: 70, tecnica: 70, fisico: 70 },
    propensioni: { gol: 0.3, assist: 0.3, cartellino: 0.4, infortunio: 0.5 },
  };
}

function contesto(campi: Partial<ContestoVoto> = {}): ContestoVoto {
  return {
    giocatore: giocatore('C'),
    statistiche: statistiche(),
    esito: 'pareggio',
    gol: 0, assist: 0, autogol: 0,
    rigoriSegnati: 0, rigoriSbagliati: 0, rigoriParati: 0,
    ammonito: false, espulso: false,
    ...campi,
  };
}

describe('arrotondamento a mezzo punto', () => {
  it('arrotonda come le pagelle', () => {
    strictEqual(arrotondaAMezzoPunto(6.24), 6.0);
    strictEqual(arrotondaAMezzoPunto(6.25), 6.5);
    strictEqual(arrotondaAMezzoPunto(6.74), 6.5);
    strictEqual(arrotondaAMezzoPunto(6.75), 7.0);
    strictEqual(arrotondaAMezzoPunto(5.5), 5.5);
  });

  it('ogni voto prodotto e’ un multiplo di mezzo punto', () => {
    for (let passaggi = 0; passaggi <= 60; passaggi += 3) {
      const v = calcolaVoto(contesto({ statistiche: statistiche({ passaggiRiusciti: passaggi }) }), p);
      if (v === null) continue;
      strictEqual(v * 2, Math.round(v * 2), `voto non multiplo di 0.5: ${v}`);
    }
  });
});

describe('soglie di minuti', () => {
  it('sotto i 10 minuti e’ senza voto', () => {
    strictEqual(calcolaVoto(contesto({ statistiche: statistiche({ minuti: 9 }) }), p), null);
    strictEqual(calcolaVoto(contesto({ statistiche: statistiche({ minuti: 0 }) }), p), null);
  });

  it('a 10 minuti esatti il voto esiste', () => {
    ok(calcolaVoto(contesto({ statistiche: statistiche({ minuti: 10 }) }), p) !== null);
  });

  it('il portiere sotto i 25 minuti resta senza voto', () => {
    const portiere = { giocatore: giocatore('Por') };
    strictEqual(calcolaVoto(contesto({ ...portiere, statistiche: statistiche({ minuti: 24 }) }), p), null);
    ok(calcolaVoto(contesto({ ...portiere, statistiche: statistiche({ minuti: 25 }) }), p) !== null);
  });

  it('fra 10 e 25 minuti la prestazione e’ attenuata', () => {
    // Su pochi palloni non si giudica: una prestazione ottima da subentrato non
    // deve valere quanto la stessa prestazione su novanta minuti.
    const ottima = statistiche({ palleRecuperate: 12, passaggiRiusciti: 70, passaggiChiave: 4 });
    const breve = calcolaVoto(contesto({ statistiche: { ...ottima, minuti: 12 } }), p)!;
    const piena = calcolaVoto(contesto({ statistiche: { ...ottima, minuti: 90 } }), p)!;
    ok(breve < piena, `attenuazione assente: ${breve} contro ${piena}`);
  });

  it('un gol da subentrato vale comunque pieno', () => {
    // C_decisiva non viene attenuata: un gol e' un gol anche al 90'.
    const senza = calcolaVoto(contesto({ statistiche: statistiche({ minuti: 12 }) }), p)!;
    const con = calcolaVoto(contesto({ statistiche: statistiche({ minuti: 12 }), gol: 1 }), p)!;
    ok(con - senza >= 0.5, `il gol da subentrato non pesa: ${senza} -> ${con}`);
  });
});

describe('limiti del voto', () => {
  it('non scende sotto il minimo ne’ sale sopra il massimo', () => {
    const disastro = calcolaVoto(
      contesto({
        statistiche: statistiche({ errori: 30, pallePerse: 40 }),
        autogol: 3, espulso: true, esito: 'sconfitta',
      }),
      p,
    )!;
    strictEqual(disastro, p.minimo);

    const capolavoro = calcolaVoto(
      contesto({
        statistiche: statistiche({ passaggiChiave: 20, palleRecuperate: 30, dribblingRiusciti: 15 }),
        gol: 5, assist: 5, esito: 'vittoria',
      }),
      p,
    )!;
    strictEqual(capolavoro, p.massimo);
  });
});

describe('contributo delle azioni decisive', () => {
  it('il gol di un difensore vale piu’ del gol di una punta', () => {
    // Un gol e' piu' raro e piu' notevole da dietro: la specifica lo dice.
    const perRuolo = (ruolo: RuoloMantra): number =>
      calcolaVoto(contesto({ giocatore: giocatore(ruolo), gol: 1 }), p)! -
      calcolaVoto(contesto({ giocatore: giocatore(ruolo) }), p)!;
    ok(perRuolo('Dc') >= perRuolo('Pc'));
  });

  it('l’ammonizione non tocca il voto: la punisce il malus di lega', () => {
    strictEqual(
      calcolaVoto(contesto({ ammonito: true }), p),
      calcolaVoto(contesto({ ammonito: false }), p),
    );
  });

  it('l’espulsione invece pesa', () => {
    ok(calcolaVoto(contesto({ espulso: true }), p)! < calcolaVoto(contesto({}), p)!);
  });

  it('assist e rigore parato alzano, autogol e rigore sbagliato abbassano', () => {
    const base = calcolaVoto(contesto({}), p)!;
    ok(calcolaVoto(contesto({ assist: 1 }), p)! >= base);
    ok(calcolaVoto(contesto({ giocatore: giocatore('Por'), rigoriParati: 1 }), p)! >
       calcolaVoto(contesto({ giocatore: giocatore('Por') }), p)!);
    ok(calcolaVoto(contesto({ autogol: 1 }), p)! < base);
    ok(calcolaVoto(contesto({ rigoriSbagliati: 1 }), p)! < base);
  });
});

describe('esito della partita', () => {
  it('vincere vale piu’ che perdere, a parita’ di prestazione', () => {
    const conEsito = (esito: ContestoVoto['esito']): number =>
      calcolaVoto(contesto({ esito, statistiche: statistiche({ palleRecuperate: 7 }) }), p)!;
    ok(conEsito('vittoria') >= conEsito('pareggio'));
    ok(conEsito('pareggio') >= conEsito('sconfitta'));
  });
});

describe('indice di ruolo', () => {
  it('le statistiche positive lo alzano, le negative lo abbassano', () => {
    const vuoto = indiceDiRuolo('mediano', statistiche(), p);
    ok(indiceDiRuolo('mediano', statistiche({ palleRecuperate: 8 }), p) > vuoto);
    ok(indiceDiRuolo('mediano', statistiche({ errori: 3 }), p) < vuoto);
  });

  it('i gol subiti pesano meno se il portiere ha affrontato molti tiri', () => {
    // Prenderne tre su dodici tiri non e' come prenderne tre su quattro.
    const pochiTiri = indiceDiRuolo('por', statistiche({ golSubiti: 3, tiriAffrontati: 4 }), p);
    const moltiTiri = indiceDiRuolo('por', statistiche({ golSubiti: 3, tiriAffrontati: 14 }), p);
    ok(moltiTiri > pochiTiri, 'attenuazione dei gol subiti assente');
  });

  it('usa solo i pesi del proprio gruppo', () => {
    // Le parate non entrano nell'indice di un mediano: non e' il suo mestiere.
    strictEqual(
      indiceDiRuolo('mediano', statistiche({ parate: 9 }), p),
      indiceDiRuolo('mediano', statistiche(), p),
    );
  });
});

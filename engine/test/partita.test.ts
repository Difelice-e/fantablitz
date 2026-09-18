/**
 * Test del motore partita e degli stati dinamici.
 *
 * Il determinismo non e' un dettaglio: serve per i test, per la calibrazione e
 * per dirimere le contestazioni. Se un utente contesta un risultato, lo si
 * rigenera e si guarda.
 */

import { ok, strictEqual, throws } from 'node:assert/strict';
import { describe, it } from 'node:test';
import { generatore, seme } from '../src/casuale.ts';
import { schiera, forzeDi } from '../src/allenatore.ts';
import { golAttesi, simulaPartita } from '../src/partita.ts';
import { avanzaGiornata, statiIniziali, registraRisultato, disponibile } from '../src/stati.ts';
import { simulaStagione } from '../src/stagione.ts';
import { mondo, motore, voto } from './comune.ts';

const primoClub = mondo.club[0]!.id;
const secondoClub = mondo.club[1]!.id;

function statiFreschi() {
  return statiIniziali(mondo, motore, generatore(seme('test')));
}

function partitaDiProva(semeTesto = 'partita') {
  const stati = statiFreschi();
  const rng = generatore(seme(semeTesto));
  const casa = schiera(primoClub, mondo, stati, motore, rng);
  const ospite = schiera(secondoClub, mondo, stati, motore, rng);
  return simulaPartita({ casa, ospite, parametri: motore, rng });
}

describe('determinismo', () => {
  it('stesso seme, stessa partita', () => {
    strictEqual(JSON.stringify(partitaDiProva('x')), JSON.stringify(partitaDiProva('x')));
  });

  it('semi diversi, partite diverse', () => {
    ok(JSON.stringify(partitaDiProva('a')) !== JSON.stringify(partitaDiProva('b')));
  });

  it('stesso seme, stessa stagione intera', () => {
    const a = simulaStagione(mondo, motore, voto, { seme: 'uguale' });
    const b = simulaStagione(mondo, motore, voto, { seme: 'uguale' });
    strictEqual(
      JSON.stringify(a.classifica),
      JSON.stringify(b.classifica),
      'due stagioni con lo stesso seme divergono',
    );
  });

  it('una giornata non dipende da quelle precedenti', () => {
    // Ogni partita ha il proprio generatore, seminato su giornata e indice: non
    // c'e' uno stato casuale che scorre. E' la premessa perche' il job serale
    // possa essere rieseguito senza duplicare nulla.
    const rng = () => generatore(seme('lega', '2026-27', 'giornata', 12, 'partita', 3));
    const stati = statiFreschi();
    const uno = simulaPartita({
      casa: schiera(primoClub, mondo, stati, motore, rng()),
      ospite: schiera(secondoClub, mondo, stati, motore, rng()),
      parametri: motore,
      rng: rng(),
    });
    const due = simulaPartita({
      casa: schiera(primoClub, mondo, stati, motore, rng()),
      ospite: schiera(secondoClub, mondo, stati, motore, rng()),
      parametri: motore,
      rng: rng(),
    });
    strictEqual(JSON.stringify(uno), JSON.stringify(due));
  });
});

describe('schieramento', () => {
  it('manda in campo undici uomini con un portiere', () => {
    const stati = statiFreschi();
    const s = schiera(primoClub, mondo, stati, motore, generatore(seme('s')));
    strictEqual(s.titolari.length, 11);
    strictEqual(s.titolari.filter((g) => g.ruoloClassico === 'P').length, 1);
    strictEqual(new Set(s.titolari.map((g) => g.id)).size, 11, 'un giocatore schierato due volte');
  });

  it('titolari e panchina non si sovrappongono', () => {
    const s = schiera(primoClub, mondo, statiFreschi(), motore, generatore(seme('s')));
    const titolari = new Set(s.titolari.map((g) => g.id));
    ok(s.panchina.every((g) => !titolari.has(g.id)));
  });

  it('non schiera infortunati ne’ squalificati', () => {
    const stati = statiFreschi();
    const rosa = mondo.rosaPerClub.get(primoClub)!;
    const fermi = new Set([rosa[0]!.id, rosa[1]!.id, rosa[2]!.id]);
    stati.giocatori.get(rosa[0]!.id)!.infortunio = 3;
    stati.giocatori.get(rosa[1]!.id)!.squalifica = 1;
    stati.giocatori.get(rosa[2]!.id)!.infortunio = 1;

    const s = schiera(primoClub, mondo, stati, motore, generatore(seme('s')));
    for (const g of [...s.titolari, ...s.panchina]) {
      ok(!fermi.has(g.id), `${g.nome} e’ indisponibile ma risulta convocato`);
    }
  });

  it('si ferma con un messaggio chiaro se non ci sono undici uomini', () => {
    const stati = statiFreschi();
    for (const g of mondo.rosaPerClub.get(primoClub)!) stati.giocatori.get(g.id)!.infortunio = 2;
    throws(
      () => schiera(primoClub, mondo, stati, motore, generatore(seme('s'))),
      /non bastano per scendere in campo/,
    );
  });
});

describe('gol attesi', () => {
  it('fra due squadre in equilibrio valgono il parametro di base, piu’ il fattore campo', () => {
    // "In equilibrio" significa che il rapporto attacco/difesa vale
    // esattamente `rapportoDiEquilibrio`: e' il caso in cui golAttesiBase deve
    // dire quello che promette.
    const difesa = 70;
    const attacco = difesa * motore.forze.rapportoDiEquilibrio;

    const inCasa = golAttesi(attacco, difesa, true, motore);
    const fuori = golAttesi(attacco, difesa, false, motore);

    ok(
      Math.abs(inCasa - motore.forze.golAttesiBase * motore.forze.fattoreCampo) < 0.01,
      `in casa ${inCasa}, atteso ${motore.forze.golAttesiBase * motore.forze.fattoreCampo}`,
    );
    ok(
      Math.abs(fuori - motore.forze.golAttesiBase / motore.forze.fattoreCampo) < 0.01,
      `fuori ${fuori}, atteso ${motore.forze.golAttesiBase / motore.forze.fattoreCampo}`,
    );
    ok(inCasa > fuori, 'il fattore campo non si vede');
  });

  it('un attacco piu’ forte segna di piu’, una difesa piu’ forte subisce di meno', () => {
    ok(golAttesi(80, 60, true, motore) > golAttesi(60, 60, true, motore));
    ok(golAttesi(70, 80, true, motore) < golAttesi(70, 60, true, motore));
  });

  it('resta dentro i limiti anche con squadre assurde', () => {
    ok(golAttesi(200, 1, true, motore) <= motore.forze.golAttesiMassimi);
    ok(golAttesi(1, 200, false, motore) >= motore.forze.golAttesiMinimi);
  });
});

describe('coerenza delle statistiche', () => {
  const esito = partitaDiProva('coerenza');

  it('i minuti di ogni squadra fanno 990', () => {
    for (const lato of [esito.casa, esito.ospite]) {
      const totale = [...lato.minuti.values()].reduce((a, b) => a + b, 0);
      strictEqual(totale, 11 * 90, `${lato.clubId}: ${totale} minuti`);
    }
  });

  it('nessuna statistica derivata supera la propria base', () => {
    for (const lato of [esito.casa, esito.ospite]) {
      for (const [id, s] of lato.statistiche) {
        ok(s.tiriInPorta <= s.tiri, `${id}: ${s.tiriInPorta} tiri in porta su ${s.tiri} tiri`);
        ok(s.passaggiRiusciti <= s.passaggiTentati, `${id}: passaggi riusciti sopra i tentati`);
        ok(s.crossRiusciti <= s.crossTentati, `${id}: cross riusciti sopra i tentati`);
      }
    }
  });

  it('nessuna statistica e’ negativa', () => {
    for (const lato of [esito.casa, esito.ospite]) {
      for (const [id, s] of lato.statistiche) {
        for (const [nome, valore] of Object.entries(s)) {
          ok(valore >= 0, `${id}: ${nome} vale ${valore}`);
        }
      }
    }
  });

  it('il portiere registra i gol subiti della squadra', () => {
    for (const [lato, subiti] of [
      [esito.casa, esito.ospite.gol],
      [esito.ospite, esito.casa.gol],
    ] as const) {
      const portiere = [...lato.statistiche.entries()].find(([, s]) => s.tiriAffrontati > 0 || s.parate > 0);
      if (portiere) {
        strictEqual(portiere[1].golSubiti, subiti, 'gol subiti del portiere non coerenti');
        ok(portiere[1].tiriAffrontati >= subiti, 'meno tiri affrontati che gol subiti');
      }
    }
  });

  it('i marcatori erano in campo', () => {
    for (const evento of esito.eventi) {
      if (evento.tipo !== 'gol' && evento.tipo !== 'rigoreSegnato') continue;
      const lato = evento.clubId === esito.casa.clubId ? esito.casa : esito.ospite;
      ok(lato.minuti.has(evento.giocatoreId), 'ha segnato qualcuno che non era in campo');
    }
  });

  it('i gol negli eventi corrispondono al punteggio', () => {
    for (const lato of [esito.casa, esito.ospite]) {
      const segnati = esito.eventi.filter(
        (e) => e.clubId === lato.clubId && (e.tipo === 'gol' || e.tipo === 'rigoreSegnato'),
      ).length;
      strictEqual(segnati, lato.gol, `${lato.clubId}: eventi gol non coerenti col punteggio`);
    }
  });

  it('la cronaca e’ in ordine di minuto', () => {
    for (let i = 1; i < esito.eventi.length; i++) {
      ok(esito.eventi[i]!.minuto >= esito.eventi[i - 1]!.minuto);
    }
    ok(esito.eventi.every((e) => e.minuto >= 1 && e.minuto <= 90));
  });
});

describe('stati dinamici', () => {
  it('giocare consuma condizione, riposare la restituisce', () => {
    const stati = statiFreschi();
    const g = mondo.giocatori[0]!;
    stati.giocatori.get(g.id)!.condizione = 0.8;

    avanzaGiornata(
      mondo, stati, new Map([[g.id, 90]]),
      { infrasettimanale: false, turnoDiCoppa: false }, motore, generatore(seme('a')),
    );
    const dopoAverGiocato = stati.giocatori.get(g.id)!.condizione;
    ok(dopoAverGiocato < 0.8, 'novanta minuti non hanno consumato condizione');

    avanzaGiornata(
      mondo, stati, new Map(),
      { infrasettimanale: false, turnoDiCoppa: false }, motore, generatore(seme('b')),
    );
    ok(stati.giocatori.get(g.id)!.condizione > dopoAverGiocato, 'il riposo non ha restituito nulla');
  });

  it('la condizione non esce mai dalla sua banda', () => {
    const stati = statiFreschi();
    const minuti = new Map(mondo.giocatori.map((g) => [g.id, 90]));
    for (let i = 0; i < 40; i++) {
      avanzaGiornata(
        mondo, stati, minuti,
        { infrasettimanale: true, turnoDiCoppa: true }, motore, generatore(seme('c', i)),
      );
    }
    for (const [id, s] of stati.giocatori) {
      ok(
        s.condizione >= motore.stati.condizione.minima && s.condizione <= 1,
        `${id}: condizione ${s.condizione}`,
      );
    }
  });

  it('squalifiche e infortuni scalano di una giornata alla volta', () => {
    const stati = statiFreschi();
    const g = mondo.giocatori[0]!;
    stati.giocatori.get(g.id)!.squalifica = 2;
    ok(!disponibile(stati.giocatori.get(g.id)!));

    avanzaGiornata(mondo, stati, new Map(), { infrasettimanale: false, turnoDiCoppa: false }, motore, generatore(1));
    strictEqual(stati.giocatori.get(g.id)!.squalifica, 1);
    avanzaGiornata(mondo, stati, new Map(), { infrasettimanale: false, turnoDiCoppa: false }, motore, generatore(2));
    ok(disponibile(stati.giocatori.get(g.id)!), 'la squalifica non e’ finita');
  });

  it('il morale sale vincendo e scende perdendo, restando in banda', () => {
    const stato = { morale: 0, ultimiRisultati: [] as string[] };
    for (let i = 0; i < 10; i++) registraRisultato(stato, 3, 0, motore);
    ok(stato.morale > 0 && stato.morale <= 1, `morale dopo dieci vittorie: ${stato.morale}`);

    for (let i = 0; i < 20; i++) registraRisultato(stato, 0, 4, motore);
    ok(stato.morale < 0 && stato.morale >= -1, `morale dopo venti sconfitte: ${stato.morale}`);
  });

  it('un turno di coppa costa condizione ai club europei e non agli altri', () => {
    // Il confronto e' fra la stessa giornata con e senza turno di coppa: in
    // termini assoluti la condizione sale comunque, perche' chi non gioca
    // recupera piu' di quanto la coppa gli tolga. Quello che conta e' che
    // arrivi al campionato piu' stanco di quanto sarebbe arrivato.
    const conCoppa = statiFreschi();
    const senzaCoppa = statiFreschi();

    for (const [stati, turnoDiCoppa] of [[conCoppa, true], [senzaCoppa, false]] as const) {
      avanzaGiornata(
        mondo, stati, new Map(),
        { infrasettimanale: false, turnoDiCoppa }, motore, generatore(seme('coppa')),
      );
    }

    const piuStanchi = (europei: boolean): number =>
      mondo.club
        .filter((c) => (c.coppa !== null) === europei)
        .flatMap((c) => mondo.rosaPerClub.get(c.id) ?? [])
        .filter((g) => conCoppa.giocatori.get(g.id)!.condizione < senzaCoppa.giocatori.get(g.id)!.condizione)
        .length;

    ok(piuStanchi(true) > 0, 'nessun giocatore europeo ha pagato il turno di coppa');
    strictEqual(piuStanchi(false), 0, 'un club senza coppe ha perso condizione in settimana di coppa');
  });
});

describe('forze di reparto', () => {
  it('una squadra piu’ forte esprime forze piu’ alte', () => {
    const stati = statiFreschi();
    const rng = generatore(seme('forze'));
    const perClub = mondo.club.map((c) => {
      const s = schiera(c.id, mondo, stati, motore, rng);
      const f = forzeDi(s, motore);
      const rosa = [...(mondo.rosaPerClub.get(c.id) ?? [])].sort((a, b) => b.overall - a.overall);
      return { forza: rosa.slice(0, 13).reduce((a, g) => a + g.overall, 0), attacco: f.attacco };
    });

    const ordinate = [...perClub].sort((a, b) => b.forza - a.forza);
    const migliori = ordinate.slice(0, 5).reduce((a, x) => a + x.attacco, 0) / 5;
    const peggiori = ordinate.slice(-5).reduce((a, x) => a + x.attacco, 0) / 5;
    ok(migliori > peggiori, `attacco delle grandi ${migliori} contro ${peggiori}`);
  });
});

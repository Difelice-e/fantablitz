import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { leggiListone, type RigaListone } from '../src/listone.ts';
import { leggiConfigurazione, type Parametri } from '../src/configurazione.ts';
import {
  areeDaOverall,
  derivaGiocatore,
  overallDaQualita,
  potenzialeDaOverall,
  qualitaPerGiocatore,
  segnale,
} from '../src/derivazione.ts';
import { generatore } from '../src/casuale.ts';

const CARTELLA_CONFIG = fileURLToPath(new URL('../config', import.meta.url));
const listone = leggiListone(
  readFileSync(fileURLToPath(new URL('../Quotazioni_Fantacalcio_Stagione_2026_27.xlsx', import.meta.url))),
);

// Caricata con un await di primo livello: i corpi dei `describe` vengono
// eseguiti subito, quindi la configurazione deve essere gia' pronta.
const p: Parametri = (await leggiConfigurazione(CARTELLA_CONFIG)).parametri;

function finto(campi: Partial<RigaListone>): RigaListone {
  return {
    idEsterno: 1,
    ruoloClassico: 'C',
    ruoliMantra: ['C'],
    nome: 'Tizio',
    squadra: 'Inter',
    quotazioneAsta: 10,
    quotazioneIniziale: 10,
    quotazioneAstaMantra: 10,
    quotazioneInizialeMantra: 10,
    valoreMercato: 20,
    valoreMercatoMantra: 20,
    riga: 3,
    ...campi,
  };
}

describe('segnale di mercato', () => {
  it('cresce con FVM M e con Qt.A M', () => {
    const basso = segnale(finto({ valoreMercatoMantra: 10, quotazioneAstaMantra: 5 }), p);
    const alto = segnale(finto({ valoreMercatoMantra: 200, quotazioneAstaMantra: 5 }), p);
    const altissimo = segnale(finto({ valoreMercatoMantra: 200, quotazioneAstaMantra: 30 }), p);
    ok(basso < alto && alto < altissimo);
  });

  it('la fonte decide quali colonne del listone legge', () => {
    // Un mediano M;C e' il caso in cui le due quotazioni divergono di piu'.
    const mediano = finto({
      valoreMercato: 237, quotazioneAsta: 25,
      valoreMercatoMantra: 267, quotazioneAstaMantra: 28,
    });
    const con = (fonte: 'classic' | 'mantra' | 'media'): number =>
      segnale(mediano, { ...p, rating: { ...p.rating, fonteSegnale: fonte } });

    ok(con('classic') < con('mantra'), 'in Mantra il mediano e’ quotato di piu’');
    ok(con('classic') < con('media') && con('media') < con('mantra'), 'la media sta in mezzo');
  });

  it('su chi ha le due quotazioni uguali la fonte non cambia nulla', () => {
    const uguale = finto({
      valoreMercato: 90, quotazioneAsta: 19,
      valoreMercatoMantra: 90, quotazioneAstaMantra: 19,
    });
    const con = (fonte: 'classic' | 'mantra' | 'media'): number =>
      segnale(uguale, { ...p, rating: { ...p.rating, fonteSegnale: fonte } });
    strictEqual(con('classic'), con('mantra'));
    strictEqual(con('classic'), con('media'));
  });

  it('comprime la coda alta: il salto 1 -> 14 pesa piu’ del salto 400 -> 450', () => {
    // E' il motivo per cui si passa ai logaritmi: in scala lineare la mediana
    // del listone (14) e il fondo (1) sarebbero indistinguibili.
    const salita = (a: number, b: number): number =>
      segnale(finto({ valoreMercatoMantra: b }), p) - segnale(finto({ valoreMercatoMantra: a }), p);
    ok(salita(1, 14) > salita(400, 450));
  });
});

describe('qualita’ normalizzata dentro il ruolo', () => {
  const qualita = qualitaPerGiocatore(listone.giocatori, p);

  it('assegna un valore a ogni giocatore, sempre fra 0 e 1', () => {
    strictEqual(qualita.size, listone.giocatori.length);
    for (const v of qualita.values()) ok(v >= 0 && v <= 1, `qualita fuori scala: ${v}`);
  });

  const valoriDi = (ruolo: 'P' | 'D' | 'C' | 'A'): number[] =>
    listone.giocatori.filter((g) => g.ruoloClassico === ruolo).map((g) => qualita.get(g.idEsterno)!);

  it('il migliore di ogni ruolo tocca 1', () => {
    for (const ruolo of ['P', 'D', 'C', 'A'] as const) {
      strictEqual(Math.max(...valoriDi(ruolo)), 1, `ruolo ${ruolo}: nessuno raggiunge 1`);
    }
  });

  it('il fondo di ogni ruolo condivide il rango medio dei pari merito', () => {
    // In tutti i ruoli il fondo del listone e' un plotone di riserve con
    // FVM M = 1 e Qt.A M = 1. Hanno lo stesso segnale, quindi devono avere la
    // stessa qualita': il rango medio del gruppo. La magnitudine di quel gruppo
    // vale 0 per costruzione, quindi il valore atteso e' calcolabile in modo
    // esatto, ed e' zero soltanto se in fondo c'e' un giocatore solo.
    for (const ruolo of ['P', 'D', 'C', 'A'] as const) {
      const delRuolo = listone.giocatori.filter((g) => g.ruoloClassico === ruolo);
      const segnali = delRuolo.map((g) => segnale(g, p));
      const minimo = Math.min(...segnali);
      const quantiInFondo = segnali.filter((s) => s === minimo).length;

      const atteso = (p.rating.mixRango * ((quantiInFondo - 1) / 2)) / (delRuolo.length - 1);
      strictEqual(
        Math.min(...valoriDi(ruolo)),
        atteso,
        `ruolo ${ruolo}: ${quantiInFondo} pari merito in fondo`,
      );
    }
  });

  it('i pari merito in fondo sono tanti: e’ il caso che il rango medio deve reggere', () => {
    const portieri = listone.giocatori.filter((g) => g.ruoloClassico === 'P');
    ok(portieri.filter((g) => g.valoreMercatoMantra <= 1).length > 20, 'premessa del test');
    const minimo = Math.min(...valoriDi('P'));
    const inFondo = portieri.filter((g) => qualita.get(g.idEsterno) === minimo);
    ok(inFondo.length > 10, `attesi molti pari merito in fondo, trovati ${inFondo.length}`);
  });

  it('a parita’ di segnale assegna la stessa qualita’', () => {
    const aUno = listone.giocatori.filter(
      (g) => g.ruoloClassico === 'P' && g.valoreMercatoMantra === 1 && g.quotazioneAstaMantra === 1,
    );
    ok(aUno.length > 5, 'premessa del test');
    const distinti = new Set(aUno.map((g) => qualita.get(g.idEsterno)));
    strictEqual(distinti.size, 1);
  });

  it('rispetta l’ordine del segnale dentro lo stesso ruolo', () => {
    const attaccanti = listone.giocatori
      .filter((g) => g.ruoloClassico === 'A')
      .sort((a, b) => segnale(a, p) - segnale(b, p));
    for (let i = 1; i < attaccanti.length; i++) {
      ok(
        qualita.get(attaccanti[i]!.idEsterno)! >= qualita.get(attaccanti[i - 1]!.idEsterno)!,
        `ordine violato fra ${attaccanti[i - 1]!.nome} e ${attaccanti[i]!.nome}`,
      );
    }
  });
});

describe('overall', () => {
  it('sta nella fascia configurata per il ruolo', () => {
    const fascia = p.rating.fasciaPerRuoloClassico.P;
    strictEqual(overallDaQualita(0, finto({ ruoloClassico: 'P' }), p), fascia.base);
    strictEqual(overallDaQualita(1, finto({ ruoloClassico: 'P' }), p), fascia.base + fascia.ampiezza);
  });

  it('cresce con la qualita’', () => {
    const riga = finto({});
    ok(overallDaQualita(0.2, riga, p) < overallDaQualita(0.8, riga, p));
  });

  it('la fascia dei portieri e’ piu’ stretta e piu’ alta di quella degli attaccanti', () => {
    // Fra il miglior portiere della Serie A e un titolare qualsiasi la distanza
    // reale e' molto minore che fra il miglior attaccante e una punta di meta'
    // classifica. E la terza scelta fra i pali non e' il peggior giocatore del
    // campionato: e' comunque un professionista. Le due fasce dicono questo.
    const portieri = p.rating.fasciaPerRuoloClassico.P;
    const attaccanti = p.rating.fasciaPerRuoloClassico.A;
    ok(portieri.ampiezza < attaccanti.ampiezza);
    ok(portieri.base > attaccanti.base);

    const peggiorPortiere = overallDaQualita(0, finto({ ruoloClassico: 'P' }), p);
    const peggiorAttaccante = overallDaQualita(0, finto({ ruoloClassico: 'A' }), p);
    ok(peggiorPortiere > peggiorAttaccante);
  });
});

describe('rating di area', () => {
  it('un giocatore medio ha tutte le aree al livello neutro', () => {
    const aree = areeDaOverall(p.rating.livelloNeutro, ['C'], p);
    deepStrictEqual(aree, {
      attacco: p.rating.livelloNeutro,
      difesa: p.rating.livelloNeutro,
      tecnica: p.rating.livelloNeutro,
      fisico: p.rating.livelloNeutro,
    });
  });

  it('la punta ha l’attacco sopra la difesa, il centrale il contrario', () => {
    const punta = areeDaOverall(85, ['Pc'], p);
    const centrale = areeDaOverall(85, ['Dc'], p);
    ok(punta.attacco > punta.difesa);
    ok(centrale.difesa > centrale.attacco);
    ok(punta.attacco > centrale.attacco);
    ok(centrale.difesa > punta.difesa);
  });

  it('un grande attaccante non diventa un pessimo difensore, solo un difensore medio', () => {
    // Se moltiplicassimo l'overall per il peso di ruolo invece di partire dal
    // livello neutro, il miglior attaccante del campionato risulterebbe il
    // peggior difensore del campionato, che non e' quello che vogliamo dire.
    const fortissimo = areeDaOverall(94, ['Pc'], p);
    const scarso = areeDaOverall(45, ['Pc'], p);
    ok(fortissimo.difesa > scarso.difesa);
    ok(fortissimo.difesa > p.rating.livelloNeutro);
    ok(fortissimo.difesa < 65, `difesa ${fortissimo.difesa}: troppo alta per una punta`);
  });

  it('il doppio ruolo sta in mezzo ai due profili puri, piu’ vicino al principale', () => {
    const ala = areeDaOverall(85, ['W'], p).attacco;
    const trequartista = areeDaOverall(85, ['T'], p).attacco;
    const misto = areeDaOverall(85, ['W', 'T'], p).attacco;
    ok(Math.min(ala, trequartista) <= misto && misto <= Math.max(ala, trequartista));
    ok(Math.abs(misto - ala) < Math.abs(misto - trequartista) || ala === trequartista);
  });

  it('l’ordine dei ruoli conta: W;T non e’ T;W', () => {
    const wt = areeDaOverall(85, ['W', 'T'], p);
    const tw = areeDaOverall(85, ['T', 'W'], p);
    ok(tw.tecnica > wt.tecnica);
  });
});

describe('potenziale', () => {
  const rng = () => generatore(12345);

  it('chi ha passato il picco non cresce piu’', () => {
    strictEqual(potenzialeDaOverall(80, 31, 27, p, rng()), 80);
    strictEqual(potenzialeDaOverall(80, 27, 27, p, rng()), 80);
  });

  it('il giovane ha un margine, e piu’ e’ giovane piu’ e’ ampio', () => {
    const a20 = potenzialeDaOverall(70, 20, 28, p, rng());
    const a26 = potenzialeDaOverall(70, 26, 28, p, rng());
    ok(a20 > a26);
    ok(a26 >= 70);
  });

  it('non supera mai il massimo configurato', () => {
    ok(potenzialeDaOverall(p.rating.massimo, 18, 30, p, rng()) <= p.rating.massimo);
  });
});

describe('derivazione completa', () => {
  const qualita = qualitaPerGiocatore(listone.giocatori, p);
  const deriva = (g: RigaListone) => derivaGiocatore(g, qualita.get(g.idEsterno)!, p, p.semeGlobale);

  it('e’ deterministica: stesso listone, stesso risultato', () => {
    for (const g of listone.giocatori.slice(0, 40)) deepStrictEqual(deriva(g), deriva(g));
  });

  it('il seme dipende dal giocatore, non dalla sua posizione nel listone', () => {
    // Se l'anno prossimo il listone cambia ordine, l'eta' di chi resta non deve
    // cambiare: e' la proprieta' che rende il seed rigenerabile senza sorprese.
    const uno = listone.giocatori[100]!;
    deepStrictEqual(
      derivaGiocatore(uno, qualita.get(uno.idEsterno)!, p, p.semeGlobale),
      derivaGiocatore({ ...uno, riga: 999 }, qualita.get(uno.idEsterno)!, p, p.semeGlobale),
    );
  });

  it('un seme globale diverso produce anagrafiche diverse', () => {
    const uno = listone.giocatori[100]!;
    const q = qualita.get(uno.idEsterno)!;
    const a = derivaGiocatore(uno, q, p, 'seme-a');
    const b = derivaGiocatore(uno, q, p, 'seme-b');
    strictEqual(a.aree.attacco !== b.aree.attacco || a.eta !== b.eta, true);
  });

  it('produce valori sempre dentro i limiti dichiarati', () => {
    for (const g of listone.giocatori) {
      const d = deriva(g);
      const { minimo, massimo } = p.rating;
      ok(d.overall >= minimo && d.overall <= massimo, `${g.nome}: overall ${d.overall}`);
      ok(d.potenziale >= d.overall, `${g.nome}: potenziale sotto l’overall`);
      ok(d.potenziale <= massimo, `${g.nome}: potenziale ${d.potenziale}`);
      ok(d.eta >= p.anagrafica.etaMinima && d.eta <= p.anagrafica.etaMassima, `${g.nome}: eta ${d.eta}`);
      for (const [nome, v] of Object.entries(d.propensioni)) {
        ok(v >= 0 && v <= 1, `${g.nome}: propensione ${nome} = ${v}`);
      }
      for (const [nome, v] of Object.entries(d.aree)) {
        ok(v >= minimo && v <= massimo, `${g.nome}: area ${nome} = ${v}`);
      }
    }
  });

  it('i portieri non hanno propensione al gol', () => {
    for (const g of listone.giocatori.filter((x) => x.ruoliMantra[0] === 'Por')) {
      strictEqual(deriva(g).propensioni.gol, 0);
    }
  });

  it('le punte segnano piu’ dei difensori centrali', () => {
    const media = (r: string): number => {
      const v = listone.giocatori
        .filter((g) => g.ruoliMantra[0] === r)
        .map((g) => deriva(g).propensioni.gol);
      return v.reduce((a, b) => a + b, 0) / v.length;
    };
    ok(media('Pc') > media('C'));
    ok(media('C') > media('Dc'));
  });
});

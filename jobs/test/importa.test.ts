/**
 * Test dell'importatore.
 *
 * Il caso felice parte dai due export reali; i casi di errore si costruiscono
 * guastandoli, una cosa alla volta, così ogni test dice esattamente quale
 * controllo sta verificando.
 */

import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict';
import { describe, it } from 'node:test';
import { importaRose } from '../src/importa.ts';
import {
  BUDGET, conRigaSostituita, contesto, riferimenti, riga, roseCompleto, roseMinimale,
} from './comune.ts';

/** Scorciatoia: importa e pretende che sia riuscito. */
function riuscito(contenuto: string, modalita: 'classic' | 'mantra' = 'classic') {
  const esito = importaRose(contenuto, contesto(modalita));
  if (!esito.riuscito) {
    throw new Error(`import fallito: ${esito.errori.map((e) => e.messaggio).join(' | ')}`);
  }
  return esito;
}

/** Scorciatoia: importa e pretende che sia fallito. */
function fallito(contenuto: string, modalita: 'classic' | 'mantra' = 'classic') {
  const esito = importaRose(contenuto, contesto(modalita));
  if (esito.riuscito) throw new Error('l’import doveva fallire e invece e’ riuscito');
  return esito;
}

/* ------------------------------------------------------------------ */

describe('il caso felice, sui file veri', () => {
  it('importa l’export completo', () => {
    const esito = riuscito(roseCompleto);
    strictEqual(esito.formato, 'completo');
    strictEqual(esito.squadre.length, 10);
    strictEqual(esito.squadre.reduce((a, s) => a + s.giocatori.length, 0), 250);
  });

  it('importa l’export minimale', () => {
    const esito = riuscito(roseMinimale);
    strictEqual(esito.formato, 'minimale');
    strictEqual(esito.squadre.length, 10);
  });

  it('i due formati producono le stesse rose', () => {
    // E' il punto per cui esiste un solo importatore: a valle non si deve
    // sapere da quale export si e' partiti.
    const chiave = (e: ReturnType<typeof riuscito>) =>
      e.squadre
        .map((s) => `${s.nome}:${s.giocatori.map((g) => `${g.giocatoreId}@${g.prezzo}`).sort().join(',')}`)
        .sort()
        .join('\n');
    strictEqual(chiave(riuscito(roseCompleto)), chiave(riuscito(roseMinimale)));
  });

  it('risolve ogni id esterno in un identificativo interno', () => {
    for (const s of riuscito(roseCompleto).squadre) {
      for (const g of s.giocatori) {
        ok(g.giocatoreId.startsWith('g'), `${g.idEsterno}: id interno inatteso "${g.giocatoreId}"`);
      }
    }
  });

  it('calcola spesa e crediti residui', () => {
    for (const s of riuscito(roseCompleto).squadre) {
      strictEqual(s.spesa + s.creditiResidui, BUDGET, s.nome);
      ok(s.spesa >= 482 && s.spesa <= 500, `${s.nome}: spesa ${s.spesa}`);
    }
  });

  it('nessuna discrepanza sui nomi, perche’ il join e’ esatto', () => {
    const suiNomi = riuscito(roseCompleto).avvisi.filter((a) => a.messaggio.includes('nome'));
    deepStrictEqual(suiNomi, []);
  });

  it('nessuna discrepanza sui ruoli Mantra, perche’ si confrontano insiemi', () => {
    // Su sedici righe su duecentocinquanta l'ordine dei ruoli differisce fra
    // export e listone. Confrontando le sequenze si otterrebbero sedici avvisi
    // falsi a ogni import; confrontando gli insiemi, nessuno.
    const suiRuoli = riuscito(roseCompleto).avvisi.filter((a) => a.messaggio.includes('ruoli Mantra'));
    deepStrictEqual(suiRuoli, []);
  });

  it('l’export reale non produce alcun avviso', () => {
    deepStrictEqual(riuscito(roseCompleto).avvisi, []);
  });
});

describe('copertura dei moduli', () => {
  it('ogni squadra riceve la copertura di tutti i moduli della modalita’', () => {
    // SPEC 6.1 chiede di mostrarla subito dopo l'import.
    for (const s of riuscito(roseCompleto).squadre) {
      strictEqual(s.copertura.length, 7, `${s.nome}: moduli classic`);
      for (const c of s.copertura) {
        ok(['perfetta', 'adattata', 'impossibile'].includes(c.livello), `${s.nome}/${c.modulo}`);
      }
    }
  });

  it('le rose 3-8-8-6 coprono tutti i moduli classic senza adattamenti', () => {
    for (const s of riuscito(roseCompleto).squadre) {
      for (const c of s.copertura) {
        strictEqual(c.livello, 'perfetta', `${s.nome}/${c.modulo}`);
      }
    }
  });

  it('in Mantra la copertura e’ sugli undici schemi', () => {
    for (const s of riuscito(roseCompleto, 'mantra').squadre) {
      strictEqual(s.copertura.length, 11, s.nome);
    }
  });
});

describe('id non trovato nel listone', () => {
  it('blocca l’import e spiega il rimedio', () => {
    // E' l'unico disallineamento previsto dalla specifica: listone piu'
    // recente dell'export.
    const originale = riga(roseCompleto, 2);
    const rotto = conRigaSostituita(roseCompleto, 2, originale.replace(',6966', ',999999'));
    const esito = fallito(rotto);

    const errore = esito.errori.find((e) => e.tipo === 'idSconosciuto')!;
    ok(errore, 'atteso un errore di id sconosciuto');
    strictEqual(errore.riga, 2);
    ok(errore.messaggio.includes('999999'));
    ok(errore.messaggio.includes('Butez'), 'il messaggio deve dire di chi si tratta');
    ok(errore.rimedio!.includes('Rigenerare'), 'il rimedio deve dire cosa fare');
  });

  it('se l’id e’ fra i ceduti lo dice, perche’ il rimedio e’ diverso', () => {
    const ceduto = riferimenti.ceduti[0]!;
    const originale = riga(roseCompleto, 2);
    const rotto = conRigaSostituita(roseCompleto, 2, originale.replace(',6966', `,${ceduto}`));
    const esito = fallito(rotto);

    const errore = esito.errori.find((e) => e.tipo === 'idCeduto')!;
    ok(errore, 'atteso un errore di id ceduto');
    ok(errore.messaggio.includes('ceduti'));
    ok(errore.rimedio!.includes('rimosso dalla rosa'));
  });
});

describe('validazioni', () => {
  it('nessun id duplicato nell’intero file, non solo dentro una squadra', () => {
    // Lo stesso giocatore in due rose diverse sarebbe un'asta da rifare.
    const originale = riga(roseCompleto, 30);
    const rotto = conRigaSostituita(
      roseCompleto,
      30,
      originale.replace(/,\d+$/, ',6966'), // id gia' usato da Fonzie alla riga 2
    );
    const esito = fallito(rotto);
    const errore = esito.errori.find((e) => e.tipo === 'idDuplicato')!;
    ok(errore, 'atteso un errore di id duplicato');
    ok(errore.messaggio.includes('riga 2'));
    ok(errore.messaggio.includes('riga 30'));
  });

  it('rifiuta un prezzo sotto un credito', () => {
    const originale = riga(roseCompleto, 2);
    const rotto = conRigaSostituita(roseCompleto, 2, originale.replace(',38,', ',0,'));
    const esito = fallito(rotto);
    ok(esito.errori.some((e) => e.tipo === 'prezzo' && e.messaggio.includes('minimo')));
  });

  it('rifiuta una spesa oltre il budget', () => {
    const originale = riga(roseCompleto, 2);
    const rotto = conRigaSostituita(roseCompleto, 2, originale.replace(',38,', ',900,'));
    const esito = fallito(rotto);
    const errore = esito.errori.find((e) => e.tipo === 'budget')!;
    ok(errore, 'atteso un errore di budget');
    ok(errore.messaggio.includes('Fonzie'));
    ok(errore.messaggio.includes('500'));
  });

  it('rifiuta una composizione sbagliata in classic', () => {
    // Tolta una riga, quella squadra ha 24 giocatori invece di 25 esatti.
    const righe = roseCompleto.split('\r\n');
    righe.splice(2, 1);
    const esito = fallito(righe.join('\r\n'));
    const errore = esito.errori.find((e) => e.tipo === 'composizione')!;
    ok(errore, 'attesa una violazione di composizione');
    ok(errore.messaggio.includes('Fonzie'));
  });

  it('la stessa rosa accorciata passa in Mantra, che ha solo un minimo', () => {
    // La composizione dipende dalla modalita': la domanda la fanno le regole,
    // non l'importatore, ed e' per questo che ce n'e' uno solo.
    const righe = roseCompleto.split('\r\n');
    righe.splice(2, 1);
    const esito = importaRose(righe.join('\r\n'), contesto('mantra'));
    strictEqual(esito.riuscito, true);
  });

  it('controlla il numero di squadre quando la lega lo prevede', () => {
    const esito = importaRose(roseCompleto, { ...contesto('classic'), squadreAttese: 12 });
    ok(!esito.riuscito);
    if (!esito.riuscito) {
      ok(esito.errori.some((e) => e.tipo === 'lega' && e.messaggio.includes('10 squadre')));
    }
  });
});

describe('discrepanze: avvisi, non errori', () => {
  it('un nome diverso non blocca l’import', () => {
    // I nomi sono un dato di visualizzazione: la chiave e' l'id.
    const originale = riga(roseCompleto, 2);
    const modificato = conRigaSostituita(roseCompleto, 2, originale.replace('"Butez"', '"Butezz"'));
    const esito = riuscito(modificato);
    ok(esito.avvisi.some((a) => a.tipo === 'discrepanza' && a.messaggio.includes('Butezz')));
  });

  it('un club diverso non blocca l’import', () => {
    const originale = riga(roseCompleto, 2);
    const modificato = conRigaSostituita(roseCompleto, 2, originale.replace('"COM"', '"JUV"'));
    const esito = riuscito(modificato);
    ok(esito.avvisi.some((a) => a.messaggio.includes('club "JUV"')));
  });

  it('una quotazione diversa non blocca l’import', () => {
    const originale = riga(roseCompleto, 2);
    const modificato = conRigaSostituita(roseCompleto, 2, originale.replace(',38,15,15,', ',38,99,15,'));
    const esito = riuscito(modificato);
    ok(esito.avvisi.some((a) => a.messaggio.includes('quotazione 99')));
  });

  it('in Mantra si confronta la quotazione Mantra, non quella classic', () => {
    // Le due divergono su 142 giocatori su 533: confrontare quella sbagliata
    // produrrebbe decine di avvisi falsi.
    const originale = riga(roseCompleto, 6); // Kalulu: Quotazione 13, Mantra 14
    ok(originale.includes(',13,14,'), 'premessa del test');

    const soloClassic = conRigaSostituita(roseCompleto, 6, originale.replace(',13,14,', ',99,14,'));
    deepStrictEqual(
      importaRose(soloClassic, contesto('mantra')).riuscito
        ? (importaRose(soloClassic, contesto('mantra')) as { avvisi: unknown[] }).avvisi
        : [],
      [],
      'in Mantra una quotazione classic diversa non deve dare avvisi',
    );

    const soloMantra = conRigaSostituita(roseCompleto, 6, originale.replace(',13,14,', ',13,99,'));
    const esito = importaRose(soloMantra, contesto('mantra'));
    ok(esito.riuscito);
    if (esito.riuscito) ok(esito.avvisi.some((a) => a.messaggio.includes('quotazione 99')));
  });

  it('il formato minimale non produce discrepanze, perche’ non ha campi da confrontare', () => {
    deepStrictEqual(riuscito(roseMinimale).avvisi, []);
  });
});

describe('atomicita’', () => {
  it('un solo errore fa fallire l’intero import', () => {
    // O passa tutto, o non passa niente: nove squadre su dieci non sono un
    // risultato accettabile.
    const originale = riga(roseCompleto, 2);
    const rotto = conRigaSostituita(roseCompleto, 2, originale.replace(',6966', ',999999'));
    const esito = fallito(rotto);
    ok(!('squadre' in esito), 'un esito fallito non deve portare squadre');
  });

  it('raccoglie tutti gli errori invece di fermarsi al primo', () => {
    // Chi corregge l'export vuole l'elenco completo, non scoprirne uno alla
    // volta a ogni tentativo.
    let rotto = roseCompleto;
    rotto = conRigaSostituita(rotto, 2, riga(rotto, 2).replace(',6966', ',999999'));
    rotto = conRigaSostituita(rotto, 3, riga(rotto, 3).replace(',2521', ',999998'));
    const esito = fallito(rotto);
    strictEqual(esito.errori.filter((e) => e.tipo === 'idSconosciuto').length, 2);
  });

  it('gli avvisi sopravvivono anche quando l’import fallisce', () => {
    // Servono a chi deve correggere: e' l'occasione per vederli tutti.
    let rotto = conRigaSostituita(roseCompleto, 2, riga(roseCompleto, 2).replace('"Butez"', '"Butezz"'));
    rotto = conRigaSostituita(rotto, 3, riga(rotto, 3).replace(',2521', ',999998'));
    const esito = fallito(rotto);
    ok(esito.avvisi.length > 0, 'gli avvisi devono restare visibili');
  });

  it('e’ deterministico', () => {
    strictEqual(
      JSON.stringify(importaRose(roseCompleto, contesto())),
      JSON.stringify(importaRose(roseCompleto, contesto())),
    );
  });
});

describe('errori di formato', () => {
  it('un file vuoto non passa', () => {
    const esito = importaRose('', contesto());
    ok(!esito.riuscito);
  });

  it('un file col solo separatore non passa', () => {
    const esito = importaRose('$,$,$', contesto());
    ok(!esito.riuscito);
    if (!esito.riuscito) ok(esito.errori.some((e) => e.messaggio.includes('nessuna riga')));
  });

  it('un errore di formato blocca prima di provare la riconciliazione', () => {
    const esito = importaRose('pippo,pluto', contesto());
    ok(!esito.riuscito);
    if (!esito.riuscito) {
      strictEqual(esito.errori.length, 1, 'un errore di formato non deve generarne altri a catena');
      strictEqual(esito.errori[0]!.tipo, 'formato');
    }
  });
});

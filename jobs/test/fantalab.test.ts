/**
 * Test della lettura dei due formati.
 *
 * `CLAUDE.md` chiede di coprire i casi limite **veri**, non quelli immaginati:
 * quasi tutti quelli qui sotto vengono dai due file reali in `/fixtures`, e
 * sono annotati in `fixtures/README.md`.
 */

import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict';
import { describe, it } from 'node:test';
import { haRitorniWindows, leggiCsv, spezzaRiga } from '../src/csv.ts';
import { leggiExport, riconosciFormato, ruoliDaCampo } from '../src/fantalab.ts';
import { conRigaSostituita, riga, roseCompleto, roseMinimale } from './comune.ts';

describe('lettura di una riga csv', () => {
  it('separa i campi semplici', () => {
    deepStrictEqual(spezzaRiga('a,b,c'), ['a', 'b', 'c']);
  });

  it('dentro le virgolette la virgola non separa', () => {
    // E' il caso dei ruoli Mantra negli export: "Dc,Dd" e' un campo solo.
    deepStrictEqual(spezzaRiga('"Fonzie","Kalulu","JUV","D","Dc,Dd",26'), [
      'Fonzie', 'Kalulu', 'JUV', 'D', 'Dc,Dd', '26',
    ]);
  });

  it('due virgolette di fila valgono una virgoletta', () => {
    deepStrictEqual(spezzaRiga('"a""b",c'), ['a"b', 'c']);
  });

  it('conserva i campi vuoti', () => {
    deepStrictEqual(spezzaRiga('a,,c'), ['a', '', 'c']);
    deepStrictEqual(spezzaRiga(',,'), ['', '', '']);
  });
});

describe('lettura di un file csv', () => {
  it('numera le righe come le mostra un editor', () => {
    const righe = leggiCsv('a\r\nb\r\nc');
    deepStrictEqual(righe.map((r) => r.numero), [1, 2, 3]);
  });

  it('accetta CRLF e LF indifferentemente', () => {
    strictEqual(leggiCsv('a,b\r\nc,d').length, 2);
    strictEqual(leggiCsv('a,b\nc,d').length, 2);
  });

  it('accetta un file senza ritorno a capo finale', () => {
    // Entrambe le fixture reali finiscono cosi'.
    strictEqual(leggiCsv('a,b\r\nc,d').length, 2);
    ok(!roseCompleto.endsWith('\r\n'), 'premessa: la fixture non ha il ritorno a capo finale');
  });

  it('toglie il BOM se c’e’', () => {
    strictEqual(leggiCsv('﻿a,b').at(0)!.campi[0], 'a');
  });

  it('salta le righe vuote senza sfasare la numerazione', () => {
    const righe = leggiCsv('a\r\n\r\nc');
    deepStrictEqual(righe.map((r) => r.numero), [1, 3]);
  });
});

describe('riconoscimento del formato', () => {
  it('riconosce i due file reali', () => {
    strictEqual(riconosciFormato(roseCompleto), 'completo');
    strictEqual(riconosciFormato(roseMinimale), 'minimale');
  });

  it('non si fida del nome del file', () => {
    strictEqual(riconosciFormato('$,$,$\r\nSquadra,1,2'), 'minimale');
  });

  it('respinge un file che non e’ ne’ l’uno ne’ l’altro', () => {
    strictEqual(riconosciFormato('pippo,pluto\r\n1,2'), null);
    const lettura = leggiExport('pippo,pluto\r\n1,2');
    ok(lettura.errori[0]!.messaggio.includes('Formato non riconosciuto'));
    ok(lettura.errori[0]!.messaggio.includes('$,$,$'), 'il messaggio deve dire cosa si attendeva');
  });

  it('respinge un file vuoto', () => {
    strictEqual(riconosciFormato(''), null);
  });
});

describe('formato completo: rose.csv', () => {
  const lettura = leggiExport(roseCompleto);

  it('legge le 250 righe senza errori', () => {
    deepStrictEqual(lettura.errori, []);
    strictEqual(lettura.formato, 'completo');
    strictEqual(lettura.righe.length, 250);
  });

  it('legge tutti i campi della prima riga', () => {
    const prima = lettura.righe[0]!;
    strictEqual(prima.squadra, 'Fonzie');
    strictEqual(prima.nome, 'Butez');
    strictEqual(prima.siglaClub, 'COM');
    strictEqual(prima.ruoloClassico, 'P');
    strictEqual(prima.ruoliMantra, 'Por');
    strictEqual(prima.prezzo, 38);
    strictEqual(prima.quotazione, 15);
    strictEqual(prima.quotazioneMantra, 15);
    strictEqual(prima.idEsterno, 6966);
    strictEqual(prima.riga, 2, 'la riga 1 e’ l’intestazione');
  });

  it('conserva gli accenti dei nomi', () => {
    const nomi = lettura.righe.map((r) => r.nome);
    for (const atteso of ['Calò', 'Soulè', 'Kessiè', 'Lucumì']) {
      ok(nomi.includes(atteso), `atteso "${atteso}" fra i nomi`);
    }
  });

  it('legge i nomi di squadra con spazi e &', () => {
    const squadre = new Set(lettura.righe.map((r) => r.squadra));
    ok(squadre.has('Pulpone & Loris'));
    ok(squadre.has('Maicol & Matteo'));
    strictEqual(squadre.size, 10);
  });

  it('legge i ruoli Mantra multipli dentro il campo quotato', () => {
    const kalulu = lettura.righe.find((r) => r.nome === 'Kalulu')!;
    strictEqual(kalulu.ruoliMantra, 'Dc,Dd');
    deepStrictEqual(ruoliDaCampo(kalulu.ruoliMantra!), ['Dc', 'Dd']);
  });

  it('segnala un’intestazione diversa, mostrando le due a confronto', () => {
    const rotto = conRigaSostituita(roseCompleto, 1, 'Squadra,Nome,Altro');
    const esito = leggiExport(rotto);
    strictEqual(esito.righe.length, 0, 'non deve leggere righe se l’intestazione non torna');
    ok(esito.errori[0]!.messaggio.includes('intestazione inattesa'));
    ok(esito.errori[0]!.messaggio.includes('attesa:'));
  });

  it('segnala una riga col numero di campi sbagliato, citando il numero di riga', () => {
    const rotto = conRigaSostituita(roseCompleto, 5, '"Fonzie","Gila","MIL"');
    const esito = leggiExport(rotto);
    const errore = esito.errori.find((e) => e.riga === 5)!;
    ok(errore, 'nessun errore sulla riga 5');
    ok(errore.messaggio.includes('3 campi invece di 9'));
  });

  it('segnala un prezzo non numerico', () => {
    const originale = riga(roseCompleto, 2);
    const rotto = conRigaSostituita(roseCompleto, 2, originale.replace(',38,', ',trentotto,'));
    const esito = leggiExport(rotto);
    ok(esito.errori.some((e) => e.riga === 2 && e.messaggio.includes('"Prezzo" non numerico')));
  });

  it('segnala una squadra senza nome', () => {
    const originale = riga(roseCompleto, 2);
    const rotto = conRigaSostituita(roseCompleto, 2, originale.replace('"Fonzie"', '""'));
    ok(leggiExport(rotto).errori.some((e) => e.riga === 2 && e.messaggio.includes('squadra fanta mancante')));
  });
});

describe('formato minimale: file_per_fantaleghe.csv', () => {
  const lettura = leggiExport(roseMinimale);

  it('legge le 250 righe saltando i separatori', () => {
    deepStrictEqual(lettura.errori, []);
    strictEqual(lettura.formato, 'minimale');
    strictEqual(lettura.righe.length, 250);
  });

  it('spezza sugli ultimi due separatori, non sul primo', () => {
    // E' il caso che conta: "Pulpone & Loris,6875,79" deve dare la squadra
    // intera, non "Pulpone & Loris" troncato o spostato.
    const suo = lettura.righe.find((r) => r.idEsterno === 6875)!;
    strictEqual(suo.squadra, 'Pulpone & Loris');
    strictEqual(suo.prezzo, 79);
  });

  it('non porta i campi ridondanti, che in questo formato non ci sono', () => {
    const prima = lettura.righe[0]!;
    strictEqual(prima.nome, undefined);
    strictEqual(prima.ruoliMantra, undefined);
    strictEqual(prima.quotazione, undefined);
  });

  it('tollera la coda tronca prevista dalla specifica', () => {
    const conCodaTronca = `${roseMinimale}\r\n$,`;
    const esito = leggiExport(conCodaTronca);
    deepStrictEqual(esito.errori, []);
    strictEqual(esito.righe.length, 250);
  });

  it('tollera un separatore con un numero diverso di colonne', () => {
    const esito = leggiExport('$,$,$\r\nSquadra,1,2\r\n$,$\r\nAltra,3,4');
    deepStrictEqual(esito.errori, []);
    strictEqual(esito.righe.length, 2);
  });

  it('segnala una riga senza separatori', () => {
    const esito = leggiExport('$,$,$\r\nrigaSenzaVirgole');
    ok(esito.errori.some((e) => e.messaggio.includes('senza separatori')));
  });
});

describe('i due file descrivono la stessa lega', () => {
  it('stessa squadra, stesso id, stesso prezzo, riga per riga', () => {
    // Se questo test fallisce, o una delle due letture ha un difetto oppure le
    // fixture non sono piu' coerenti fra loro.
    const chiave = (r: { squadra: string; idEsterno: number; prezzo: number }) =>
      `${r.squadra}|${r.idEsterno}|${r.prezzo}`;
    const completo = leggiExport(roseCompleto).righe.map(chiave).sort();
    const minimale = leggiExport(roseMinimale).righe.map(chiave).sort();
    deepStrictEqual(completo, minimale);
  });
});

describe('ruoli Mantra dal campo', () => {
  it('accetta la virgola degli export e il punto e virgola del listone', () => {
    deepStrictEqual(ruoliDaCampo('Dc,Dd'), ['Dc', 'Dd']);
    deepStrictEqual(ruoliDaCampo('Dd;Dc'), ['Dd', 'Dc']);
  });

  it('tollera gli spazi e i campi vuoti', () => {
    deepStrictEqual(ruoliDaCampo(' W , T '), ['W', 'T']);
    deepStrictEqual(ruoliDaCampo(''), []);
  });
});

describe('convenzioni dei file reali', () => {
  it('entrambe le fixture sono CRLF', () => {
    ok(haRitorniWindows(roseCompleto));
    ok(haRitorniWindows(roseMinimale));
  });
});

/**
 * Oltre ai controlli sul contenuto del seed, qui vivono i test che sorvegliano
 * i vincoli architetturali non negoziabili di CLAUDE.md. Sono test che non
 * verificano una funzione, ma una promessa: che i nomi restino dati e che
 * l'identificativo di Fantacalcio.it non entri nel mondo simulato.
 */

import { deepStrictEqual, notStrictEqual, ok, strictEqual, throws } from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { leggiListone } from '../src/listone.ts';
import { leggiConfigurazione } from '../src/configurazione.ts';
import { costruisciSeed, impronta } from '../src/costruisci.ts';

const contenuto = readFileSync(
  fileURLToPath(new URL('../Quotazioni_Fantacalcio_Stagione_2026_27.xlsx', import.meta.url)),
);
const listone = leggiListone(contenuto);
const configurazione = await leggiConfigurazione(
  fileURLToPath(new URL('../config', import.meta.url)),
);

const opzioni = { stagione: '2026-27', improntaListone: impronta(contenuto) };
const costruisci = (extra: Record<string, unknown> = {}) =>
  costruisciSeed(listone, configurazione, { ...opzioni, ...extra });

const { mondo, riferimenti, avvisi } = costruisci();

describe('contenuto del seed', () => {
  it('porta tutti i club e tutti i giocatori del listone', () => {
    strictEqual(mondo.club.length, 20);
    strictEqual(mondo.giocatori.length, 533);
    strictEqual(mondo.stagione, '2026-27');
  });

  it('non lascia avvisi sul listone ufficiale', () => {
    deepStrictEqual(avvisi, []);
  });

  it('ogni giocatore appartiene a un club esistente', () => {
    const id = new Set(mondo.club.map((c) => c.id));
    for (const g of mondo.giocatori) ok(id.has(g.clubId), `${g.nome}: club inesistente`);
  });

  it('gli identificativi sono unici', () => {
    strictEqual(new Set(mondo.giocatori.map((g) => g.id)).size, mondo.giocatori.length);
    strictEqual(new Set(mondo.club.map((c) => c.id)).size, mondo.club.length);
  });

  it('le abbreviazioni dei club sono uniche e di tre caratteri', () => {
    const abbreviazioni = mondo.club.map((c) => c.abbreviazione);
    strictEqual(new Set(abbreviazioni).size, abbreviazioni.length);
    ok(abbreviazioni.every((a) => a.length === 3), `abbreviazioni: ${abbreviazioni.join(' ')}`);
  });

  it('assegna esattamente i posti europei configurati', () => {
    const { posti } = configurazione.parametri.coppe;
    for (const [competizione, quanti] of Object.entries(posti)) {
      strictEqual(mondo.club.filter((c) => c.coppa === competizione).length, quanti, competizione);
    }
  });

  it('gli impegni europei vanno ai club piu’ forti', () => {
    const forza = (clubId: string): number =>
      mondo.giocatori
        .filter((g) => g.clubId === clubId)
        .map((g) => g.overall)
        .sort((a, b) => b - a)
        .slice(0, configurazione.parametri.coppe.giocatoriConsideratiPerForza)
        .reduce((a, b) => a + b, 0);

    const conCoppa = mondo.club.filter((c) => c.coppa !== null).map((c) => forza(c.id));
    const senza = mondo.club.filter((c) => c.coppa === null).map((c) => forza(c.id));
    ok(Math.min(...conCoppa) > Math.max(...senza));
  });
});

describe('vincolo: i nomi sono dati, mai codice', () => {
  it('con --anonimizza cambiano tutti i nomi, e nient’altro', () => {
    const anonimo = costruisci({ anonimizza: true });

    // Identificativi, rating, eta', ruoli, club: tutto identico. Cambia solo
    // l'etichetta. Se un giorno qualcosa a valle dipendesse da un nome reale,
    // questo confronto e' il punto in cui ce ne accorgeremmo.
    strictEqual(anonimo.mondo.giocatori.length, mondo.giocatori.length);
    anonimo.mondo.giocatori.forEach((g, i) => {
      const originale = mondo.giocatori[i]!;
      strictEqual(g.id, originale.id);
      strictEqual(g.clubId, originale.clubId);
      strictEqual(g.overall, originale.overall);
      strictEqual(g.eta, originale.eta);
      deepStrictEqual(g.ruoliMantra, originale.ruoliMantra);
      deepStrictEqual(g.rating, originale.rating);
      notStrictEqual(g.nome, originale.nome);
    });

    anonimo.mondo.club.forEach((c, i) => {
      strictEqual(c.id, mondo.club[i]!.id);
      notStrictEqual(c.nome, mondo.club[i]!.nome);
    });
    strictEqual(anonimo.mondo.sorgente.anonimizzato, true);
  });

  it('il seed anonimo non contiene piu’ nessun nome reale', () => {
    const anonimo = costruisci({ anonimizza: true });
    const testo = JSON.stringify(anonimo.mondo);
    for (const nome of ['Svilar', 'Calhanoglu', 'Inter', 'Juventus', 'Atalanta']) {
      ok(!testo.includes(nome), `il nome "${nome}" sopravvive nel seed anonimo`);
    }
  });

  it('i nomi inventati sono stabili fra due generazioni', () => {
    deepStrictEqual(
      costruisci({ anonimizza: true }).mondo.giocatori.map((g) => g.nome),
      costruisci({ anonimizza: true }).mondo.giocatori.map((g) => g.nome),
    );
  });
});

describe('vincolo: il Fantacalcio_Id resta un riferimento esterno', () => {
  it('il mondo simulato non contiene nessun identificativo esterno', () => {
    // La chiave del dominio e' l'id interno. Se un giorno qualcuno indicizzasse
    // il mondo sull'id di Fantacalcio.it, il vincolo sui nomi cadrebbe con lui.
    //
    // Si confrontano i valori, non il testo del JSON: cercare "572" dentro la
    // serializzazione lo troverebbe dentro una propensione di 0.572. E si
    // guardano i soli id da 100 in su, perche' sotto quella soglia un id
    // coinciderebbe per caso con un rating o con un'eta'. Sono 3 id su 533.
    const esterni = new Set(
      listone.giocatori.map((g) => g.idEsterno).filter((id) => id >= 100),
    );
    ok(esterni.size > 500, 'premessa del test');

    const trovati: unknown[] = [];
    const percorri = (v: unknown): void => {
      if (Array.isArray(v)) v.forEach(percorri);
      else if (v && typeof v === 'object') Object.values(v).forEach(percorri);
      else if (typeof v === 'number' && esterni.has(v)) trovati.push(v);
      else if (typeof v === 'string' && esterni.has(Number(v))) trovati.push(v);
    };
    percorri(mondo);

    deepStrictEqual(trovati, [], 'identificativi esterni trovati dentro il mondo simulato');
  });

  it('nessun campo del mondo si chiama come l’identificativo esterno', () => {
    const chiavi = new Set<string>();
    const percorri = (v: unknown): void => {
      if (Array.isArray(v)) v.forEach(percorri);
      else if (v && typeof v === 'object') {
        for (const [k, valore] of Object.entries(v)) {
          chiavi.add(k);
          percorri(valore);
        }
      }
    };
    percorri(mondo);
    for (const proibita of ['idEsterno', 'fantacalcioId', 'Fantacalcio_Id']) {
      ok(!chiavi.has(proibita), `il mondo espone il campo "${proibita}"`);
    }
  });

  it('i riferimenti esterni coprono ogni giocatore e ogni club', () => {
    strictEqual(riferimenti.giocatori.length, mondo.giocatori.length);
    strictEqual(riferimenti.club.length, mondo.club.length);

    const idInterni = new Set(mondo.giocatori.map((g) => g.id));
    for (const r of riferimenti.giocatori) ok(idInterni.has(r.giocatoreId));
  });

  it('il join con gli export Fantalab passa dall’identificativo esterno', () => {
    const perId = new Map(riferimenti.giocatori.map((r) => [r.idEsterno, r]));
    strictEqual(perId.size, riferimenti.giocatori.length);
    // 5841 e' Svilar nel listone 2026/27: e' la riga che un export Fantalab
    // porterebbe con se', e deve risolversi al giocatore interno giusto.
    const svilar = perId.get(5841)!;
    ok(svilar);
    strictEqual(mondo.giocatori.find((g) => g.id === svilar.giocatoreId)!.nome, 'Svilar');
  });

  it('conserva le sigle a tre lettere degli export Fantalab', () => {
    const sigle = riferimenti.club.map((c) => c.sigla).sort();
    deepStrictEqual(sigle, [
      'ATA', 'BOL', 'CAG', 'COM', 'FIO', 'FRO', 'GEN', 'INT', 'JUV', 'LAZ',
      'LEC', 'MIL', 'MON', 'NAP', 'PAR', 'ROM', 'SAS', 'TOR', 'UDI', 'VEN',
    ]);
  });

  it('elenca i ceduti, cosi’ l’importatore sa spiegare un id non trovato', () => {
    strictEqual(riferimenti.ceduti.length, 63);
    deepStrictEqual(riferimenti.ceduti, [...riferimenti.ceduti].sort((a, b) => a - b));
  });
});

describe('riproducibilita’', () => {
  it('due costruzioni dello stesso listone danno lo stesso identico seed', () => {
    // Serve per i test, per la calibrazione e per dirimere le contestazioni:
    // nessun timestamp e nessun Math.random dentro il seed.
    strictEqual(JSON.stringify(costruisci().mondo), JSON.stringify(costruisci().mondo));
    strictEqual(
      JSON.stringify(costruisci().riferimenti),
      JSON.stringify(costruisci().riferimenti),
    );
  });

  it('registra l’impronta del listone di partenza', () => {
    strictEqual(mondo.sorgente.impronta, impronta(contenuto));
    strictEqual(mondo.sorgente.impronta.length, 64);
  });

  it('l’ordine dei club non dipende dall’ordine del listone', () => {
    const nomi = mondo.club.map((c) => c.nome);
    deepStrictEqual(nomi, [...nomi].sort((a, b) => a.localeCompare(b, 'it')));
  });
});

describe('configurazione e casi di errore', () => {
  it('si ferma se il listone porta un club assente da club.json', () => {
    const ridotta = { ...configurazione, club: configurazione.club.filter((c) => c.sigla !== 'INT') };
    throws(
      () => costruisciSeed(listone, ridotta, opzioni),
      /Club presenti nel listone ma assenti da config\/club\.json: Inter/,
    );
  });

  it('avvisa, senza fermarsi, se un club configurato non ha giocatori', () => {
    const allargata = {
      ...configurazione,
      club: [...configurazione.club, { nome: 'Pisa', sigla: 'PIS', colore: '#000000', coppa: null }],
    };
    const risultato = costruisciSeed(listone, allargata, opzioni);
    strictEqual(risultato.mondo.club.length, 20);
    ok(risultato.avvisi.some((a) => a.tipo === 'club' && a.messaggio.includes('Pisa')));
  });

  it('applica gli override manuali e allinea il potenziale', () => {
    const conOverride = {
      ...configurazione,
      override: new Map([[5841, { eta: 31, overall: 88 }]]),
    };
    const risultato = costruisciSeed(listone, conOverride, opzioni);
    const svilar = risultato.mondo.giocatori.find(
      (g) => g.id === risultato.riferimenti.giocatori.find((r) => r.idEsterno === 5841)!.giocatoreId,
    )!;
    strictEqual(svilar.eta, 31);
    strictEqual(svilar.overall, 88);
    ok(svilar.potenziale >= 88, 'il potenziale non puo’ restare sotto l’overall');
  });

  it('avvisa se un override non corrisponde a nessun giocatore', () => {
    const conOverride = { ...configurazione, override: new Map([[999999, { eta: 25 }]]) };
    const risultato = costruisciSeed(listone, conOverride, opzioni);
    ok(risultato.avvisi.some((a) => a.tipo === 'override' && a.messaggio.includes('999999')));
  });

  it('usa le assegnazioni manuali quando le coppe sono in modalita’ elenco', () => {
    const manuale = {
      ...configurazione,
      parametri: {
        ...configurazione.parametri,
        coppe: { ...configurazione.parametri.coppe, modalita: 'elenco' as const },
      },
      club: configurazione.club.map((c) =>
        c.sigla === 'VEN' ? { ...c, coppa: 'champions' as const } : { ...c, coppa: null },
      ),
    };
    const risultato = costruisciSeed(listone, manuale, opzioni);
    const venezia = risultato.mondo.club.find((c) => c.nome === 'Venezia')!;
    strictEqual(venezia.coppa, 'champions');
    strictEqual(risultato.mondo.club.filter((c) => c.coppa !== null).length, 1);
  });
});

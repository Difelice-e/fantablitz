/**
 * Test dell'archivio e del passaggio fra stato salvato e lega giocabile.
 *
 * Due proprieta' valgono piu' delle altre, e sono quelle per cui l'archivio e'
 * fatto cosi': che una scrittura interrotta non lasci una lega mezza scritta, e
 * che rigiocare le stesse giornate con le stesse formazioni dia lo stesso
 * identico esito. La seconda e' la regola 6, e ora che le formazioni cambiano
 * nel tempo non e' piu' gratis.
 */

import { deepStrictEqual, ok, rejects, strictEqual, throws } from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  archivioInMemoria, archivioSuFile, validaStatoLega,
  VERSIONE_STATO, type StatoLega,
} from '../src/archivio.ts';
import {
  formazionePerGiornata, formazioneDaSalvata, salvataDaFormazione, statoDaImport,
} from '../src/lega.ts';

/* ------------------------------------------------------------------ */

function statoDiProva(modifiche: Partial<StatoLega> = {}): StatoLega {
  return {
    versione: VERSIONE_STATO,
    id: 'prova',
    nome: 'Lega di prova',
    seme: 'prova',
    modalita: 'classic',
    budget: 500,
    giornateGiocate: 0,
    amministratore: null,
    squadre: [
      { id: 'Uno', nome: 'Uno', proprietario: null, giocatori: [{ giocatoreId: 'a', prezzo: 10 }] },
      { id: 'Due', nome: 'Due', proprietario: null, giocatori: [{ giocatoreId: 'b', prezzo: 20 }] },
    ],
    formazioni: [],
    scambi: [],
    ...modifiche,
  };
}

/* ------------------------------------------------------------------ */

describe('validazione dello stato', () => {
  it('accetta uno stato sensato', () => {
    ok(validaStatoLega(statoDiProva()));
  });

  it('rifiuta una versione che non conosce', () => {
    // Un file lasciato indietro da una versione precedente deve fermarsi qui,
    // non tre schermate piu' avanti.
    throws(() => validaStatoLega(statoDiProva({ versione: 99 })), /versione 99/);
  });

  it('rifiuta lo stesso giocatore in due rose', () => {
    // E' l'invariante che rende sensata una lega, e un import andato storto e'
    // il modo piu' facile di romperla.
    throws(
      () =>
        validaStatoLega(
          statoDiProva({
            squadre: [
              { id: 'Uno', nome: 'Uno', proprietario: null, giocatori: [{ giocatoreId: 'a', prezzo: 1 }] },
              { id: 'Due', nome: 'Due', proprietario: null, giocatori: [{ giocatoreId: 'a', prezzo: 1 }] },
            ],
          }),
        ),
      /sia di Uno sia di Due/,
    );
  });

  it('rifiuta lo stesso giocatore due volte nella stessa rosa', () => {
    throws(
      () =>
        validaStatoLega(
          statoDiProva({
            squadre: [
              {
                id: 'Uno', nome: 'Uno', proprietario: null,
                giocatori: [{ giocatoreId: 'a', prezzo: 1 }, { giocatoreId: 'a', prezzo: 2 }],
              },
            ],
          }),
        ),
      /due volte in rosa/,
    );
  });

  it('rifiuta un titolare schierato in due caselle', () => {
    throws(
      () =>
        validaStatoLega(
          statoDiProva({
            formazioni: [
              { squadraId: 'Uno', giornata: 1, modulo: '4-4-2', titolari: [['P1', 'a'], ['D1', 'a']], panchina: [] },
            ],
          }),
        ),
      /schierato due volte/,
    );
  });

  it('rifiuta una formazione di una squadra che non esiste', () => {
    throws(
      () =>
        validaStatoLega(
          statoDiProva({
            formazioni: [{ squadraId: 'Tre', giornata: 1, modulo: '4-4-2', titolari: [], panchina: [] }],
          }),
        ),
      /squadra inesistente/,
    );
  });

  it('rifiuta uno scambio con una squadra inesistente', () => {
    throws(
      () =>
        validaStatoLega(
          statoDiProva({
            scambi: [{
              id: '1', daSquadraId: 'Uno', aSquadraId: 'Tre', offerti: ['a'], richiesti: ['b'],
              stato: 'proposto', motivo: null, creatoIl: 'ora', risoltoIl: null,
            }],
          }),
        ),
      /squadra inesistente/,
    );
  });

  it('rifiuta uno scambio senza giocatori da una parte', () => {
    throws(
      () =>
        validaStatoLega(
          statoDiProva({
            scambi: [{
              id: '1', daSquadraId: 'Uno', aSquadraId: 'Due', offerti: [], richiesti: ['b'],
              stato: 'proposto', motivo: null, creatoIl: 'ora', risoltoIl: null,
            }],
          }),
        ),
      /nessun giocatore offerto/,
    );
  });

  it('rifiuta due scambi con lo stesso id', () => {
    const scambio = {
      id: '1', daSquadraId: 'Uno', aSquadraId: 'Due', offerti: ['a'], richiesti: ['b'],
      stato: 'proposto' as const, motivo: null, creatoIl: 'ora', risoltoIl: null,
    };
    throws(
      () => validaStatoLega(statoDiProva({ scambi: [scambio, scambio] })),
      /scambio duplicato/,
    );
  });
});

/* ------------------------------------------------------------------ */

describe('archivio su file', () => {
  it('scrive e rilegge identico', async () => {
    const cartella = await mkdtemp(join(tmpdir(), 'fantablitz-'));
    const archivio = archivioSuFile(cartella);
    const stato = statoDiProva();

    await archivio.scrivi(stato);
    deepStrictEqual(await archivio.leggi('prova'), stato);
  });

  it('una lega che non c’e’ e’ null, non un errore', async () => {
    const cartella = await mkdtemp(join(tmpdir(), 'fantablitz-'));
    strictEqual(await archivioSuFile(cartella).leggi('nessuna'), null);
  });

  it('una cartella che non esiste da’ un elenco vuoto', async () => {
    deepStrictEqual(await archivioSuFile(join(tmpdir(), 'non-esiste-proprio')).elenca(), []);
  });

  it('non lascia file temporanei in giro', async () => {
    const cartella = await mkdtemp(join(tmpdir(), 'fantablitz-'));
    const archivio = archivioSuFile(cartella);
    await archivio.scrivi(statoDiProva());
    await archivio.scrivi(statoDiProva({ giornateGiocate: 3 }));
    const elenco = await archivio.elenca();
    strictEqual(elenco.length, 1, 'due scritture non devono produrre due leghe');
    strictEqual((await archivio.leggi('prova'))!.giornateGiocate, 3);
  });

  it('un file illeggibile non nasconde le altre leghe', async () => {
    const cartella = await mkdtemp(join(tmpdir(), 'fantablitz-'));
    const archivio = archivioSuFile(cartella);
    await archivio.scrivi(statoDiProva());
    await writeFile(join(cartella, 'rotta.json'), '{ non e', 'utf8');
    const elenco = await archivio.elenca();
    strictEqual(elenco.length, 1);
    strictEqual(elenco[0]!.id, 'prova');
  });

  it('rifiuta di scrivere uno stato non valido', async () => {
    // Meglio un errore in faccia che un file da cui non si torna indietro.
    const cartella = await mkdtemp(join(tmpdir(), 'fantablitz-'));
    await rejects(
      () => archivioSuFile(cartella).scrivi(statoDiProva({ squadre: [] })),
      /senza squadre/,
    );
    deepStrictEqual(await archivioSuFile(cartella).elenca(), []);
  });

  it('il JSON scritto si legge a occhio', async () => {
    // Un file di stato che nessuno puo’ aprire e capire e’ un file che nessuno
    // puo’ correggere a mano quando serve.
    const cartella = await mkdtemp(join(tmpdir(), 'fantablitz-'));
    await archivioSuFile(cartella).scrivi(statoDiProva());
    const testo = await readFile(join(cartella, 'prova.json'), 'utf8');
    ok(testo.includes('\n  "nome": "Lega di prova"'), 'deve essere indentato');
    ok(testo.endsWith('\n'), 'deve finire con un a capo');
  });
});

describe('archivio in memoria', () => {
  it('si comporta come quello su file', async () => {
    const archivio = archivioInMemoria([statoDiProva()]);
    strictEqual((await archivio.leggi('prova'))!.nome, 'Lega di prova');
    strictEqual(await archivio.leggi('altra'), null);
    deepStrictEqual(await archivio.elenca(), [{ id: 'prova', nome: 'Lega di prova' }]);
  });

  it('non restituisce riferimenti al proprio stato', async () => {
    // Senza la copia, chi legge potrebbe modificare l'archivio per sbaglio, e
    // il bug si manifesterebbe tre schermate dopo.
    const archivio = archivioInMemoria([statoDiProva()]);
    const letto = await archivio.leggi('prova');
    letto!.giornateGiocate = 99;
    strictEqual((await archivio.leggi('prova'))!.giornateGiocate, 0);
  });
});

/* ------------------------------------------------------------------ */

describe('formazioni nel tempo', () => {
  const stato = statoDiProva({
    formazioni: [
      { squadraId: 'Uno', giornata: 1, modulo: '4-4-2', titolari: [['P1', 'a']], panchina: [] },
      { squadraId: 'Uno', giornata: 5, modulo: '3-4-3', titolari: [['P1', 'a']], panchina: [] },
    ],
  });

  it('chi non tocca niente scende in campo come l’ultima volta', () => {
    // La proprieta' che ci si aspetta: alla giornata 7, senza aver schierato,
    // vale quello che era salvato alla 5.
    strictEqual(formazionePerGiornata(stato, 'Uno', 7)?.modulo, '3-4-3');
    strictEqual(formazionePerGiornata(stato, 'Uno', 5)?.modulo, '3-4-3');
  });

  it('una giornata non vede le formazioni salvate dopo', () => {
    // E' quello che tiene in piedi l'idempotenza: l'esito della giornata 3
    // non puo' cambiare perche' qualcuno ha schierato per la 5.
    strictEqual(formazionePerGiornata(stato, 'Uno', 3)?.modulo, '4-4-2');
    strictEqual(formazionePerGiornata(stato, 'Uno', 4)?.modulo, '4-4-2');
  });

  it('prima della prima formazione non c’e’ niente', () => {
    strictEqual(formazionePerGiornata(statoDiProva(), 'Uno', 1), null);
  });

  it('le squadre non si scambiano le formazioni', () => {
    strictEqual(formazionePerGiornata(stato, 'Due', 7), null);
  });

  it('andata e ritorno fra mappa e coppie non perde niente', () => {
    const formazione = {
      modulo: '4-3-3',
      titolari: new Map([['P1', 'x'], ['D1', 'y']]),
      panchina: ['z', 'w'],
    };
    const tornata = formazioneDaSalvata(salvataDaFormazione('Uno', 2, formazione));
    strictEqual(tornata.modulo, formazione.modulo);
    deepStrictEqual([...tornata.titolari.entries()], [...formazione.titolari.entries()]);
    deepStrictEqual(tornata.panchina, formazione.panchina);
  });
});

describe('creazione da un import', () => {
  it('trasforma le squadre importate in stato salvabile', () => {
    const stato = statoDaImport(
      { id: 'x', nome: 'X', seme: 's', modalita: 'mantra', budget: 500, amministratore: 'admin@prova.it' },
      [
        { nome: 'Alfa', giocatori: [{ giocatoreId: 'a', idEsterno: 1, prezzo: 30 }], spesa: 30, creditiResidui: 470, copertura: [] },
      ],
    );
    ok(validaStatoLega(stato));
    strictEqual(stato.giornateGiocate, 0, 'una lega nuova non ha giocato niente');
    strictEqual(stato.formazioni.length, 0);
    strictEqual(stato.squadre[0]!.giocatori[0]!.prezzo, 30, 'il prezzo pagato si conserva');
    strictEqual(stato.amministratore, 'admin@prova.it', 'chi crea la lega ne e\' amministratore');
  });
});

/* ------------------------------------------------------------------ */

/**
 * Le due implementazioni locali devono comportarsi allo stesso modo.
 *
 * Un contratto con due implementazioni che divergono e' peggio di nessun
 * contratto: il codice funziona in sviluppo e sbaglia in produzione. Qui si
 * prova la stessa suite su entrambe. La terza implementazione, quella su
 * Supabase, non si puo' provare senza un database e resta scoperta: e' il
 * motivo per cui le tre scrivono meno codice possibile ciascuna.
 */
for (const [nome, costruisci] of [
  ['in memoria', async () => archivioInMemoria([statoDiProva()])],
  [
    'su file',
    async () => {
      const cartella = await mkdtemp(join(tmpdir(), 'fantablitz-'));
      const a = archivioSuFile(cartella);
      await a.scrivi(statoDiProva());
      return a;
    },
  ],
] as const) {
  describe(`contratto dell'archivio, ${nome}`, () => {
    it('salva una formazione senza toccare le altre', async () => {
      const archivio = await costruisci();
      await archivio.salvaFormazione('prova', {
        squadraId: 'Uno', giornata: 1, modulo: '4-4-2', titolari: [['P1', 'a']], panchina: [],
      });
      await archivio.salvaFormazione('prova', {
        squadraId: 'Due', giornata: 1, modulo: '3-4-3', titolari: [['P1', 'b']], panchina: [],
      });

      const stato = await archivio.leggi('prova');
      strictEqual(stato!.formazioni.length, 2, 'la seconda non deve cancellare la prima');
      strictEqual(stato!.formazioni.find((f) => f.squadraId === 'Uno')!.modulo, '4-4-2');
      strictEqual(stato!.formazioni.find((f) => f.squadraId === 'Due')!.modulo, '3-4-3');
    });

    it('rischierare la stessa giornata sostituisce, non aggiunge', async () => {
      const archivio = await costruisci();
      for (const modulo of ['4-4-2', '3-5-2', '4-3-3']) {
        await archivio.salvaFormazione('prova', {
          squadraId: 'Uno', giornata: 3, modulo, titolari: [['P1', 'a']], panchina: [],
        });
      }
      const stato = await archivio.leggi('prova');
      strictEqual(stato!.formazioni.length, 1, 'tre salvataggi, una formazione');
      strictEqual(stato!.formazioni[0]!.modulo, '4-3-3', 'vale l’ultima');
    });

    it('giornate diverse convivono', async () => {
      const archivio = await costruisci();
      await archivio.salvaFormazione('prova', {
        squadraId: 'Uno', giornata: 1, modulo: '4-4-2', titolari: [], panchina: [],
      });
      await archivio.salvaFormazione('prova', {
        squadraId: 'Uno', giornata: 2, modulo: '3-4-3', titolari: [], panchina: [],
      });
      const stato = await archivio.leggi('prova');
      strictEqual(stato!.formazioni.length, 2);
    });

    it('segna le giornate giocate', async () => {
      const archivio = await costruisci();
      await archivio.segnaGiornateGiocate('prova', 5);
      strictEqual((await archivio.leggi('prova'))!.giornateGiocate, 5);
    });

    it('segnare due volte lo stesso numero non cambia niente', async () => {
      // E' l'idempotenza del job serale, ridotta all'osso: l'unica cosa che
      // scrive e' questo numero.
      const archivio = await costruisci();
      await archivio.segnaGiornateGiocate('prova', 7);
      const prima = await archivio.leggi('prova');
      await archivio.segnaGiornateGiocate('prova', 7);
      deepStrictEqual(await archivio.leggi('prova'), prima);
    });

    it('scrivere su una lega che non esiste e’ un errore, non un silenzio', async () => {
      const archivio = await costruisci();
      await rejects(
        () => archivio.segnaGiornateGiocate('inesistente', 1),
        /inesistente/i,
      );
    });

    it('propone uno scambio, che resta in attesa', async () => {
      const archivio = await costruisci();
      await archivio.proponiScambio('prova', {
        id: 's1', daSquadraId: 'Uno', aSquadraId: 'Due', offerti: ['a'], richiesti: ['b'],
        stato: 'proposto', motivo: null, creatoIl: '2026-01-01T00:00:00.000Z', risoltoIl: null,
      });
      const stato = await archivio.leggi('prova');
      strictEqual(stato!.scambi.length, 1);
      strictEqual(stato!.scambi[0]!.stato, 'proposto');
      // Le rose non si toccano finche' non e' risolto.
      deepStrictEqual(stato!.squadre.find((s) => s.id === 'Uno')!.giocatori.map((g) => g.giocatoreId), ['a']);
    });

    it('risolvere uno scambio accettato sposta i giocatori fra le rose', async () => {
      const archivio = await costruisci();
      await archivio.proponiScambio('prova', {
        id: 's1', daSquadraId: 'Uno', aSquadraId: 'Due', offerti: ['a'], richiesti: ['b'],
        stato: 'proposto', motivo: null, creatoIl: '2026-01-01T00:00:00.000Z', risoltoIl: null,
      });
      await archivio.risolviScambio('prova', {
        id: 's1', daSquadraId: 'Uno', aSquadraId: 'Due', offerti: ['a'], richiesti: ['b'],
        stato: 'accettato', motivo: null, creatoIl: '2026-01-01T00:00:00.000Z', risoltoIl: '2026-01-02T00:00:00.000Z',
      });
      const stato = await archivio.leggi('prova');
      strictEqual(stato!.scambi[0]!.stato, 'accettato');
      deepStrictEqual(stato!.squadre.find((s) => s.id === 'Uno')!.giocatori.map((g) => g.giocatoreId), ['b']);
      deepStrictEqual(stato!.squadre.find((s) => s.id === 'Due')!.giocatori.map((g) => g.giocatoreId), ['a']);
      // Il prezzo pagato all'asta resta legato al giocatore, non alla squadra.
      strictEqual(stato!.squadre.find((s) => s.id === 'Due')!.giocatori[0]!.prezzo, 10);
    });

    it('risolvere uno scambio rifiutato non tocca le rose', async () => {
      const archivio = await costruisci();
      await archivio.proponiScambio('prova', {
        id: 's1', daSquadraId: 'Uno', aSquadraId: 'Due', offerti: ['a'], richiesti: ['b'],
        stato: 'proposto', motivo: null, creatoIl: '2026-01-01T00:00:00.000Z', risoltoIl: null,
      });
      await archivio.risolviScambio('prova', {
        id: 's1', daSquadraId: 'Uno', aSquadraId: 'Due', offerti: ['a'], richiesti: ['b'],
        stato: 'rifiutato', motivo: 'troppo sbilanciato', creatoIl: '2026-01-01T00:00:00.000Z',
        risoltoIl: '2026-01-02T00:00:00.000Z',
      });
      const stato = await archivio.leggi('prova');
      strictEqual(stato!.scambi[0]!.stato, 'rifiutato');
      deepStrictEqual(stato!.squadre.find((s) => s.id === 'Uno')!.giocatori.map((g) => g.giocatoreId), ['a']);
      deepStrictEqual(stato!.squadre.find((s) => s.id === 'Due')!.giocatori.map((g) => g.giocatoreId), ['b']);
    });
  });
}

/**
 * Test del ciclo di vita di uno scambio (SPEC 6.5): proposta, risposta, storico.
 */

import { deepStrictEqual, ok, rejects, strictEqual, throws } from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { indicizza, caricaMondo, type MondoIndicizzato } from '../../engine/src/mondo.ts';
import {
  validaParametriMotore, validaParametriVoto,
  type ParametriMotore, type ParametriVoto,
} from '../../engine/src/configurazione.ts';
import { simulaStagione, type StagioneSimulata } from '../../engine/src/stagione.ts';
import { archivioInMemoria } from '../src/archivio.ts';
import { importaRose } from '../src/importa.ts';
import { statoDaImport, type ContestoMondo } from '../src/lega.ts';
import type { StatoLega } from '../src/archivio.ts';
import {
  proponiScambio, ritiraScambio, rispondiScambio, scambiAccettatiInStagione, scambiDiSquadra,
  validaProposta,
} from '../src/scambi.ts';
import { validaConfigurazioneScambi, type ConfigurazioneScambi } from '../src/valutazione.ts';
import { regoleClassic, type ConfigurazioneClassic } from '../../fanta/src/classic.ts';
import { regoleMantra, type ConfigurazioneMantra } from '../../fanta/src/mantra.ts';
import { validaConfigurazioneLega, type ConfigurazioneLega } from '../../fanta/src/fantavoto.ts';
import { contesto, mondo as mondoJson, roseCompleto } from './comune.ts';

const json = (percorso: string): any =>
  JSON.parse(readFileSync(fileURLToPath(new URL(percorso, import.meta.url)), 'utf8'));

const mondo: MondoIndicizzato = indicizza(caricaMondo(mondoJson));
const motore = validaParametriMotore(json('../../engine/config/motore.json') as ParametriMotore);
const voto = validaParametriVoto(json('../../engine/config/voto.json') as ParametriVoto);
const punteggio = validaConfigurazioneLega(json('../../fanta/config/lega.json') as ConfigurazioneLega);
const configScambi = validaConfigurazioneScambi(json('../../fanta/config/scambi.json') as ConfigurazioneScambi);
const regole = {
  classic: regoleClassic(json('../../fanta/config/classic.json') as ConfigurazioneClassic),
  mantra: regoleMantra(json('../../fanta/config/mantra.json') as ConfigurazioneMantra),
};

const SEME = 'seme-di-prova-scambi-jobs';
const stagione: StagioneSimulata = simulaStagione(mondo, motore, voto, { seme: SEME });

// Un ContestoMondo minimo ma reale: riferimenti/i campi non usati dagli
// scambi restano fuori, il tipo non li richiede a runtime.
const contestoMondo = { mondo, motore, voto, punteggio, regole, scambi: configScambi } as ContestoMondo;

function statoDiProva(): StatoLega {
  const esito = importaRose(roseCompleto, contesto('mantra'));
  if (!esito.riuscito) throw new Error('le fixture non si importano piu’');
  return statoDaImport(
    { id: 'prova', nome: 'Prova', seme: SEME, modalita: 'mantra', budget: 500, amministratore: null },
    esito.squadre,
  );
}

/* ------------------------------------------------------------------ */

describe('validaProposta', () => {
  it('rifiuta uno scambio di una squadra con se stessa', () => {
    const stato = statoDiProva();
    const id = stato.squadre[0]!.id;
    const g = stato.squadre[0]!.giocatori[0]!.giocatoreId;
    throws(
      () => validaProposta(stato, { daSquadraId: id, aSquadraId: id, offerti: [g], richiesti: [g] }),
      /se stessa/,
    );
  });

  it('rifiuta un giocatore non posseduto', () => {
    const stato = statoDiProva();
    const [uno, due] = stato.squadre;
    throws(
      () =>
        validaProposta(stato, {
          daSquadraId: uno!.id, aSquadraId: due!.id,
          offerti: ['non-esiste'], richiesti: [due!.giocatori[0]!.giocatoreId],
        }),
      /non e’ nella rosa/,
    );
  });

  it('accetta una proposta sensata', () => {
    const stato = statoDiProva();
    const [uno, due] = stato.squadre;
    validaProposta(stato, {
      daSquadraId: uno!.id, aSquadraId: due!.id,
      offerti: [uno!.giocatori[0]!.giocatoreId], richiesti: [due!.giocatori[0]!.giocatoreId],
    });
  });
});

describe('proponiScambio verso una persona', () => {
  it('resta in attesa e non tocca le rose', async () => {
    const stato = statoDiProva();
    const [bot, umano] = stato.squadre;
    umano!.proprietario = 'amico@prova.it';
    const archivio = archivioInMemoria([stato]);

    const offerto = bot!.giocatori[0]!.giocatoreId;
    const richiesto = umano!.giocatori[0]!.giocatoreId;
    const esito = await proponiScambio(archivio, stato, contestoMondo, stagione, configScambi, {
      daSquadraId: bot!.id, aSquadraId: umano!.id, offerti: [offerto], richiesti: [richiesto],
    });

    strictEqual(esito.scambio.stato, 'proposto');
    const dopo = await archivio.leggi('prova');
    strictEqual(dopo!.scambi.length, 1);
    deepStrictEqual(dopo!.squadre.find((s) => s.id === bot!.id)!.giocatori.map((g) => g.giocatoreId).includes(offerto), true);
  });
});

describe('proponiScambio verso un bot', () => {
  it('si risolve subito, con l’esito gia’ scritto', async () => {
    const stato = statoDiProva();
    const [unoBot, dueBot] = stato.squadre;
    const archivio = archivioInMemoria([stato]);

    // Meta' della rosa dell'una contro un solo economico dell'altra: un
    // affare cosi' sbilanciato a favore del bot bersaglio si risolve sempre
    // con un'accettazione, qualunque sia il rumore configurato.
    const offerti = unoBot!.giocatori.slice(0, Math.ceil(unoBot!.giocatori.length / 2)).map((g) => g.giocatoreId);
    const piuEconomico = [...dueBot!.giocatori].sort((a, b) => a.prezzo - b.prezzo)[0]!;

    const esito = await proponiScambio(archivio, stato, contestoMondo, stagione, configScambi, {
      daSquadraId: unoBot!.id, aSquadraId: dueBot!.id, offerti, richiesti: [piuEconomico.giocatoreId],
    });

    strictEqual(esito.scambio.stato, 'accettato');
    const dopo = await archivio.leggi('prova');
    strictEqual(dopo!.scambi[0]!.stato, 'accettato');
    // Il giocatore ceduto dal bot e' passato all'altra squadra davvero.
    ok(dopo!.squadre.find((s) => s.id === unoBot!.id)!.giocatori.some((g) => g.giocatoreId === piuEconomico.giocatoreId));
  });
});

describe('rispondiScambio', () => {
  it('una persona puo’ accettare uno scambio ricevuto', async () => {
    const stato = statoDiProva();
    const [bot, umano] = stato.squadre;
    umano!.proprietario = 'amico@prova.it';
    const archivio = archivioInMemoria([stato]);

    const offerto = bot!.giocatori[0]!.giocatoreId;
    const richiesto = umano!.giocatori[0]!.giocatoreId;
    await proponiScambio(archivio, stato, contestoMondo, stagione, configScambi, {
      daSquadraId: bot!.id, aSquadraId: umano!.id, offerti: [offerto], richiesti: [richiesto],
    });

    const dopoProposta = (await archivio.leggi('prova'))!;
    const scambioId = dopoProposta.scambi[0]!.id;
    const risolto = await rispondiScambio(archivio, dopoProposta, scambioId, true);

    strictEqual(risolto.stato, 'accettato');
    const finale = await archivio.leggi('prova');
    ok(finale!.squadre.find((s) => s.id === bot!.id)!.giocatori.some((g) => g.giocatoreId === richiesto));
  });

  it('non si puo’ rispondere due volte allo stesso scambio', async () => {
    const stato = statoDiProva();
    const [bot, umano] = stato.squadre;
    umano!.proprietario = 'amico@prova.it';
    const archivio = archivioInMemoria([stato]);
    await proponiScambio(archivio, stato, contestoMondo, stagione, configScambi, {
      daSquadraId: bot!.id, aSquadraId: umano!.id,
      offerti: [bot!.giocatori[0]!.giocatoreId], richiesti: [umano!.giocatori[0]!.giocatoreId],
    });
    const dopoProposta = (await archivio.leggi('prova'))!;
    const scambioId = dopoProposta.scambi[0]!.id;
    await rispondiScambio(archivio, dopoProposta, scambioId, false);
    const dopoRisposta = (await archivio.leggi('prova'))!;
    await rejects(() => rispondiScambio(archivio, dopoRisposta, scambioId, true), /non e’ piu’/);
  });
});

describe('ritiraScambio', () => {
  it('chi ha proposto puo’ ritirare mentre e’ ancora in attesa', async () => {
    const stato = statoDiProva();
    const [bot, umano] = stato.squadre;
    umano!.proprietario = 'amico@prova.it';
    const archivio = archivioInMemoria([stato]);
    await proponiScambio(archivio, stato, contestoMondo, stagione, configScambi, {
      daSquadraId: bot!.id, aSquadraId: umano!.id,
      offerti: [bot!.giocatori[0]!.giocatoreId], richiesti: [umano!.giocatori[0]!.giocatoreId],
    });
    const dopoProposta = (await archivio.leggi('prova'))!;
    const scambioId = dopoProposta.scambi[0]!.id;
    const ritirato = await ritiraScambio(archivio, dopoProposta, scambioId);
    strictEqual(ritirato.stato, 'ritirato');
  });
});

describe('scambiDiSquadra e scambiAccettatiInStagione', () => {
  it('contano solo gli scambi della squadra indicata, i piu’ recenti prima', () => {
    const stato = statoDiProva();
    const [uno, due, tre] = stato.squadre;
    const conScambi: StatoLega = {
      ...stato,
      scambi: [
        {
          id: '1', daSquadraId: uno!.id, aSquadraId: due!.id, offerti: ['x'], richiesti: ['y'],
          stato: 'accettato', motivo: null, creatoIl: '2026-01-01T00:00:00.000Z', risoltoIl: '2026-01-01T00:00:00.000Z',
        },
        {
          id: '2', daSquadraId: due!.id, aSquadraId: tre!.id, offerti: ['x'], richiesti: ['y'],
          stato: 'rifiutato', motivo: 'no', creatoIl: '2026-01-02T00:00:00.000Z', risoltoIl: '2026-01-02T00:00:00.000Z',
        },
      ],
    };
    strictEqual(scambiDiSquadra(conScambi, uno!.id).length, 1);
    strictEqual(scambiDiSquadra(conScambi, due!.id).length, 2);
    strictEqual(scambiDiSquadra(conScambi, due!.id)[0]!.id, '2', 'il piu’ recente viene prima');
    strictEqual(scambiAccettatiInStagione(conScambi, uno!.id), 1);
    strictEqual(scambiAccettatiInStagione(conScambi, due!.id), 1, 'quello rifiutato non conta');
    strictEqual(scambiAccettatiInStagione(conScambi, tre!.id), 0);
  });
});

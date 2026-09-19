/**
 * Test della chiusura di stagione (SPEC 5.8): il verdetto per l'albo d'oro
 * e le voci di mercato sui trasferimenti interni.
 */

import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { caricaMondo, indicizza, type MondoIndicizzato } from '../../engine/src/mondo.ts';
import {
  validaParametriMotore, validaParametriVoto,
  type ParametriMotore, type ParametriVoto,
} from '../../engine/src/configurazione.ts';
import { validaParametriEvoluzione, type ParametriEvoluzione } from '../../engine/src/evoluzione.ts';
import { regoleClassic, type ConfigurazioneClassic } from '../../fanta/src/classic.ts';
import { regoleMantra, type ConfigurazioneMantra } from '../../fanta/src/mantra.ts';
import { validaConfigurazioneLega, type ConfigurazioneLega } from '../../fanta/src/fantavoto.ts';
import { archivioInMemoria } from '../src/archivio.ts';
import { chiudiStagioniAttraversate } from '../src/fineStagione.ts';
import { importaRose } from '../src/importa.ts';
import { statoDaImport, vistaStagione, type ContestoMondo } from '../src/lega.ts';
import { validaConfigurazioneScambi, type ConfigurazioneScambi } from '../src/valutazione.ts';
import { validaConfigurazioneChat, type ConfigurazioneChat } from '../src/personaggio.ts';
import { giornatePerStagione } from '../src/stagioni.ts';
import { contesto as contestoImport, mondo as mondoJson, roseCompleto } from './comune.ts';

const json = (percorso: string): any =>
  JSON.parse(readFileSync(fileURLToPath(new URL(percorso, import.meta.url)), 'utf8'));

const mondo: MondoIndicizzato = indicizza(caricaMondo(mondoJson));
const motore = validaParametriMotore(json('../../engine/config/motore.json') as ParametriMotore);
const voto = validaParametriVoto(json('../../engine/config/voto.json') as ParametriVoto);
const punteggio = validaConfigurazioneLega(json('../../fanta/config/lega.json') as ConfigurazioneLega);
const regole = {
  classic: regoleClassic(json('../../fanta/config/classic.json') as ConfigurazioneClassic),
  mantra: regoleMantra(json('../../fanta/config/mantra.json') as ConfigurazioneMantra),
};
const scambi = validaConfigurazioneScambi(json('../../fanta/config/scambi.json') as ConfigurazioneScambi);
const chat = validaConfigurazioneChat(json('../../fanta/config/chat.json') as ConfigurazioneChat);
const evoluzione = validaParametriEvoluzione(json('../../engine/config/evoluzione.json') as ParametriEvoluzione);
const contestoMondo: ContestoMondo = {
  mondo, motore, voto, punteggio, regole, scambi, chat, evoluzione,
  riferimenti: { giocatori: [], club: [], ceduti: [] },
};

const SEME = 'seme-di-prova-fine-stagione';
const GPS = giornatePerStagione(mondo);

function statoIniziale() {
  const esito = importaRose(roseCompleto, contestoImport('classic'));
  if (!esito.riuscito) throw new Error('le fixture non si importano piu’');
  return statoDaImport(
    { id: 'prova', nome: 'Prova', seme: SEME, modalita: 'classic', budget: 500, amministratore: null },
    esito.squadre,
  );
}

describe('chiudiStagioniAttraversate', () => {
  it('scrive il verdetto della stagione conclusa, con il vero primo classificato', () => {
    const base = statoIniziale();
    const finoStagione1 = { ...base, giornateGiocate: GPS };
    const classificaAttesa = vistaStagione(finoStagione1, contestoMondo).classifica;

    const archivio = archivioInMemoria([{ ...base, giornateGiocate: GPS + 1 }]);
    return chiudiStagioniAttraversate(archivio, { ...base, giornateGiocate: GPS + 1 }, contestoMondo, null, 1, GPS + 1)
      .then(async () => {
        const finale = await archivio.leggi('prova');
        strictEqual(finale!.alboDoro.length, 1);
        strictEqual(finale!.alboDoro[0]!.stagione, 1);
        strictEqual(finale!.alboDoro[0]!.campioneSquadraId, classificaAttesa[0]!.squadraId);
        strictEqual(finale!.alboDoro[0]!.puntiCampione, classificaAttesa[0]!.punti);
      });
  });

  it('scrive le voci di mercato per la stagione in arrivo', async () => {
    const base = statoIniziale();
    const archivio = archivioInMemoria([{ ...base, giornateGiocate: GPS + 1 }]);
    await chiudiStagioniAttraversate(archivio, { ...base, giornateGiocate: GPS + 1 }, contestoMondo, null, 1, GPS + 1);

    const finale = await archivio.leggi('prova');
    strictEqual(finale!.vociMercato.length, 1);
    strictEqual(finale!.vociMercato[0]!.stagione, 2);
    strictEqual(finale!.vociMercato[0]!.fonte, 'template');
  });

  it('non chiude niente se non si attraversa un confine di stagione', async () => {
    const base = statoIniziale();
    const archivio = archivioInMemoria([{ ...base, giornateGiocate: 10 }]);
    await chiudiStagioniAttraversate(archivio, { ...base, giornateGiocate: 10 }, contestoMondo, null, 5, 10);

    const finale = await archivio.leggi('prova');
    strictEqual(finale!.alboDoro.length, 0);
    strictEqual(finale!.vociMercato.length, 0);
  });

  it('e’ idempotente: rilanciata sullo stesso confine non duplica il verdetto', async () => {
    const base = statoIniziale();
    const archivio = archivioInMemoria([{ ...base, giornateGiocate: GPS + 1 }]);
    await chiudiStagioniAttraversate(archivio, { ...base, giornateGiocate: GPS + 1 }, contestoMondo, null, 1, GPS + 1);
    const dopoLaPrimaVolta = await archivio.leggi('prova');

    await chiudiStagioniAttraversate(archivio, dopoLaPrimaVolta!, contestoMondo, null, 1, GPS + 1);
    const dopoLaSeconda = await archivio.leggi('prova');

    deepStrictEqual(dopoLaSeconda!.alboDoro, dopoLaPrimaVolta!.alboDoro);
    deepStrictEqual(dopoLaSeconda!.vociMercato, dopoLaPrimaVolta!.vociMercato);
  });

  it('chiude piu’ stagioni in un solo balzo', async () => {
    const base = statoIniziale();
    const traguardo = 2 * GPS + 3;
    const archivio = archivioInMemoria([{ ...base, giornateGiocate: traguardo }]);
    await chiudiStagioniAttraversate(archivio, { ...base, giornateGiocate: traguardo }, contestoMondo, null, 1, traguardo);

    const finale = await archivio.leggi('prova');
    strictEqual(finale!.alboDoro.length, 2, 'un balzo di due stagioni deve chiuderle entrambe');
    deepStrictEqual(finale!.alboDoro.map((v) => v.stagione).sort(), [1, 2]);
    deepStrictEqual(finale!.vociMercato.map((v) => v.stagione).sort(), [2, 3]);
  });

  it('il campione ha davvero il maggior numero di punti in classifica', async () => {
    const base = statoIniziale();
    const archivio = archivioInMemoria([{ ...base, giornateGiocate: GPS + 1 }]);
    await chiudiStagioniAttraversate(archivio, { ...base, giornateGiocate: GPS + 1 }, contestoMondo, null, 1, GPS + 1);
    const finale = await archivio.leggi('prova');
    const classificaFinaleStagione1 = vistaStagione({ ...finale!, giornateGiocate: GPS }, contestoMondo).classifica;
    ok(classificaFinaleStagione1.every((r) => r.punti <= classificaFinaleStagione1[0]!.punti));
    strictEqual(finale!.alboDoro[0]!.campioneSquadraId, classificaFinaleStagione1[0]!.squadraId);
  });
});

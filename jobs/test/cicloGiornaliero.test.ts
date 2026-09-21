/**
 * Test di `giocaGiornate`: il punto unico che gioca N giornate per una lega,
 * condiviso da `npm run gioca`, `/api/gioca` e il pulsante admin on-demand
 * (issue #12). Non ripete i test di ogni pezzo che orchestra (gia' coperti
 * altrove): verifica solo che l'orchestrazione avanzi lo stato come deve.
 */

import { deepStrictEqual, rejects, strictEqual } from 'node:assert/strict';
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
import { giocaGiornate } from '../src/cicloGiornaliero.ts';
import { importaRose } from '../src/importa.ts';
import { statoDaImport, type ContestoMondo } from '../src/lega.ts';
import { validaConfigurazioneScambi, type ConfigurazioneScambi } from '../src/valutazione.ts';
import { validaConfigurazioneChat, type ConfigurazioneChat } from '../src/personaggio.ts';
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

const SEME = 'seme-di-prova-ciclo-giornaliero';

function statoIniziale(giornateAlGiorno = 1) {
  const esito = importaRose(roseCompleto, contestoImport('classic'));
  if (!esito.riuscito) throw new Error('le fixture non si importano piu’');
  return statoDaImport(
    { id: 'prova', nome: 'Prova', seme: SEME, modalita: 'classic', budget: 500, amministratore: null, giornateAlGiorno },
    esito.squadre,
  );
}

describe('giocaGiornate', () => {
  it('avanza giornateGiocate di "quante" a partire dalla successiva', async () => {
    const stato = statoIniziale();
    const archivio = archivioInMemoria([stato]);

    const esito = await giocaGiornate(archivio, contestoMondo, null, stato, 3);

    strictEqual(esito.da, 1);
    strictEqual(esito.fino, 3);
    const dopo = await archivio.leggi('prova');
    strictEqual(dopo!.giornateGiocate, 3);
  });

  it('usa il ritmo configurato di lega quando la si gioca due volte di seguito', async () => {
    const stato = statoIniziale(2);
    const archivio = archivioInMemoria([stato]);

    const prima = await giocaGiornate(archivio, contestoMondo, null, stato, stato.giornateAlGiorno);
    deepStrictEqual([prima.da, prima.fino], [1, 2]);

    const dopoPrima = (await archivio.leggi('prova'))!;
    const seconda = await giocaGiornate(archivio, contestoMondo, null, dopoPrima, dopoPrima.giornateAlGiorno);
    deepStrictEqual([seconda.da, seconda.fino], [3, 4]);
  });

  it('rifiuta un "quante" non intero o non positivo', async () => {
    const stato = statoIniziale();
    const archivio = archivioInMemoria([stato]);
    await rejects(() => giocaGiornate(archivio, contestoMondo, null, stato, 0), /positivo/);
    await rejects(() => giocaGiornate(archivio, contestoMondo, null, stato, 1.5), /positivo/);
  });
});

/**
 * Test dell'orchestrazione della chat dei bot (SPEC 7.2, 8): quali eventi
 * fanno reagire un bot, il tetto giornaliero, e che non si reagisca due
 * volte allo stesso episodio.
 */

import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { indicizza, caricaMondo, type MondoIndicizzato } from '../../engine/src/mondo.ts';
import {
  validaParametriMotore, validaParametriVoto,
  type ParametriMotore, type ParametriVoto,
} from '../../engine/src/configurazione.ts';
import { simulaStagione, type StagioneSimulata } from '../../engine/src/stagione.ts';
import { regoleClassic, type ConfigurazioneClassic } from '../../fanta/src/classic.ts';
import { regoleMantra, type ConfigurazioneMantra } from '../../fanta/src/mantra.ts';
import { validaConfigurazioneLega, type ConfigurazioneLega } from '../../fanta/src/fantavoto.ts';
import { archivioInMemoria } from '../src/archivio.ts';
import type { ScambioSalvato, StatoLega } from '../src/archivio.ts';
import { generaChatGiornate } from '../src/chat.ts';
import { importaRose } from '../src/importa.ts';
import { statoDaImport, vistaStagione, type ContestoMondo } from '../src/lega.ts';
import { validaConfigurazioneChat, type ConfigurazioneChat } from '../src/personaggio.ts';
import { validaConfigurazioneScambi, type ConfigurazioneScambi } from '../src/valutazione.ts';
import { contesto, mondo as mondoJson, roseCompleto } from './comune.ts';

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
const configScambi = validaConfigurazioneScambi(json('../../fanta/config/scambi.json') as ConfigurazioneScambi);
const configChat = validaConfigurazioneChat(json('../../fanta/config/chat.json') as ConfigurazioneChat);
const contestoMondo = {
  mondo, motore, voto, punteggio, regole, scambi: configScambi, chat: configChat,
} as ContestoMondo;

const SEME = 'seme-di-prova-chat';
const stagione: StagioneSimulata = simulaStagione(mondo, motore, voto, { seme: SEME });

function statoIniziale(): StatoLega {
  const esito = importaRose(roseCompleto, contesto('classic'));
  if (!esito.riuscito) throw new Error('le fixture non si importano piu’');
  return statoDaImport(
    { id: 'prova', nome: 'Prova', seme: SEME, modalita: 'classic', budget: 500, amministratore: null },
    esito.squadre,
  );
}

function scambioDiProva(daSquadraId: string, aSquadraId: string, mod: Partial<ScambioSalvato> = {}): ScambioSalvato {
  return {
    id: 's1', daSquadraId, aSquadraId, offerti: ['x'], richiesti: ['y'],
    stato: 'accettato', motivo: null, creatoIl: '2026-01-01T00:00:00.000Z',
    risoltoIl: '2026-01-01T00:00:00.000Z', ...mod,
  };
}

describe('generaChatGiornate — sconfitta pesante', () => {
  it('un bot che perde per uno scarto oltre soglia riceve un messaggio', async () => {
    const stato = statoIniziale();
    const giocato = { ...stato, giornateGiocate: 15 };
    const vista = vistaStagione(giocato, contestoMondo);

    let trovata: { n: number; perdente: string } | null = null;
    for (const g of vista.giornate) {
      for (const s of g.scontri) {
        if (s.fantapuntiOspite - s.fantapuntiCasa >= configChat.sogliaSconfittaPesante) {
          trovata = { n: g.numero, perdente: s.casaId };
        } else if (s.fantapuntiCasa - s.fantapuntiOspite >= configChat.sogliaSconfittaPesante) {
          trovata = { n: g.numero, perdente: s.ospiteId };
        }
      }
      if (trovata) break;
    }
    if (!trovata) throw new Error('nessuna sconfitta pesante nelle prime 15 giornate: aggiornare il test');

    const archivio = archivioInMemoria([giocato]);
    await generaChatGiornate(archivio, giocato, contestoMondo, vista, null, trovata.n, trovata.n);

    const finale = await archivio.leggi('prova');
    const messaggio = finale!.chat.find((m) => m.squadraId === trovata!.perdente && m.evento === 'sconfittaPesante');
    ok(messaggio, `${trovata.perdente} doveva ricevere un messaggio per la sconfitta alla giornata ${trovata.n}`);
    strictEqual(messaggio!.giornata, trovata.n);
    strictEqual(messaggio!.riferimento, null);
  });

  it('non reagisce due volte alla stessa sconfitta', async () => {
    const stato = statoIniziale();
    const giocato = { ...stato, giornateGiocate: 1 };
    const vista = vistaStagione(giocato, contestoMondo);
    const archivio = archivioInMemoria([giocato]);

    await generaChatGiornate(archivio, giocato, contestoMondo, vista, null, 1, 1);
    const dopoPrimaVolta = await archivio.leggi('prova');
    await generaChatGiornate(archivio, dopoPrimaVolta!, contestoMondo, vista, null, 1, 1);
    const dopoSecondaVolta = await archivio.leggi('prova');

    deepStrictEqual(dopoSecondaVolta!.chat, dopoPrimaVolta!.chat);
  });
});

describe('generaChatGiornate — scambi', () => {
  it('uno scambio accettato fa reagire entrambe le squadre coinvolte (colpo di mercato)', async () => {
    const base = statoIniziale();
    const [uno, due] = base.squadre;
    const stato: StatoLega = { ...base, scambi: [scambioDiProva(uno!.id, due!.id)] };
    const vista = vistaStagione({ ...stato, giornateGiocate: 1 }, contestoMondo);
    const archivio = archivioInMemoria([stato]);

    await generaChatGiornate(archivio, stato, contestoMondo, vista, null, 1, 1);

    const finale = await archivio.leggi('prova');
    const reazioni = finale!.chat.filter((m) => m.evento === 'colpoDiMercato');
    deepStrictEqual(new Set(reazioni.map((m) => m.squadraId)), new Set([uno!.id, due!.id]));
    for (const r of reazioni) strictEqual(r.riferimento, 's1');
  });

  it('uno scambio rifiutato fa reagire solo chi lo ha proposto', async () => {
    const base = statoIniziale();
    const [uno, due] = base.squadre;
    const stato: StatoLega = {
      ...base,
      scambi: [scambioDiProva(uno!.id, due!.id, { stato: 'rifiutato', motivo: 'troppo poco' })],
    };
    const vista = vistaStagione({ ...stato, giornateGiocate: 1 }, contestoMondo);
    const archivio = archivioInMemoria([stato]);

    await generaChatGiornate(archivio, stato, contestoMondo, vista, null, 1, 1);

    const finale = await archivio.leggi('prova');
    const reazioni = finale!.chat.filter((m) => m.evento === 'scambioRifiutato');
    deepStrictEqual(reazioni.map((m) => m.squadraId), [uno!.id]);
  });

  it('non reagisce di nuovo a uno scambio a cui ha gia’ reagito', async () => {
    const base = statoIniziale();
    const [uno, due] = base.squadre;
    const stato: StatoLega = { ...base, scambi: [scambioDiProva(uno!.id, due!.id)] };
    const vista = vistaStagione({ ...stato, giornateGiocate: 1 }, contestoMondo);
    const archivio = archivioInMemoria([stato]);

    await generaChatGiornate(archivio, stato, contestoMondo, vista, null, 1, 1);
    const dopoPrimaVolta = await archivio.leggi('prova');
    // Rilancia il job su una giornata successiva: lo stesso scambio e' ancora li'.
    await generaChatGiornate(archivio, dopoPrimaVolta!, contestoMondo, vista, null, 2, 2);
    const dopoSecondaVolta = await archivio.leggi('prova');

    strictEqual(dopoSecondaVolta!.chat.length, dopoPrimaVolta!.chat.length);
  });
});

describe('generaChatGiornate — tetto giornaliero', () => {
  it('un bot con piu’ di un evento nello stesso giro manda al massimo il tetto configurato', async () => {
    const base = statoIniziale();
    const [uno, due, tre] = base.squadre;
    // Due scambi accettati diversi coinvolgono entrambi "uno": senza tetto
    // produrrebbero due messaggi nello stesso giro.
    const stato: StatoLega = {
      ...base,
      scambi: [
        scambioDiProva(uno!.id, due!.id, { id: 's1' }),
        scambioDiProva(uno!.id, tre!.id, { id: 's2' }),
      ],
    };
    const vista = vistaStagione({ ...stato, giornateGiocate: 1 }, contestoMondo);
    const archivio = archivioInMemoria([stato]);

    await generaChatGiornate(archivio, stato, contestoMondo, vista, null, 1, 1);

    const finale = await archivio.leggi('prova');
    const diUno = finale!.chat.filter((m) => m.squadraId === uno!.id);
    strictEqual(diUno.length, configChat.tettoMessaggiAlGiorno);
  });
});

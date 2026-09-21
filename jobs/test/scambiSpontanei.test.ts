/**
 * Test dei bot che propongono scambi di loro iniziativa (SPEC 6.5).
 *
 * Le funzioni pure (chi cedere, quale ruolo manca) si provano con le rose
 * reali, come il resto di `/jobs`. L'orchestrazione si prova con una
 * probabilita' di 1 (il bot considera sempre la cosa, ogni giornata): senza
 * quel controllo il test dipenderebbe da quale numero pseudocasuale esce, e
 * fallirebbe una volta ogni tante senza che sia cambiato niente.
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
import { importaRose } from '../src/importa.ts';
import { statoDaImport, type ContestoMondo } from '../src/lega.ts';
import type { StatoLega } from '../src/archivio.ts';
import { giocatoriCedibili, proponiScambiSpontanei, ruoloPiuScoperto } from '../src/scambiSpontanei.ts';
import {
  frequenzaRuoliSquadra, validaConfigurazioneScambi, type ConfigurazioneScambi,
} from '../src/valutazione.ts';
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
const configScambi = validaConfigurazioneScambi(json('../../fanta/config/scambi.json') as ConfigurazioneScambi);
const contestoMondo = { mondo, motore, voto, punteggio, regole, scambi: configScambi } as ContestoMondo;

const SEME = 'seme-di-prova-scambi-spontanei';
const stagione: StagioneSimulata = simulaStagione(mondo, motore, voto, { seme: SEME });

function statoDiProva(): StatoLega {
  const esito = importaRose(roseCompleto, contestoImport('mantra'));
  if (!esito.riuscito) throw new Error('le fixture non si importano piu’');
  return statoDaImport(
    { id: 'prova', nome: 'Prova', seme: SEME, modalita: 'mantra', budget: 500, amministratore: null },
    esito.squadre,
  );
}

/** Un bot considera sempre la cosa, ogni giornata: elimina la casualita' del "se". */
function configConProbabilitaUno(): ConfigurazioneScambi {
  return { ...configScambi, bot: { ...configScambi.bot, proponiOgniGiornate: 1 } };
}

/* ------------------------------------------------------------------ */

describe('ruoloPiuScoperto e giocatoriCedibili', () => {
  it('ruoloPiuScoperto e’ davvero il meno frequente nella rosa di quella squadra', () => {
    const stato = statoDiProva();
    for (const squadra of stato.squadre) {
      const frequenza = frequenzaRuoliSquadra(squadra, mondo);
      const scoperto = ruoloPiuScoperto(squadra, mondo);
      const minimo = Math.min(...frequenza.values());
      strictEqual(frequenza.get(scoperto), minimo);
    }
  });

  it('ogni cedibile viene da un ruolo che la squadra ha almeno doppio', () => {
    const stato = statoDiProva();
    for (const squadra of stato.squadre) {
      const frequenza = frequenzaRuoliSquadra(squadra, mondo);
      for (const cedibile of giocatoriCedibili(squadra, mondo)) {
        const ruoli = mondo.giocatorePerId.get(cedibile)!.ruoliMantra;
        ok(ruoli.some((r) => (frequenza.get(r) ?? 0) >= 2));
      }
    }
  });

  it('sono ordinati dal piu’ al meno pagato', () => {
    const stato = statoDiProva();
    const squadra = stato.squadre[0]!;
    const prezzo = new Map(squadra.giocatori.map((g) => [g.giocatoreId, g.prezzo]));
    const cedibili = giocatoriCedibili(squadra, mondo);
    for (let i = 1; i < cedibili.length; i++) {
      ok(prezzo.get(cedibili[i - 1]!)! >= prezzo.get(cedibili[i]!)!);
    }
  });
});

describe('proponiScambiSpontanei', () => {
  it('con le fixture reali propone davvero, e ogni proposta e’ sensata', async () => {
    const stato = statoDiProva();
    const archivio = archivioInMemoria([stato]);
    await proponiScambiSpontanei(archivio, stato, contestoMondo, stagione, configConProbabilitaUno(), 1, 15);

    const finale = await archivio.leggi('prova');
    const proposte = finale!.scambi;
    ok(proposte.length > 0, 'su 15 giornate con probabilita’ 1 ci si aspetta almeno una proposta');

    for (const p of proposte) {
      ok(p.daSquadraId !== p.aSquadraId, 'una squadra non propone a se stessa');
      strictEqual(p.offerti.length, 1);
      strictEqual(p.richiesti.length, 1);
      // Chi propone e' sempre un bot: solo i bot iniziano da soli (SPEC 6.5).
      strictEqual(stato.squadre.find((s) => s.id === p.daSquadraId)!.proprietario, null);
    }
  });

  it('rispetta il tetto stagionale: chi lo ha gia’ raggiunto non propone altro', async () => {
    const base = statoDiProva();
    const bersaglio = base.squadre[0]!;
    // Riempie il tetto con scambi accettati fittizi fra le altre due squadre,
    // cosi' il conteggio di `bersaglio` resta a zero: si forza il caso al
    // contrario, dandogli finti scambi accettati fino al tetto.
    const scambiFinti = Array.from({ length: configScambi.bot.tettoScambiPerStagione }, (_, i) => ({
      id: `finto-${i}`,
      daSquadraId: bersaglio.id,
      aSquadraId: base.squadre[1]!.id,
      offerti: [bersaglio.giocatori[0]!.giocatoreId],
      richiesti: [base.squadre[1]!.giocatori[0]!.giocatoreId],
      stato: 'accettato' as const,
      motivo: null,
      creatoIl: '2026-01-01T00:00:00.000Z',
      risoltoIl: '2026-01-01T00:00:00.000Z',
    }));
    // Non si applicano davvero (servirebbe spostare i giocatori): basta che
    // il conteggio degli accettati li veda, che e' quello che il tetto legge.
    const stato: StatoLega = { ...base, scambi: scambiFinti };
    const archivio = archivioInMemoria([stato]);

    await proponiScambiSpontanei(archivio, stato, contestoMondo, stagione, configConProbabilitaUno(), 1, 5);

    const finale = await archivio.leggi('prova');
    const nuoviDelBersaglio = finale!.scambi.filter(
      (s) => s.daSquadraId === bersaglio.id && !s.id.startsWith('finto-'),
    );
    strictEqual(nuoviDelBersaglio.length, 0, 'chi ha gia’ il tetto pieno non deve proporre altro');
  });

  it('non propone una seconda volta mentre una sua proposta e’ ancora in attesa', async () => {
    const base = statoDiProva();
    const bot = base.squadre.find((s) => s.proprietario === null)!;
    const umano = base.squadre.find((s) => s.id !== bot.id)!;
    const scambioInAttesa = {
      id: 'gia-proposto',
      daSquadraId: bot.id,
      aSquadraId: umano.id,
      offerti: [bot.giocatori[0]!.giocatoreId],
      richiesti: [umano.giocatori[0]!.giocatoreId],
      stato: 'proposto' as const,
      motivo: null,
      creatoIl: '2026-01-01T00:00:00.000Z',
      risoltoIl: null,
    };
    const stato: StatoLega = { ...base, scambi: [scambioInAttesa] };
    const archivio = archivioInMemoria([stato]);

    await proponiScambiSpontanei(archivio, stato, contestoMondo, stagione, configConProbabilitaUno(), 1, 5);

    const finale = await archivio.leggi('prova');
    const proposteDelBot = finale!.scambi.filter((s) => s.daSquadraId === bot.id);
    deepStrictEqual(proposteDelBot.map((s) => s.id), ['gia-proposto']);
  });

  it('in classic non si interrompe anche se una proposta romperebbe la composizione esatta della rosa', async () => {
    // Il doppio controllo di decisioneBot valuta solo il valore dello
    // scambio, non la composizione della rosa che ne risulta: in classic
    // (composizione esatta, non un minimo, fanta/src/classic.ts) capita che
    // una proposta altrimenti sensata sia comunque invalida. Prima del fix,
    // `proponiScambio` lanciava e l'intera giornata — quindi anche il cron
    // automatico — si interrompeva; ora la singola proposta si scarta e si
    // va avanti, come un rifiuto qualunque.
    const esito = importaRose(roseCompleto, contestoImport('classic'));
    if (!esito.riuscito) throw new Error('le fixture non si importano piu’');
    const stato = statoDaImport(
      { id: 'prova-classic', nome: 'Prova', seme: SEME, modalita: 'classic', budget: 500, amministratore: null },
      esito.squadre,
    );
    const archivio = archivioInMemoria([stato]);

    await proponiScambiSpontanei(archivio, stato, contestoMondo, stagione, configConProbabilitaUno(), 1, 30);

    const finale = await archivio.leggi('prova-classic');
    ok(finale !== null, 'il ciclo deve arrivare in fondo senza interrompersi');
  });
});

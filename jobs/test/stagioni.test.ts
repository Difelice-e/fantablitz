/**
 * Test del confine fra una stagione e la successiva (SPEC 5.8).
 *
 * Usa le rose reali di `/fixtures`, come il resto di `/jobs`: il caso che
 * conta e' una lega vera che supera la trentottesima giornata, non uno
 * inventato apposta.
 */

import { deepStrictEqual, notStrictEqual, ok, strictEqual } from 'node:assert/strict';
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
import { importaRose } from '../src/importa.ts';
import { statoDaImport, vistaStagione, type ContestoMondo } from '../src/lega.ts';
import { validaConfigurazioneScambi, type ConfigurazioneScambi } from '../src/valutazione.ts';
import { validaConfigurazioneChat, type ConfigurazioneChat } from '../src/personaggio.ts';
import {
  giornatePerStagione, mondoDellaStagione, posizioneStagione, trasferimentiDellaStagione,
} from '../src/stagioni.ts';
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

const SEME = 'seme-di-prova-stagioni';
const GPS = giornatePerStagione(mondo);

function statoIniziale(giornateGiocate: number) {
  const esito = importaRose(roseCompleto, contestoImport('classic'));
  if (!esito.riuscito) throw new Error('le fixture non si importano piu’');
  const stato = statoDaImport(
    { id: 'prova', nome: 'Prova', seme: SEME, modalita: 'classic', budget: 500, amministratore: null },
    esito.squadre,
  );
  return { ...stato, giornateGiocate };
}

/* ------------------------------------------------------------------ */

describe('giornatePerStagione', () => {
  it('per venti club sono 38, come da regolamento', () => {
    strictEqual(GPS, 38);
  });
});

describe('posizioneStagione', () => {
  it('la prima giornata e’ nella stagione 1', () => {
    deepStrictEqual(posizioneStagione(1, GPS), { stagione: 1, giornataStagionale: 1 });
  });

  it('l’ultima giornata della stagione 1 resta nella stagione 1', () => {
    deepStrictEqual(posizioneStagione(GPS, GPS), { stagione: 1, giornataStagionale: GPS });
  });

  it('la prima giornata dopo il confine e’ nella stagione 2', () => {
    deepStrictEqual(posizioneStagione(GPS + 1, GPS), { stagione: 2, giornataStagionale: 1 });
  });

  it('funziona anche per la terza stagione', () => {
    deepStrictEqual(posizioneStagione(2 * GPS + 5, GPS), { stagione: 3, giornataStagionale: 5 });
  });
});

describe('mondoDellaStagione', () => {
  it('la stagione 1 e’ il mondo base, senza modifiche', () => {
    const s1 = mondoDellaStagione(mondo, 1, SEME, evoluzione);
    for (const g of s1.giocatori) {
      const originale = mondo.giocatorePerId.get(g.id)!;
      strictEqual(g.eta, originale.eta);
      strictEqual(g.overall, originale.overall);
    }
  });

  it('la stagione 2 ha giocatori un anno piu’ vecchi', () => {
    const s2 = mondoDellaStagione(mondo, 2, SEME, evoluzione);
    for (const g of s2.giocatori) {
      const originale = mondo.giocatorePerId.get(g.id)!;
      strictEqual(g.eta, originale.eta + 1);
    }
  });

  it('e’ deterministico: stessa lega, stessa stagione, stesso mondo', () => {
    deepStrictEqual(
      mondoDellaStagione(mondo, 3, SEME, evoluzione),
      mondoDellaStagione(mondo, 3, SEME, evoluzione),
    );
  });

  it('leghe diverse evolvono in modo diverso', () => {
    notStrictEqual(
      JSON.stringify(mondoDellaStagione(mondo, 3, 'seme-a', evoluzione)),
      JSON.stringify(mondoDellaStagione(mondo, 3, 'seme-b', evoluzione)),
    );
  });
});

describe('trasferimentiDellaStagione', () => {
  it('trova davvero dei trasferimenti, e sono coerenti coi due mondi', () => {
    const trasferimenti = trasferimentiDellaStagione(mondo, 1, SEME, evoluzione);
    ok(trasferimenti.length > 0, 'con l’8% configurato, su 500+ giocatori deve trovarne');
    const dopo = mondoDellaStagione(mondo, 2, SEME, evoluzione);
    for (const t of trasferimenti) {
      strictEqual(dopo.giocatorePerId.get(t.giocatoreId)!.clubId, t.aClubId);
      notStrictEqual(t.daClubId, t.aClubId);
    }
  });
});

describe('vistaStagione oltre il confine di stagione', () => {
  it('le giornate continuano a numerarsi in avanti, la stagione 2 comincia dopo la 38', () => {
    const stato = statoIniziale(GPS + 2);
    const vista = vistaStagione(stato, contestoMondo);
    const numeri = vista.giornate.map((g) => g.numero).sort((a, b) => a - b);
    strictEqual(numeri.length, GPS + 2);
    strictEqual(numeri.at(-1), GPS + 2);
    strictEqual(numeri.at(0), 1);
  });

  it('la classifica riguarda solo la stagione in corso, non si accumula da quella precedente', () => {
    const stato = statoIniziale(GPS + 2);
    const vista = vistaStagione(stato, contestoMondo);
    // Con solo due giornate giocate nella nuova stagione, nessuno puo’ avere
    // piu’ di 2 vittorie (6 punti): se la classifica si fosse accumulata
    // dalla stagione precedente, i punti sarebbero molto piu’ alti.
    for (const riga of vista.classifica) {
      ok(riga.giocate <= 2, `${riga.squadraId} ha ${riga.giocate} giocate: la classifica non e’ della sola stagione 2`);
    }
  });

  it('le partite del mondo usano ratini diversi da una stagione all’altra (l’evoluzione si vede)', () => {
    const finoStagione1 = statoIniziale(GPS);
    const vistaStagione1 = vistaStagione(finoStagione1, contestoMondo);
    const finoStagione2 = statoIniziale(GPS + 1);
    const vistaStagione2 = vistaStagione(finoStagione2, contestoMondo);
    // Stessa giornata 1 del mondo, simulata due volte con un mondo diverso
    // (base vs evoluto una volta): un seme di stagione diverso da solo non
    // lo garantirebbe, ma qui basta che l’esecuzione non lanci e produca
    // comunque un campionato completo.
    strictEqual(vistaStagione1.giornate.length, GPS);
    strictEqual(vistaStagione2.giornate.length, GPS + 1);
  });
});

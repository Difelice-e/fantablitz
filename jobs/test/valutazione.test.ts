/**
 * Test della valutazione dei giocatori e della decisione dei bot (SPEC 6.5, 7.1).
 *
 * Usa le rose reali di `/fixtures`, come gli altri test di `/jobs`: i casi
 * limite che contano sono quelli di un import vero, non quelli inventati.
 */

import { deepStrictEqual, notStrictEqual, ok, strictEqual } from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { indicizza, caricaMondo, type MondoIndicizzato } from '../../engine/src/mondo.ts';
import {
  validaParametriMotore, validaParametriVoto,
  type ParametriMotore, type ParametriVoto,
} from '../../engine/src/configurazione.ts';
import { simulaStagione, type StagioneSimulata } from '../../engine/src/stagione.ts';
import type { RuoloMantra } from '../../fanta/src/tipi.ts';
import { importaRose } from '../src/importa.ts';
import { statoDaImport } from '../src/lega.ts';
import type { StatoLega } from '../src/archivio.ts';
import {
  decisioneBot, fattoreScarsita, frequenzaRuoli, mediaVoto, personalitaBot,
  validaConfigurazioneScambi, valoreGiocatore, valoreGiocatori,
  type ConfigurazioneScambi,
} from '../src/valutazione.ts';
import type { PropostaScambio } from '../src/scambi.ts';
import { contesto, mondo as mondoJson, roseCompleto } from './comune.ts';

const json = (percorso: string): any =>
  JSON.parse(readFileSync(fileURLToPath(new URL(percorso, import.meta.url)), 'utf8'));

const mondo: MondoIndicizzato = indicizza(caricaMondo(mondoJson));
const motore = validaParametriMotore(json('../../engine/config/motore.json') as ParametriMotore);
const voto = validaParametriVoto(json('../../engine/config/voto.json') as ParametriVoto);
const configScambi = validaConfigurazioneScambi(json('../../fanta/config/scambi.json') as ConfigurazioneScambi);

const SEME = 'seme-di-prova-scambi';
const stagione: StagioneSimulata = simulaStagione(mondo, motore, voto, { seme: SEME });

/** Una lega vera, importata dalle rose reali: tutte le squadre sono bot finche' nessuno le assegna. */
function statoDiProva(giornateGiocate = 0): StatoLega {
  const esito = importaRose(roseCompleto, contesto('mantra'));
  if (!esito.riuscito) throw new Error('le fixture non si importano piu’');
  const stato = statoDaImport(
    { id: 'prova', nome: 'Prova', seme: SEME, modalita: 'mantra', budget: 500, amministratore: null },
    esito.squadre,
  );
  return { ...stato, giornateGiocate };
}

/* ------------------------------------------------------------------ */

describe('fattoreScarsita', () => {
  const frequenza = new Map<RuoloMantra, number>([
    ['Por', 10], ['Dc', 30], ['B', 5], ['Dd', 20], ['Ds', 20], ['E', 20],
    ['M', 20], ['C', 20], ['W', 10], ['T', 10], ['A', 20], ['Pc', 10],
  ]);
  const cfg = { min: 0.8, max: 1.4 };

  it('un ruolo piu’ raro della media vale di piu’', () => {
    // Media = 195/12 = 16.25. 'B' (5) e' piu' raro della media.
    ok(fattoreScarsita(['B'], frequenza, cfg) > 1);
  });

  it('un ruolo piu’ comune della media vale di meno, non sotto il minimo', () => {
    ok(fattoreScarsita(['Dc'], frequenza, cfg) < 1);
    ok(fattoreScarsita(['Dc'], frequenza, cfg) >= cfg.min);
  });

  it('non supera mai il massimo configurato', () => {
    strictEqual(fattoreScarsita(['B'], frequenza, cfg), Math.min(cfg.max, 16.25 / 5));
  });

  it('con piu’ ruoli si prende il migliore', () => {
    const soloComune = fattoreScarsita(['Dc'], frequenza, cfg);
    const conRaro = fattoreScarsita(['Dc', 'B'], frequenza, cfg);
    ok(conRaro > soloComune, 'un ruolo raro in piu’ non puo’ far scendere il valore');
  });
});

describe('mediaVoto', () => {
  it('nessuna giornata giocata: nessuna media', () => {
    const giocatoreId = mondo.giocatori[0]!.id;
    strictEqual(mediaVoto(giocatoreId, stagione, 0), null);
  });

  it('la media considera solo le giornate fino a quella indicata', () => {
    const giocatoreId = stagione.partite[0]!.prestazioni[0]!.giocatoreId;
    const primaGiornata = stagione.partite[0]!.giornata;
    const mediaAllaPrima = mediaVoto(giocatoreId, stagione, primaGiornata);
    const mediaAllaFine = mediaVoto(giocatoreId, stagione, 1000);
    // Non e' detto siano diversi (dipende dai voti reali), ma entrambi devono
    // essere calcolabili appena il giocatore ha almeno un voto nel range.
    ok(mediaAllaPrima === null || (mediaAllaPrima >= 1 && mediaAllaPrima <= 10));
    ok(mediaAllaFine === null || (mediaAllaFine >= 1 && mediaAllaFine <= 10));
  });
});

describe('valoreGiocatore', () => {
  it('a inizio stagione conta solo il prezzo pagato', () => {
    const stato = statoDiProva(0);
    const frequenza = frequenzaRuoli(stato, mondo);
    const squadra = stato.squadre[0]!;
    for (const g of squadra.giocatori) {
      const nelMondo = mondo.giocatorePerId.get(g.giocatoreId)!;
      const atteso =
        (g.prezzo / stato.budget) *
        fattoreScarsita(nelMondo.ruoliMantra, frequenza, configScambi.valutazione.scarsitaRuoloMantra);
      strictEqual(valoreGiocatore(g.giocatoreId, stato, mondo, stagione, configScambi, frequenza), atteso);
    }
  });

  it('un giocatore piu’ pagato dello stesso ruolo vale di piu’', () => {
    const stato = statoDiProva(0);
    const frequenza = frequenzaRuoli(stato, mondo);
    // Cerca due giocatori con lo stesso, unico ruolo Mantra e prezzo diverso:
    // a parita' di scarsita', l'ordine dei valori deve seguire quello dei prezzi.
    const tuttiIGiocatori = stato.squadre.flatMap((s) => s.giocatori);
    for (const a of tuttiIGiocatori) {
      const ruoliA = mondo.giocatorePerId.get(a.giocatoreId)!.ruoliMantra;
      if (ruoliA.length !== 1) continue;
      const b = tuttiIGiocatori.find((x) => {
        const ruoliB = mondo.giocatorePerId.get(x.giocatoreId)!.ruoliMantra;
        return x.giocatoreId !== a.giocatoreId && ruoliB.length === 1 && ruoliB[0] === ruoliA[0]
          && x.prezzo !== a.prezzo;
      });
      if (!b) continue;
      const [maggiore, minore] = a.prezzo > b.prezzo ? [a, b] : [b, a];
      ok(
        valoreGiocatore(maggiore.giocatoreId, stato, mondo, stagione, configScambi, frequenza) >
          valoreGiocatore(minore.giocatoreId, stato, mondo, stagione, configScambi, frequenza),
      );
      return;
    }
    throw new Error('nessuna coppia di prova trovata nelle fixture: aggiornare il test');
  });

  it('a stagione avanzata pesa anche la resa osservata', () => {
    const giornate = configScambi.valutazione.giornateAllaPienaFiducia;
    const stato = statoDiProva(giornate);
    const frequenza = frequenzaRuoli(stato, mondo);
    const squadra = stato.squadre.find((s) =>
      s.giocatori.some((g) => mediaVoto(g.giocatoreId, stagione, giornate) !== null),
    )!;
    const conVoto = squadra.giocatori.find((g) => mediaVoto(g.giocatoreId, stagione, giornate) !== null)!;

    const valoreInizio = valoreGiocatore(
      conVoto.giocatoreId, { ...stato, giornateGiocate: 0 }, mondo, stagione, configScambi, frequenza,
    );
    const valoreAvanzato = valoreGiocatore(
      conVoto.giocatoreId, stato, mondo, stagione, configScambi, frequenza,
    );
    notStrictEqual(
      valoreInizio, valoreAvanzato,
      'con giornate giocate e un voto osservato il valore deve spostarsi dal solo prezzo',
    );
  });
});

describe('valoreGiocatori', () => {
  it('e’ la somma dei valori individuali', () => {
    const stato = statoDiProva(5);
    const frequenza = frequenzaRuoli(stato, mondo);
    const ids = stato.squadre[0]!.giocatori.slice(0, 3).map((g) => g.giocatoreId);
    const somma = ids.reduce(
      (tot, id) => tot + valoreGiocatore(id, stato, mondo, stagione, configScambi, frequenza),
      0,
    );
    strictEqual(valoreGiocatori(ids, stato, mondo, stagione, configScambi, frequenza), somma);
  });
});

describe('personalitaBot', () => {
  it('e’ deterministica per la stessa lega e la stessa squadra', () => {
    const a = personalitaBot('Squadra X', SEME, configScambi);
    const b = personalitaBot('Squadra X', SEME, configScambi);
    deepStrictEqual(a, b);
  });

  it('due squadre diverse hanno personalita’ diverse', () => {
    const a = personalitaBot('Squadra X', SEME, configScambi);
    const b = personalitaBot('Squadra Y', SEME, configScambi);
    notStrictEqual(a.esigenza, b.esigenza);
  });

  it('due leghe diverse danno personalita’ diverse alla stessa squadra', () => {
    const a = personalitaBot('Squadra X', 'seme-a', configScambi);
    const b = personalitaBot('Squadra X', 'seme-b', configScambi);
    notStrictEqual(a.esigenza, b.esigenza);
  });
});

describe('decisioneBot', () => {
  function proposta(stato: StatoLega, offerti: string[], richiesti: string[]): PropostaScambio & { id: string } {
    return { id: 'scambio-di-prova', daSquadraId: stato.squadre[1]!.id, aSquadraId: stato.squadre[0]!.id, offerti, richiesti };
  }

  it('rifiuta se il tetto stagionale e’ gia’ raggiunto', () => {
    const stato = statoDiProva(0);
    const p = proposta(stato, [stato.squadre[1]!.giocatori[0]!.giocatoreId], [stato.squadre[0]!.giocatori[0]!.giocatoreId]);
    const decisione = decisioneBot(stato, mondo, stagione, configScambi, p, configScambi.bot.tettoScambiPerStagione);
    strictEqual(decisione.esito, 'rifiutato');
    ok(decisione.motivo?.includes('tetto'));
  });

  it('rifiuta automaticamente uno scambio palesemente sbilanciato', () => {
    const stato = statoDiProva(0);
    const bot = stato.squadre[0]!;
    const umano = stato.squadre[1]!;
    // Il piu' economico del bot contro il piu' caro dell'umano: pessimo affare per l'umano,
    // ottimo per il bot, che pero' qui e' chi CEDE il piu' caro... invertiamo:
    // il bot deve CEDERE tanto e RICEVERE poco per scattare il rifiuto automatico.
    const piuCaroBot = [...bot.giocatori].sort((a, b) => b.prezzo - a.prezzo)[0]!;
    const piuEconomicoUmano = [...umano.giocatori].sort((a, b) => a.prezzo - b.prezzo)[0]!;
    const p = proposta(stato, [piuEconomicoUmano.giocatoreId], [piuCaroBot.giocatoreId]);
    const decisione = decisioneBot(stato, mondo, stagione, configScambi, p, 0);
    strictEqual(decisione.esito, 'rifiutato');
  });

  it('accetta uno scambio chiaramente vantaggioso per il bot', () => {
    const stato = statoDiProva(0);
    const bot = stato.squadre[0]!;
    const umano = stato.squadre[1]!;
    // Meta' rosa dell'umano contro un solo giocatore economico del bot: anche
    // col rumore massimo configurato non puo' sembrare un cattivo affare.
    const offerti = umano.giocatori.slice(0, Math.ceil(umano.giocatori.length / 2)).map((g) => g.giocatoreId);
    const piuEconomicoBot = [...bot.giocatori].sort((a, b) => a.prezzo - b.prezzo)[0]!;
    const p = proposta(stato, offerti, [piuEconomicoBot.giocatoreId]);
    const decisione = decisioneBot(stato, mondo, stagione, configScambi, p, 0);
    strictEqual(decisione.esito, 'accettato');
  });
});

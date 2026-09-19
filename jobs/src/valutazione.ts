/**
 * Valutazione dei giocatori e decisione dei bot sugli scambi (SPEC 6.5 e 7.1).
 *
 * Sta in `/jobs` e non in `/fanta` perche' attraversa il confine della regola
 * 7 di proposito: per stimare quanto vale un giocatore serve sia quanto la sua
 * squadra ha pagato all'asta (dato di lega) sia come si e' comportato nel
 * mondo simulato (dato di mondo). Tenerli separati vorrebbe dire non poter
 * rispondere alla domanda che la specifica pone.
 *
 * ## La valuta: quota del budget, non crediti assoluti
 *
 * SPEC 7.1 chiede una "percentuale sul budget circolante nella lega", mai
 * prezzi assoluti: l'economia e' inflazionistica. Qui si usa la quota sul
 * budget della *propria* squadra, che e' esattamente la stessa cosa perche'
 * tutte le squadre partono con lo stesso budget: confrontare due quote fra
 * squadre diverse e' gia' confrontare due percentuali del budget circolante,
 * senza bisogno di un'altra conversione.
 *
 * ## Le regole anti-exploit valgono solo per i bot
 *
 * Decisione del proprietario: fra due persone uno scambio passa sempre, e'
 * una loro scelta. Rumore, margine richiesto, soglia di rifiuto automatico e
 * tetto stagionale si applicano solo quando la controparte e' una squadra
 * senza proprietario.
 */

import type { MondoIndicizzato } from '../../engine/src/mondo.ts';
import type { StagioneSimulata } from '../../engine/src/stagione.ts';
import { generatore, seme } from '../../engine/src/casuale.ts';
import type { RuoloMantra } from '../../fanta/src/tipi.ts';
import { RUOLI_MANTRA } from '../../fanta/src/tipi.ts';
import { trovaSquadra, type ScambioSalvato, type SquadraSalvata, type StatoLega } from './archivio.ts';

/* ------------------------------------------------------------------ */
/* Configurazione                                                      */
/* ------------------------------------------------------------------ */

export type ConfigurazioneScambi = {
  versione: number;
  valutazione: {
    giornateAllaPienaFiducia: number;
    scarsitaRuoloMantra: { min: number; max: number };
  };
  bot: {
    rumorePercentuale: number;
    margineRichiesto: { base: number; variazionePersonalita: number };
    sogliaRifiutoAutomatico: number;
    tettoScambiPerStagione: number;
    /** Un bot valuta di proporre uno scambio di sua iniziativa al massimo ogni tante giornate. */
    proponiOgniGiornate: number;
  };
};

function esigi(condizione: boolean, messaggio: string): void {
  if (!condizione) throw new Error(`Configurazione degli scambi non valida: ${messaggio}`);
}

export function validaConfigurazioneScambi(c: ConfigurazioneScambi): ConfigurazioneScambi {
  esigi(c.versione === 1, `versione ${c.versione} non supportata`);
  esigi(c.valutazione.giornateAllaPienaFiducia > 0, 'valutazione.giornateAllaPienaFiducia deve essere positivo');
  esigi(c.valutazione.scarsitaRuoloMantra.min > 0, 'valutazione.scarsitaRuoloMantra.min deve essere positivo');
  esigi(
    c.valutazione.scarsitaRuoloMantra.max >= c.valutazione.scarsitaRuoloMantra.min,
    'valutazione.scarsitaRuoloMantra.max deve essere almeno min',
  );
  esigi(c.bot.rumorePercentuale >= 0, 'bot.rumorePercentuale non puo’ essere negativo');
  esigi(c.bot.margineRichiesto.base >= 0, 'bot.margineRichiesto.base non puo’ essere negativo');
  esigi(
    c.bot.margineRichiesto.variazionePersonalita >= 0,
    'bot.margineRichiesto.variazionePersonalita non puo’ essere negativo',
  );
  esigi(
    c.bot.sogliaRifiutoAutomatico >= 0 && c.bot.sogliaRifiutoAutomatico < 1,
    'bot.sogliaRifiutoAutomatico deve stare fra 0 e 1',
  );
  esigi(c.bot.tettoScambiPerStagione >= 0, 'bot.tettoScambiPerStagione non puo’ essere negativo');
  esigi(c.bot.proponiOgniGiornate >= 1, 'bot.proponiOgniGiornate deve essere almeno 1');
  return c;
}

/* ------------------------------------------------------------------ */
/* Valore di un giocatore                                              */
/* ------------------------------------------------------------------ */

/** Media dei voti (del mondo, non del fantavoto) fino a una certa giornata inclusa. */
export function mediaVoto(
  giocatoreId: string,
  stagione: StagioneSimulata,
  finoAGiornata: number,
): number | null {
  let somma = 0;
  let conteggio = 0;
  for (const partita of stagione.partite) {
    if (partita.giornata > finoAGiornata) continue;
    for (const p of partita.prestazioni) {
      if (p.giocatoreId !== giocatoreId || p.voto === null) continue;
      somma += p.voto;
      conteggio++;
    }
  }
  return conteggio > 0 ? somma / conteggio : null;
}

/** Quante volte ciascun ruolo Mantra compare fra tutti i giocatori rosati in lega. */
export function frequenzaRuoli(stato: StatoLega, mondo: MondoIndicizzato): ReadonlyMap<RuoloMantra, number> {
  const frequenza = new Map<RuoloMantra, number>(RUOLI_MANTRA.map((r) => [r, 0]));
  for (const squadra of stato.squadre) {
    for (const g of squadra.giocatori) {
      const nelMondo = mondo.giocatorePerId.get(g.giocatoreId);
      if (!nelMondo) continue;
      for (const ruolo of nelMondo.ruoliMantra) frequenza.set(ruolo, (frequenza.get(ruolo) ?? 0) + 1);
    }
  }
  return frequenza;
}

/** Quante volte ciascun ruolo Mantra compare nella rosa di **una** squadra: la base dei suoi buchi. */
export function frequenzaRuoliSquadra(
  squadra: SquadraSalvata,
  mondo: MondoIndicizzato,
): ReadonlyMap<RuoloMantra, number> {
  const frequenza = new Map<RuoloMantra, number>(RUOLI_MANTRA.map((r) => [r, 0]));
  for (const g of squadra.giocatori) {
    const nelMondo = mondo.giocatorePerId.get(g.giocatoreId);
    if (!nelMondo) continue;
    for (const ruolo of nelMondo.ruoliMantra) frequenza.set(ruolo, (frequenza.get(ruolo) ?? 0) + 1);
  }
  return frequenza;
}

/**
 * Il moltiplicatore di scarsita' del ruolo Mantra piu' raro fra quelli del
 * giocatore: chi copre piu' ruoli prende il migliore dei suoi, perche' la
 * flessibilita' e' un pregio, non una media.
 *
 * La stessa funzione serve sia la scarsita' di lega (frequenza calcolata su
 * tutte le rose) sia i buchi in rosa di una singola squadra (frequenza
 * calcolata sulla sua sola rosa, vedi `frequenzaRuoliSquadra`): "raro" e
 * "che mi manca" sono la stessa domanda posta su due popolazioni diverse.
 */
export function fattoreScarsita(
  ruoli: readonly RuoloMantra[],
  frequenza: ReadonlyMap<RuoloMantra, number>,
  cfg: ConfigurazioneScambi['valutazione']['scarsitaRuoloMantra'],
): number {
  const valori = [...frequenza.values()].filter((v) => v > 0);
  const media = valori.reduce((a, b) => a + b, 0) / Math.max(1, valori.length);
  if (media <= 0) return 1;

  let migliore = cfg.min;
  for (const ruolo of ruoli) {
    const f = frequenza.get(ruolo) ?? 0;
    const fattore = f > 0 ? media / f : cfg.max;
    migliore = Math.max(migliore, Math.min(cfg.max, fattore));
  }
  return migliore;
}

/**
 * Il valore di un giocatore, come quota del budget della sua squadra.
 *
 * Parte dal prezzo pagato all'asta e si sposta verso la resa osservata in
 * campo con una rampa lineare sulle giornate giocate: a inizio stagione conta
 * solo quanto si e' speso per lui, a stagione avanzata conta soprattutto come
 * ha giocato. Un giocatore mai sceso in campo resta valutato sul solo prezzo,
 * qualunque sia la giornata.
 */
export function valoreGiocatore(
  giocatoreId: string,
  stato: StatoLega,
  mondo: MondoIndicizzato,
  stagione: StagioneSimulata,
  config: ConfigurazioneScambi,
  frequenza: ReadonlyMap<RuoloMantra, number>,
): number {
  const squadra = stato.squadre.find((s) => s.giocatori.some((g) => g.giocatoreId === giocatoreId));
  if (!squadra) throw new Error(`Giocatore non rosato in nessuna squadra: ${giocatoreId}`);
  const inRosa = squadra.giocatori.find((g) => g.giocatoreId === giocatoreId)!;
  const nelMondo = mondo.giocatorePerId.get(giocatoreId);
  if (!nelMondo) throw new Error(`Giocatore sconosciuto al mondo: ${giocatoreId}`);

  const quotaPrezzo = inRosa.prezzo / stato.budget;

  const votiRosa = squadra.giocatori
    .map((g) => mediaVoto(g.giocatoreId, stagione, stato.giornateGiocate))
    .filter((v): v is number => v !== null);
  const sommaVotiRosa = votiRosa.reduce((a, b) => a + b, 0);
  const votoProprio = mediaVoto(giocatoreId, stagione, stato.giornateGiocate);

  const pesoOsservato =
    votoProprio === null || sommaVotiRosa <= 0
      ? 0
      : Math.min(1, stato.giornateGiocate / config.valutazione.giornateAllaPienaFiducia);
  const quotaOsservata = pesoOsservato > 0 ? votoProprio! / sommaVotiRosa : 0;

  const quota = quotaPrezzo * (1 - pesoOsservato) + quotaOsservata * pesoOsservato;
  return quota * fattoreScarsita(nelMondo.ruoliMantra, frequenza, config.valutazione.scarsitaRuoloMantra);
}

/** Il valore di un insieme di giocatori: la somma delle loro quote. */
export function valoreGiocatori(
  giocatoriIds: readonly string[],
  stato: StatoLega,
  mondo: MondoIndicizzato,
  stagione: StagioneSimulata,
  config: ConfigurazioneScambi,
  frequenza: ReadonlyMap<RuoloMantra, number>,
): number {
  return giocatoriIds.reduce(
    (somma, id) => somma + valoreGiocatore(id, stato, mondo, stagione, config, frequenza),
    0,
  );
}

/**
 * Il valore di un giocatore **per chi lo riceverebbe** (SPEC 7.1 punto 3,
 * "correzione ... per i buchi in rosa"): il valore di mercato di
 * `valoreGiocatore`, corretto da quanto quella squadra specifica ha bisogno
 * del suo ruolo. Un playmaker in piu' vale il suo prezzo di mercato per
 * chiunque, ma vale di piu' per chi non ne ha nessuno in rosa.
 */
export function valoreGiocatorePerRicevente(
  giocatoreId: string,
  stato: StatoLega,
  mondo: MondoIndicizzato,
  stagione: StagioneSimulata,
  config: ConfigurazioneScambi,
  frequenzaLega: ReadonlyMap<RuoloMantra, number>,
  ricevente: SquadraSalvata,
): number {
  const base = valoreGiocatore(giocatoreId, stato, mondo, stagione, config, frequenzaLega);
  const nelMondo = mondo.giocatorePerId.get(giocatoreId);
  if (!nelMondo) throw new Error(`Giocatore sconosciuto al mondo: ${giocatoreId}`);
  const bisogno = fattoreScarsita(
    nelMondo.ruoliMantra,
    frequenzaRuoliSquadra(ricevente, mondo),
    config.valutazione.scarsitaRuoloMantra,
  );
  return base * bisogno;
}

/** Il valore per chi riceve di un insieme di giocatori: la somma delle loro quote corrette. */
export function valoreGiocatoriPerRicevente(
  giocatoriIds: readonly string[],
  stato: StatoLega,
  mondo: MondoIndicizzato,
  stagione: StagioneSimulata,
  config: ConfigurazioneScambi,
  frequenzaLega: ReadonlyMap<RuoloMantra, number>,
  ricevente: SquadraSalvata,
): number {
  return giocatoriIds.reduce(
    (somma, id) =>
      somma + valoreGiocatorePerRicevente(id, stato, mondo, stagione, config, frequenzaLega, ricevente),
    0,
  );
}

/* ------------------------------------------------------------------ */
/* Personalita' e decisione dei bot                                    */
/* ------------------------------------------------------------------ */

export type Personalita = {
  /** Sopra il margine base, quanto in piu' pretende questo bot per dire di si'. */
  esigenza: number;
  /** Ampiezza del rumore di valutazione di questo bot: quanto e' incostante. */
  rumoreAmpiezza: number;
};

/**
 * La personalita' di un bot: stabile per tutta la stagione perche' seminata
 * su (seme di lega, squadra), non su un orologio. Lo stesso bot e' sempre
 * un po' piu' esigente o un po' piu' incostante degli altri, e lo resta.
 */
export function personalitaBot(
  squadraId: string,
  semeLega: string,
  config: ConfigurazioneScambi,
): Personalita {
  const g = generatore(seme(semeLega, squadraId, 'personalita-scambi'));
  return {
    esigenza: g.reale() * config.bot.margineRichiesto.variazionePersonalita,
    rumoreAmpiezza: config.bot.rumorePercentuale * (0.5 + g.reale()),
  };
}

export type DecisioneBot = {
  esito: 'accettato' | 'rifiutato';
  motivo: string | null;
};

/**
 * Decide se un bot accetta uno scambio proposto alla sua squadra.
 *
 * Ordine dei controlli, dal piu' al meno definitivo: prima il tetto
 * stagionale e la soglia di rifiuto automatico, che nessun rumore puo'
 * scavalcare; poi il confronto di valore vero e proprio, con rumore e
 * margine di personalita'.
 */
export function decisioneBot(
  stato: StatoLega,
  mondo: MondoIndicizzato,
  stagione: StagioneSimulata,
  config: ConfigurazioneScambi,
  scambio: Pick<ScambioSalvato, 'id' | 'aSquadraId' | 'offerti' | 'richiesti'>,
  scambiAccettatiFinora: number,
): DecisioneBot {
  if (scambiAccettatiFinora >= config.bot.tettoScambiPerStagione) {
    return {
      esito: 'rifiutato',
      motivo: `Ha gia' fatto ${scambiAccettatiFinora} scambi questa stagione: il tetto e' ${config.bot.tettoScambiPerStagione}.`,
    };
  }

  const frequenza = frequenzaRuoli(stato, mondo);
  const bot = trovaSquadra(stato, scambio.aSquadraId);
  // Quello che il bot riceve vale anche quanto gli serve (SPEC 7.1 punto 3);
  // quello che cede resta al valore di mercato, che non dipende da lui.
  const valoreOfferto = valoreGiocatoriPerRicevente(scambio.offerti, stato, mondo, stagione, config, frequenza, bot);
  const valoreRichiesto = valoreGiocatori(scambio.richiesti, stato, mondo, stagione, config, frequenza);

  if (valoreOfferto < valoreRichiesto * (1 - config.bot.sogliaRifiutoAutomatico)) {
    return {
      esito: 'rifiutato',
      motivo: 'Il valore offerto e’ troppo sotto quello richiesto: rifiuto automatico anti-exploit.',
    };
  }

  const personalita = personalitaBot(scambio.aSquadraId, stato.seme, config);
  const rng = generatore(seme(stato.seme, scambio.id, 'valutazione-scambio'));
  const rumore = 1 + (rng.reale() * 2 - 1) * personalita.rumoreAmpiezza;
  const percepito = valoreOfferto * rumore;
  const margineRichiesto = config.bot.margineRichiesto.base + personalita.esigenza;

  if (percepito >= valoreRichiesto * (1 + margineRichiesto)) {
    return { esito: 'accettato', motivo: null };
  }
  return {
    esito: 'rifiutato',
    motivo: 'Il valore, anche con un margine di rumore, non copre quello che chiederebbe in cambio.',
  };
}

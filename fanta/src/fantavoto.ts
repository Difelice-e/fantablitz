/**
 * Dal voto al fantavoto, e dai fantavoti ai fantapunti (SPEC 4 e 5.5 punto 8).
 *
 * E' qui che si attraversa il confine della regola 7. Il **voto** appartiene al
 * mondo simulato: e' lo stesso per tutte le leghe che girano su quel mondo, e
 * il motore lo produce senza sapere che esistano i bonus. Il **fantavoto**
 * appartiene alla lega: due leghe sullo stesso mondo possono assegnare punteggi
 * diversi alla stessa identica partita.
 *
 * Il motore, infatti, non compare da nessuna parte in questo file: gli eventi
 * arrivano come dato, in una forma che il chiamante costruisce.
 */

import type { RuoloClassico, Schierabile } from './tipi.ts';

/** Bonus e malus di un giocatore in una giornata. */
export type EventiFanta = {
  gol: number;
  rigoriSegnati: number;
  assist: number;
  rigoriParati: number;
  rigoriSbagliati: number;
  autogol: number;
  ammonizioni: number;
  espulso: boolean;
  /** Solo per i portieri. */
  golSubiti: number;
};

export const EVENTI_VUOTI: EventiFanta = {
  gol: 0, rigoriSegnati: 0, assist: 0, rigoriParati: 0, rigoriSbagliati: 0,
  autogol: 0, ammonizioni: 0, espulso: false, golSubiti: 0,
};

export type Soglia = { media: number; bonus: number };

export type ConfigurazioneLega = {
  versione: number;
  bonus: {
    gol: number;
    rigoreSegnato: number;
    assist: number;
    rigoreParato: number;
    imbattibilitaPortiere: number;
  };
  malus: {
    ammonizione: number;
    espulsione: number;
    rigoreSbagliato: number;
    autogol: number;
    golSubito: number;
    adattamento: number;
  };
  modificatoreDifesa: {
    attivo: boolean;
    includiPortiere: boolean;
    difensoriRichiesti: number;
    soglie: Soglia[];
  };
  modificatorePortiere: { attivo: boolean; soglie: Soglia[] };
  soglieGol: { base: number; scarti: number[] };
};

/* ------------------------------------------------------------------ */
/* Validazione                                                         */
/* ------------------------------------------------------------------ */

function esigi(condizione: boolean, messaggio: string): void {
  if (!condizione) throw new Error(`Configurazione di lega non valida: ${messaggio}`);
}

function validaSoglie(soglie: Soglia[], dove: string): void {
  for (let i = 1; i < soglie.length; i++) {
    esigi(
      soglie[i]!.media > soglie[i - 1]!.media,
      `${dove}: le soglie devono essere in ordine crescente di media`,
    );
  }
}

export function validaConfigurazioneLega(c: ConfigurazioneLega): ConfigurazioneLega {
  esigi(c.versione === 1, `versione ${c.versione} non supportata`);
  esigi(c.soglieGol.base > 0, 'soglieGol.base deve essere positiva');
  esigi(c.soglieGol.scarti.length > 0, 'soglieGol: serve almeno uno scarto');
  for (const s of c.soglieGol.scarti) esigi(s > 0, 'soglieGol: gli scarti devono essere positivi');
  validaSoglie(c.modificatoreDifesa.soglie, 'modificatoreDifesa');
  validaSoglie(c.modificatorePortiere.soglie, 'modificatorePortiere');
  esigi(
    c.modificatoreDifesa.difensoriRichiesti >= 1,
    'modificatoreDifesa: serve almeno un difensore',
  );
  return c;
}

/* ------------------------------------------------------------------ */
/* Fantavoto individuale                                               */
/* ------------------------------------------------------------------ */

export type PrestazioneFanta = {
  giocatore: Schierabile;
  /** Voto del mondo simulato, `null` per il senza voto. */
  voto: number | null;
  eventi: EventiFanta;
  /** Schierato fuori posizione: in Mantra costa il malus di adattamento. */
  adattato: boolean;
};

export type FantavotoCalcolato = {
  giocatoreId: string;
  /** Il voto puro, che serve ai modificatori. `null` se senza voto. */
  voto: number | null;
  /** Somma dei bonus, al netto dei malus e dell'adattamento. */
  bonus: number;
  /** `null` se il giocatore e' senza voto e quindi non porta punteggio. */
  fantavoto: number | null;
};

/**
 * Somma dei bonus e dei malus di un giocatore.
 *
 * I gol su rigore hanno una voce separata perche' alcune leghe li pagano meno
 * di un gol su azione. L'imbattibilita' del portiere si deduce dai gol subiti,
 * e vale solo se il portiere e' rimasto in campo abbastanza da avere un voto.
 */
export function bonusDi(
  prestazione: PrestazioneFanta,
  c: ConfigurazioneLega,
): number {
  const { eventi, giocatore } = prestazione;
  const eePortiere = giocatore.ruoloClassico === 'P';

  let totale = 0;
  totale += eventi.gol * c.bonus.gol;
  totale += eventi.rigoriSegnati * c.bonus.rigoreSegnato;
  totale += eventi.assist * c.bonus.assist;
  totale += eventi.rigoriParati * c.bonus.rigoreParato;

  totale -= eventi.ammonizioni * c.malus.ammonizione;
  totale -= eventi.espulso ? c.malus.espulsione : 0;
  totale -= eventi.rigoriSbagliati * c.malus.rigoreSbagliato;
  totale -= eventi.autogol * c.malus.autogol;

  if (eePortiere) {
    totale -= eventi.golSubiti * c.malus.golSubito;
    if (eventi.golSubiti === 0 && prestazione.voto !== null) {
      totale += c.bonus.imbattibilitaPortiere;
    }
  }

  // Il malus di adattamento e' un fatto di lega come gli altri: in classic gli
  // adattamenti non esistono, quindi qui non arriva mai `adattato: true`.
  if (prestazione.adattato) totale -= c.malus.adattamento;

  return totale;
}

export function calcolaFantavoto(
  prestazione: PrestazioneFanta,
  c: ConfigurazioneLega,
): FantavotoCalcolato {
  const bonus = bonusDi(prestazione, c);
  return {
    giocatoreId: prestazione.giocatore.id,
    voto: prestazione.voto,
    bonus,
    // Senza voto non si porta punteggio: il giocatore andrebbe sostituito, e se
    // non lo e' stato vale zero, non il solo bonus.
    fantavoto: prestazione.voto === null ? null : prestazione.voto + bonus,
  };
}

/* ------------------------------------------------------------------ */
/* Modificatori                                                        */
/* ------------------------------------------------------------------ */

/** Il bonus della soglia piu' alta raggiunta, zero se non se ne raggiunge nessuna. */
export function bonusPerSoglia(media: number, soglie: readonly Soglia[]): number {
  let bonus = 0;
  for (const s of soglie) if (media >= s.media) bonus = s.bonus;
  return bonus;
}

export type EsitoModificatore = {
  applicato: boolean;
  /** Perche' non e' stato applicato, quando non lo e' stato. */
  motivo?: string;
  media?: number;
  bonus: number;
};

/**
 * Modificatore di difesa.
 *
 * Si calcola sulla media dei **voti puri**, senza bonus ne' malus: un difensore
 * che segna non rende la difesa piu' solida. Serve che tutti i giocatori
 * considerati portino un voto, altrimenti non si applica affatto — non si
 * ripiega su una media parziale, che sarebbe piu' generosa proprio quando la
 * squadra ha schierato meno gente.
 */
export function modificatoreDifesa(
  prestazioni: readonly FantavotoCalcolato[],
  ruoli: ReadonlyMap<string, RuoloClassico>,
  c: ConfigurazioneLega,
): EsitoModificatore {
  const m = c.modificatoreDifesa;
  if (!m.attivo) return { applicato: false, motivo: 'modificatore spento', bonus: 0 };

  const conVoto = prestazioni.filter((p) => p.voto !== null);
  const difensori = conVoto
    .filter((p) => ruoli.get(p.giocatoreId) === 'D')
    .map((p) => p.voto!)
    .sort((a, b) => b - a);

  if (difensori.length < m.difensoriRichiesti) {
    return {
      applicato: false,
      motivo:
        `servono ${m.difensoriRichiesti} difensori col voto, ce ne sono ${difensori.length}`,
      bonus: 0,
    };
  }

  const voti: number[] = [];
  if (m.includiPortiere) {
    const portiere = conVoto.find((p) => ruoli.get(p.giocatoreId) === 'P');
    if (!portiere) {
      return { applicato: false, motivo: 'il portiere non porta voto', bonus: 0 };
    }
    voti.push(portiere.voto!, ...difensori.slice(0, m.difensoriRichiesti - 1));
  } else {
    voti.push(...difensori.slice(0, m.difensoriRichiesti));
  }

  const media = voti.reduce((a, b) => a + b, 0) / voti.length;
  return { applicato: true, media, bonus: bonusPerSoglia(media, m.soglie) };
}

/** Modificatore portiere: dipende dal solo voto del portiere. */
export function modificatorePortiere(
  prestazioni: readonly FantavotoCalcolato[],
  ruoli: ReadonlyMap<string, RuoloClassico>,
  c: ConfigurazioneLega,
): EsitoModificatore {
  const m = c.modificatorePortiere;
  if (!m.attivo) return { applicato: false, motivo: 'modificatore spento', bonus: 0 };

  const portiere = prestazioni.find((p) => ruoli.get(p.giocatoreId) === 'P' && p.voto !== null);
  if (!portiere) return { applicato: false, motivo: 'il portiere non porta voto', bonus: 0 };

  return {
    applicato: true,
    media: portiere.voto!,
    bonus: bonusPerSoglia(portiere.voto!, m.soglie),
  };
}

/* ------------------------------------------------------------------ */
/* Fantapunti di squadra                                               */
/* ------------------------------------------------------------------ */

export type PunteggioSquadra = {
  fantapunti: number;
  /** Somma dei fantavoti degli undici, prima dei modificatori. */
  sommaFantavoti: number;
  difesa: EsitoModificatore;
  portiere: EsitoModificatore;
  prestazioni: FantavotoCalcolato[];
  /** Chi e' sceso in campo senza portare voto: vale zero. */
  senzaVoto: string[];
};

/**
 * Fantapunti di una squadra in una giornata.
 *
 * Chi resta senza voto contribuisce **zero**, non il solo bonus: e' la ragione
 * per cui prima di arrivare qui si prova a sostituirlo con la panchina.
 */
export function punteggioSquadra(
  prestazioni: readonly PrestazioneFanta[],
  c: ConfigurazioneLega,
): PunteggioSquadra {
  const calcolate = prestazioni.map((p) => calcolaFantavoto(p, c));
  const ruoli = new Map<string, RuoloClassico>(
    prestazioni.map((p) => [p.giocatore.id, p.giocatore.ruoloClassico]),
  );

  const sommaFantavoti = calcolate.reduce((a, p) => a + (p.fantavoto ?? 0), 0);
  const difesa = modificatoreDifesa(calcolate, ruoli, c);
  const portiere = modificatorePortiere(calcolate, ruoli, c);

  return {
    fantapunti: sommaFantavoti + difesa.bonus + portiere.bonus,
    sommaFantavoti,
    difesa,
    portiere,
    prestazioni: calcolate,
    senzaVoto: calcolate.filter((p) => p.fantavoto === null).map((p) => p.giocatoreId),
  };
}

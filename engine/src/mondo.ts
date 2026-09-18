/**
 * Il mondo simulato: tipi e caricamento.
 *
 * Il motore riceve il mondo come **dato**, mai come import di codice: legge il
 * `mondo.json` prodotto da `/seed` e lo valida. Non conosce Fantacalcio.it, non
 * conosce i riferimenti esterni, non sa nulla della modalita' di lega. Sa solo
 * che esistono club e giocatori con dei rating.
 *
 * Questa e' la frontiera fra il mondo simulato e tutto il resto: qui dentro non
 * esiste il concetto di fantallenatore, di crediti o di bonus (regola 7).
 */

export const RUOLI_MANTRA = [
  'Por', 'Dc', 'B', 'Dd', 'Ds', 'E', 'M', 'C', 'W', 'T', 'A', 'Pc',
] as const;
export type RuoloMantra = (typeof RUOLI_MANTRA)[number];

export const RUOLI_CLASSICI = ['P', 'D', 'C', 'A'] as const;
export type RuoloClassico = (typeof RUOLI_CLASSICI)[number];

export const COMPETIZIONI = ['champions', 'europa', 'conference'] as const;
export type Competizione = (typeof COMPETIZIONI)[number];

export type Aree = { attacco: number; difesa: number; tecnica: number; fisico: number };
export type Propensioni = { gol: number; assist: number; cartellino: number; infortunio: number };

export type Club = {
  id: string;
  nome: string;
  abbreviazione: string;
  colore: string;
  /** Impegno europeo: consuma condizione senza generare partite (SPEC 5.3). */
  coppa: Competizione | null;
};

export type Giocatore = {
  id: string;
  nome: string;
  clubId: string;
  ruoliMantra: RuoloMantra[];
  ruoloClassico: RuoloClassico;
  eta: number;
  etaPicco: number;
  overall: number;
  potenziale: number;
  rating: Aree;
  propensioni: Propensioni;
};

export type Mondo = {
  versione: number;
  stagione: string;
  club: Club[];
  giocatori: Giocatore[];
};

/** Mondo con gli indici gia' pronti: evita di rifiltrare a ogni partita. */
export type MondoIndicizzato = Mondo & {
  clubPerId: ReadonlyMap<string, Club>;
  giocatorePerId: ReadonlyMap<string, Giocatore>;
  rosaPerClub: ReadonlyMap<string, readonly Giocatore[]>;
};

/* ------------------------------------------------------------------ */

function esigi(condizione: boolean, messaggio: string): void {
  if (!condizione) throw new Error(`Mondo non valido: ${messaggio}`);
}

function stringa(v: unknown, dove: string): string {
  esigi(typeof v === 'string' && v !== '', `${dove}: stringa attesa, trovato ${JSON.stringify(v)}`);
  return v as string;
}

function numero(v: unknown, dove: string): number {
  esigi(typeof v === 'number' && Number.isFinite(v), `${dove}: numero atteso, trovato ${JSON.stringify(v)}`);
  return v as number;
}

/**
 * Valida e tipizza il contenuto di `mondo.json`.
 *
 * La lettura del file avviene fuori dal motore: qui entra un valore gia'
 * deserializzato, cosi' `/engine` non tocca il filesystem e resta usabile
 * ovunque.
 */
export function caricaMondo(grezzo: unknown): Mondo {
  esigi(typeof grezzo === 'object' && grezzo !== null, 'atteso un oggetto');
  const d = grezzo as Record<string, unknown>;

  const versione = numero(d.versione, 'versione');
  esigi(versione === 1, `versione ${versione} non supportata da questo motore`);
  const stagione = stringa(d.stagione, 'stagione');

  esigi(Array.isArray(d.club) && d.club.length > 0, 'elenco dei club assente o vuoto');
  esigi(Array.isArray(d.giocatori) && d.giocatori.length > 0, 'elenco dei giocatori assente o vuoto');

  const club: Club[] = (d.club as Record<string, unknown>[]).map((c, i) => {
    const dove = `club[${i}]`;
    const coppa = c.coppa ?? null;
    esigi(
      coppa === null || (COMPETIZIONI as readonly unknown[]).includes(coppa),
      `${dove}: competizione "${String(coppa)}" sconosciuta`,
    );
    return {
      id: stringa(c.id, `${dove}.id`),
      nome: stringa(c.nome, `${dove}.nome`),
      abbreviazione: stringa(c.abbreviazione, `${dove}.abbreviazione`),
      colore: stringa(c.colore, `${dove}.colore`),
      coppa: coppa as Competizione | null,
    };
  });

  const idClub = new Set<string>();
  for (const c of club) {
    esigi(!idClub.has(c.id), `identificativo di club duplicato: ${c.id}`);
    idClub.add(c.id);
  }

  const giocatori: Giocatore[] = (d.giocatori as Record<string, unknown>[]).map((g, i) => {
    const dove = `giocatori[${i}]`;
    const rating = (g.rating ?? {}) as Record<string, unknown>;
    const propensioni = (g.propensioni ?? {}) as Record<string, unknown>;

    const ruoliMantra = g.ruoliMantra;
    esigi(
      Array.isArray(ruoliMantra) && ruoliMantra.length > 0,
      `${dove}.ruoliMantra: atteso almeno un ruolo`,
    );
    for (const r of ruoliMantra as unknown[]) {
      esigi((RUOLI_MANTRA as readonly unknown[]).includes(r), `${dove}: ruolo Mantra "${String(r)}" sconosciuto`);
    }
    esigi(
      (RUOLI_CLASSICI as readonly unknown[]).includes(g.ruoloClassico),
      `${dove}: ruolo classico "${String(g.ruoloClassico)}" sconosciuto`,
    );

    const clubId = stringa(g.clubId, `${dove}.clubId`);
    esigi(idClub.has(clubId), `${dove}: club "${clubId}" inesistente`);

    return {
      id: stringa(g.id, `${dove}.id`),
      nome: stringa(g.nome, `${dove}.nome`),
      clubId,
      ruoliMantra: ruoliMantra as RuoloMantra[],
      ruoloClassico: g.ruoloClassico as RuoloClassico,
      eta: numero(g.eta, `${dove}.eta`),
      etaPicco: numero(g.etaPicco, `${dove}.etaPicco`),
      overall: numero(g.overall, `${dove}.overall`),
      potenziale: numero(g.potenziale, `${dove}.potenziale`),
      rating: {
        attacco: numero(rating.attacco, `${dove}.rating.attacco`),
        difesa: numero(rating.difesa, `${dove}.rating.difesa`),
        tecnica: numero(rating.tecnica, `${dove}.rating.tecnica`),
        fisico: numero(rating.fisico, `${dove}.rating.fisico`),
      },
      propensioni: {
        gol: numero(propensioni.gol, `${dove}.propensioni.gol`),
        assist: numero(propensioni.assist, `${dove}.propensioni.assist`),
        cartellino: numero(propensioni.cartellino, `${dove}.propensioni.cartellino`),
        infortunio: numero(propensioni.infortunio, `${dove}.propensioni.infortunio`),
      },
    };
  });

  const idGiocatori = new Set<string>();
  for (const g of giocatori) {
    esigi(!idGiocatori.has(g.id), `identificativo di giocatore duplicato: ${g.id}`);
    idGiocatori.add(g.id);
  }

  // Un club senza portieri manderebbe l'allenatore automatico in un vicolo cieco
  // alla prima partita: meglio accorgersene qui, con un messaggio chiaro.
  for (const c of club) {
    const rosa = giocatori.filter((g) => g.clubId === c.id);
    esigi(rosa.length >= 11, `${c.nome}: solo ${rosa.length} giocatori, non bastano per una partita`);
    esigi(
      rosa.some((g) => g.ruoloClassico === 'P'),
      `${c.nome}: nessun portiere in rosa`,
    );
  }

  return { versione, stagione, club, giocatori };
}

/** Prepara gli indici usati a ogni partita. */
export function indicizza(mondo: Mondo): MondoIndicizzato {
  const rosaPerClub = new Map<string, Giocatore[]>();
  for (const c of mondo.club) rosaPerClub.set(c.id, []);
  for (const g of mondo.giocatori) rosaPerClub.get(g.clubId)!.push(g);

  return {
    ...mondo,
    clubPerId: new Map(mondo.club.map((c) => [c.id, c])),
    giocatorePerId: new Map(mondo.giocatori.map((g) => [g.id, g])),
    rosaPerClub,
  };
}

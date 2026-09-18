/**
 * Costruzione del seed a partire dal listone e dalla configurazione.
 *
 * Escono due file, e la separazione e' voluta.
 *
 *   mondo.json                 il mondo simulato: club, giocatori, rating.
 *                              Nessun riferimento a Fantacalcio.it.
 *   riferimenti-esterni.json   la corrispondenza fra gli identificativi interni
 *                              e gli Id di Fantacalcio.it, piu' i dati di
 *                              origine che servono a validare gli import.
 *
 * Il motivo e' la regola 2 di CLAUDE.md: il `Fantacalcio_Id` e' un riferimento
 * esterno, non la chiave del dominio. Tenendolo in un file a parte il vincolo
 * non puo' essere violato per distrazione: chi carica il mondo non ha
 * nemmeno modo di indicizzare sull'identificativo esterno.
 */

import { createHash } from 'node:crypto';
import type { Listone, RigaListone } from './listone.ts';
import type { Competizione, Configurazione } from './configurazione.ts';
import { COMPETIZIONI } from './configurazione.ts';
import { derivaGiocatore, qualitaPerGiocatore } from './derivazione.ts';
import { identificativo } from './casuale.ts';
import type { RuoloClassico, RuoloMantra } from './ruoli.ts';
import { nomiDiFantasia } from './fantasia.ts';

export type ClubSeed = {
  id: string;
  nome: string;
  abbreviazione: string;
  colore: string;
  /** Impegno europeo della stagione: consuma condizione senza generare partite. */
  coppa: Competizione | null;
};

export type GiocatoreSeed = {
  id: string;
  nome: string;
  clubId: string;
  ruoliMantra: RuoloMantra[];
  ruoloClassico: RuoloClassico;
  eta: number;
  etaPicco: number;
  overall: number;
  potenziale: number;
  rating: { attacco: number; difesa: number; tecnica: number; fisico: number };
  propensioni: { gol: number; assist: number; cartellino: number; infortunio: number };
};

export type Mondo = {
  versione: number;
  stagione: string;
  sorgente: { impronta: string; anonimizzato: boolean };
  club: ClubSeed[];
  giocatori: GiocatoreSeed[];
};

export type RiferimentiEsterni = {
  versione: number;
  fonte: string;
  stagione: string;
  club: { clubId: string; sigla: string; nomeFonte: string }[];
  giocatori: {
    giocatoreId: string;
    idEsterno: number;
    nomeFonte: string;
    squadraFonte: string;
    ruoloFonte: RuoloClassico;
    ruoliMantraFonte: string;
    quotazioneAsta: number;
    quotazioneIniziale: number;
    quotazioneAstaMantra: number;
    quotazioneInizialeMantra: number;
    valoreMercato: number;
    valoreMercatoMantra: number;
  }[];
  /** Id dei ceduti: servono all'importatore per spiegare bene un id non trovato. */
  ceduti: number[];
};

export type Avviso = { tipo: string; messaggio: string };

export type Risultato = {
  mondo: Mondo;
  riferimenti: RiferimentiEsterni;
  avvisi: Avviso[];
};

export type OpzioniCostruzione = {
  stagione: string;
  /** Impronta SHA-256 del listone di partenza: rende il seed tracciabile. */
  improntaListone: string;
  /** Sostituisce nomi di club e giocatori con nomi inventati. */
  anonimizza?: boolean;
};

const VERSIONE_SEED = 1;

/* ------------------------------------------------------------------ */

/** Abbreviazione di tre lettere ricavata dal nome, unica nel gruppo. */
function abbrevia(nome: string, gia: Set<string>): string {
  const lettere = nome.toUpperCase().normalize('NFD').replace(/[^A-Z]/g, '');
  const candidati: string[] = [lettere.slice(0, 3)];
  for (let i = 1; i + 2 < lettere.length; i++) candidati.push(lettere[0]! + lettere.slice(i, i + 2));
  for (const c of candidati) {
    if (c.length === 3 && !gia.has(c)) return c;
  }
  // Ripiego: prime due lettere piu' una cifra progressiva.
  for (let n = 1; n <= 9; n++) {
    const c = `${lettere.slice(0, 2)}${n}`;
    if (!gia.has(c)) return c;
  }
  throw new Error(`Impossibile abbreviare "${nome}" senza collisioni`);
}

/**
 * Assegna gli impegni europei ai club piu' forti del listone.
 *
 * La forza e' la somma degli overall dei migliori N giocatori, non di tutta la
 * rosa: una rosa lunga di comprimari non deve valere quanto una corta di
 * titolari forti. Ricavare le qualificate dai dati invece che dalla classifica
 * reale della scorsa stagione tiene il seed coerente col mondo simulato e
 * indipendente da fatti esterni.
 */
function assegnaCoppe(
  club: ClubSeed[],
  giocatori: GiocatoreSeed[],
  configurazione: Configurazione,
): Avviso[] {
  const { coppe } = configurazione.parametri;
  const avvisi: Avviso[] = [];

  if (coppe.modalita === 'elenco') {
    const perNome = new Map(configurazione.club.map((c) => [c.nome, c.coppa]));
    for (const c of club) c.coppa = perNome.get(c.nome) ?? null;
    if (club.every((c) => c.coppa === null)) {
      avvisi.push({
        tipo: 'coppe',
        messaggio:
          'coppe.modalita = "elenco" ma nessun club ha un impegno europeo in club.json: ' +
          'nessuna rotazione da coppe verra’ simulata.',
      });
    }
    return avvisi;
  }

  const forza = new Map<string, number>();
  for (const c of club) {
    const overall = giocatori
      .filter((g) => g.clubId === c.id)
      .map((g) => g.overall)
      .sort((a, b) => b - a)
      .slice(0, coppe.giocatoriConsideratiPerForza);
    forza.set(c.id, overall.reduce((a, b) => a + b, 0));
  }

  // A parita' di forza decide il nome, cosi' l'ordine non dipende dal caso.
  const classifica = [...club].sort(
    (a, b) => forza.get(b.id)! - forza.get(a.id)! || a.nome.localeCompare(b.nome, 'it'),
  );

  let i = 0;
  for (const competizione of COMPETIZIONI) {
    for (let n = 0; n < (coppe.posti[competizione] ?? 0) && i < classifica.length; n++, i++) {
      classifica[i]!.coppa = competizione;
    }
  }
  if (i > club.length) {
    avvisi.push({
      tipo: 'coppe',
      messaggio: `I posti europei configurati (${i}) superano il numero di club (${club.length}).`,
    });
  }
  return avvisi;
}

/* ------------------------------------------------------------------ */

export function costruisciSeed(
  listone: Listone,
  configurazione: Configurazione,
  opzioni: OpzioniCostruzione,
): Risultato {
  const { parametri, override } = configurazione;
  const avvisi: Avviso[] = [];

  if (listone.esclusiPerCessione.length > 0) {
    avvisi.push({
      tipo: 'ceduti',
      messaggio:
        `${listone.esclusiPerCessione.length} giocatori comparivano sia in "Tutti" sia in ` +
        `"Ceduti" e sono stati esclusi: ${listone.esclusiPerCessione.join(', ')}`,
    });
  }

  /* --- club ------------------------------------------------------- */

  const perNomeSorgente = new Map(configurazione.club.map((c) => [c.nome, c]));
  const nomiNelListone = [...new Set(listone.giocatori.map((g) => g.squadra))].sort((a, b) =>
    a.localeCompare(b, 'it'),
  );

  const sconosciuti = nomiNelListone.filter((n) => !perNomeSorgente.has(n));
  if (sconosciuti.length > 0) {
    throw new Error(
      `Club presenti nel listone ma assenti da config/club.json: ${sconosciuti.join(', ')}.\n` +
        'Aggiungili al file con la sigla a tre lettere usata dagli export Fantalab. ' +
        'Non indovinare la sigla: leggila da un export reale, perche’ e’ la chiave ' +
        'con cui l’importatore riconoscera’ il club.',
    );
  }

  const inutilizzati = configurazione.club.filter((c) => !nomiNelListone.includes(c.nome));
  if (inutilizzati.length > 0) {
    avvisi.push({
      tipo: 'club',
      messaggio:
        `Club configurati ma senza giocatori nel listone, non inseriti nel seed: ` +
        inutilizzati.map((c) => `${c.nome} (${c.sigla})`).join(', '),
    });
  }

  const fantasia = nomiDiFantasia(parametri.semeGlobale);
  const abbreviazioni = new Set<string>();
  const club: ClubSeed[] = [];
  const clubPerNomeSorgente = new Map<string, ClubSeed>();

  nomiNelListone.forEach((nomeSorgente, indice) => {
    const configurato = perNomeSorgente.get(nomeSorgente)!;
    // L'identificativo nasce dalla sigla, non dal nome: resta lo stesso anche
    // quando i nomi vengono sostituiti con nomi di fantasia.
    const id = identificativo('c', parametri.semeGlobale, configurato.sigla);
    const nome = opzioni.anonimizza ? fantasia.club(indice) : nomeSorgente;
    const voce: ClubSeed = {
      id,
      nome,
      abbreviazione: abbrevia(nome, abbreviazioni),
      colore: configurato.colore,
      coppa: null,
    };
    abbreviazioni.add(voce.abbreviazione);
    club.push(voce);
    clubPerNomeSorgente.set(nomeSorgente, voce);
  });

  /* --- giocatori --------------------------------------------------- */

  const qualita = qualitaPerGiocatore(listone.giocatori, parametri);
  const giocatori: GiocatoreSeed[] = [];
  const riferimentiGiocatori: RiferimentiEsterni['giocatori'] = [];
  const overrideUsati = new Set<number>();

  for (const riga of listone.giocatori) {
    const derivato = derivaGiocatore(
      riga,
      qualita.get(riga.idEsterno)!,
      parametri,
      parametri.semeGlobale,
    );

    const id = identificativo('g', parametri.semeGlobale, riga.idEsterno);
    const voce: GiocatoreSeed = {
      id,
      nome: opzioni.anonimizza ? fantasia.giocatore(riga.idEsterno) : riga.nome,
      clubId: clubPerNomeSorgente.get(riga.squadra)!.id,
      ruoliMantra: riga.ruoliMantra,
      ruoloClassico: riga.ruoloClassico,
      eta: derivato.eta,
      etaPicco: derivato.etaPicco,
      overall: derivato.overall,
      potenziale: derivato.potenziale,
      rating: derivato.aree,
      propensioni: derivato.propensioni,
    };

    const correzioni = override.get(riga.idEsterno);
    if (correzioni) {
      overrideUsati.add(riga.idEsterno);
      applicaOverride(voce, correzioni);
    }

    giocatori.push(voce);
    riferimentiGiocatori.push({
      giocatoreId: id,
      idEsterno: riga.idEsterno,
      nomeFonte: riga.nome,
      squadraFonte: riga.squadra,
      ruoloFonte: riga.ruoloClassico,
      ruoliMantraFonte: riga.ruoliMantra.join(';'),
      quotazioneAsta: riga.quotazioneAsta,
      quotazioneIniziale: riga.quotazioneIniziale,
      quotazioneAstaMantra: riga.quotazioneAstaMantra,
      quotazioneInizialeMantra: riga.quotazioneInizialeMantra,
      valoreMercato: riga.valoreMercato,
      valoreMercatoMantra: riga.valoreMercatoMantra,
    });
  }

  for (const id of override.keys()) {
    if (!overrideUsati.has(id)) {
      avvisi.push({
        tipo: 'override',
        messaggio: `L’override per l’id ${id} non corrisponde a nessun giocatore del listone.`,
      });
    }
  }

  avvisi.push(...assegnaCoppe(club, giocatori, configurazione));
  avvisi.push(...controllaRose(club, giocatori));

  /* --- risultato --------------------------------------------------- */

  const mondo: Mondo = {
    versione: VERSIONE_SEED,
    stagione: opzioni.stagione,
    sorgente: { impronta: opzioni.improntaListone, anonimizzato: opzioni.anonimizza === true },
    club,
    giocatori,
  };

  const riferimenti: RiferimentiEsterni = {
    versione: VERSIONE_SEED,
    fonte: 'fantacalcio.it',
    stagione: opzioni.stagione,
    club: nomiNelListone.map((nome) => ({
      clubId: clubPerNomeSorgente.get(nome)!.id,
      sigla: perNomeSorgente.get(nome)!.sigla,
      nomeFonte: nome,
    })),
    giocatori: riferimentiGiocatori,
    ceduti: listone.ceduti.map((c) => c.idEsterno).sort((a, b) => a - b),
  };

  return { mondo, riferimenti, avvisi };
}

function applicaOverride(voce: GiocatoreSeed, correzioni: Record<string, number | undefined>): void {
  if (correzioni.eta != null) voce.eta = correzioni.eta;
  if (correzioni.etaPicco != null) voce.etaPicco = correzioni.etaPicco;
  if (correzioni.overall != null) voce.overall = correzioni.overall;
  if (correzioni.potenziale != null) voce.potenziale = correzioni.potenziale;
  for (const area of ['attacco', 'difesa', 'tecnica', 'fisico'] as const) {
    if (correzioni[area] != null) voce.rating[area] = correzioni[area]!;
  }
  // Un potenziale piu' basso dell'overall non ha significato: si allinea.
  voce.potenziale = Math.max(voce.potenziale, voce.overall);
}

/**
 * Controlli di buon senso sulle rose: un club senza portieri, o con undici
 * giocatori in croce, manderebbe in crisi l'allenatore automatico.
 */
function controllaRose(club: ClubSeed[], giocatori: GiocatoreSeed[]): Avviso[] {
  const avvisi: Avviso[] = [];
  for (const c of club) {
    const rosa = giocatori.filter((g) => g.clubId === c.id);
    const portieri = rosa.filter((g) => g.ruoloClassico === 'P').length;
    if (rosa.length < 18) {
      avvisi.push({ tipo: 'rosa', messaggio: `${c.nome}: solo ${rosa.length} giocatori in rosa.` });
    }
    if (portieri < 2) {
      avvisi.push({ tipo: 'rosa', messaggio: `${c.nome}: solo ${portieri} portieri in rosa.` });
    }
  }
  return avvisi;
}

/** Impronta SHA-256 di un buffer, in esadecimale. */
export function impronta(contenuto: Buffer): string {
  return createHash('sha256').update(contenuto).digest('hex');
}

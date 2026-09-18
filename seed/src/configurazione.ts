/** Tipi e caricamento dei file di configurazione del seed. */

import { readFile } from 'node:fs/promises';
import { RUOLI_CLASSICI, RUOLI_MANTRA, type RuoloClassico, type RuoloMantra } from './ruoli.ts';

export type Aree = { attacco: number; difesa: number; tecnica: number; fisico: number };
export const NOMI_AREE = ['attacco', 'difesa', 'tecnica', 'fisico'] as const;

export type Propensioni = { gol: number; assist: number; cartellino: number; infortunio: number };
export const NOMI_PROPENSIONI = ['gol', 'assist', 'cartellino', 'infortunio'] as const;

export type ProfiloRuolo = { aree: Aree; propensioni: Propensioni };

export type Competizione = 'champions' | 'europa' | 'conference';
export const COMPETIZIONI = ['champions', 'europa', 'conference'] as const;

/** Da quale coppia di colonne del listone nasce il segnale di mercato. */
export const FONTI_SEGNALE = ['classic', 'mantra', 'media'] as const;
export type FonteSegnale = (typeof FONTI_SEGNALE)[number];

export type Parametri = {
  versione: number;
  semeGlobale: string;
  rating: {
    /** Quale delle due quotazioni del listone alimenta il segnale. */
    fonteSegnale: FonteSegnale;
    pesoValoreMercato: number;
    pesoQuotazioneAsta: number;
    mixRango: number;
    livelloNeutro: number;
    minimo: number;
    massimo: number;
    rumore: number;
    pesoRuoloPrincipale: number;
    pesoRuoliSecondari: number;
    fasciaPerRuoloClassico: Record<RuoloClassico, { base: number; ampiezza: number }>;
  };
  profiliRuolo: Record<RuoloMantra, ProfiloRuolo>;
  propensioni: {
    influenzaQualitaGol: number;
    influenzaQualitaAssist: number;
    influenzaQualitaCartellino: number;
    influenzaQualitaInfortunio: number;
    rumore: number;
  };
  anagrafica: {
    etaMinima: number;
    etaMassima: number;
    etaMedia: number;
    deviazioneEta: number;
    attrazioneVersoIlPicco: number;
    riduzioneDeviazionePerQualita: number;
    etaPiccoMedia: number;
    etaPiccoPortieri: number;
    deviazioneEtaPicco: number;
    crescitaMassima: number;
    curvaCrescita: number;
    quotaCrescitaCasuale: number;
  };
  coppe: {
    modalita: 'automatica' | 'elenco';
    giocatoriConsideratiPerForza: number;
    posti: Record<Competizione, number>;
  };
};

export type ClubConfigurato = {
  nome: string;
  sigla: string;
  colore: string;
  coppa: Competizione | null;
};

export type OverrideGiocatore = Partial<{
  eta: number;
  etaPicco: number;
  potenziale: number;
  overall: number;
  attacco: number;
  difesa: number;
  tecnica: number;
  fisico: number;
}>;

export type Configurazione = {
  parametri: Parametri;
  club: ClubConfigurato[];
  override: Map<number, OverrideGiocatore>;
};

/* ------------------------------------------------------------------ */

function esigi(condizione: boolean, messaggio: string): void {
  if (!condizione) throw new Error(`Configurazione non valida: ${messaggio}`);
}

/** Legge un JSON ignorando le chiavi di commento, quelle che cominciano con `_`. */
async function leggiJson(percorso: string): Promise<any> {
  try {
    return JSON.parse(await readFile(percorso, 'utf8'));
  } catch (errore) {
    throw new Error(`Impossibile leggere ${percorso}: ${(errore as Error).message}`);
  }
}

function validaParametri(p: Parametri): void {
  const { rating, profiliRuolo, anagrafica, coppe } = p;

  esigi(
    (FONTI_SEGNALE as readonly string[]).includes(rating.fonteSegnale),
    `rating.fonteSegnale sconosciuta: "${rating.fonteSegnale}" ` +
      `(ammesse: ${FONTI_SEGNALE.join(', ')})`,
  );
  esigi(
    Math.abs(rating.pesoValoreMercato + rating.pesoQuotazioneAsta - 1) < 1e-9,
    'i pesi del valore di mercato e della quotazione devono sommare a 1',
  );
  esigi(rating.mixRango >= 0 && rating.mixRango <= 1, 'rating.mixRango deve stare fra 0 e 1');
  esigi(rating.minimo < rating.massimo, 'rating.minimo deve essere minore di rating.massimo');
  esigi(rating.rumore >= 0, 'rating.rumore non puo’ essere negativo');
  esigi(
    anagrafica.riduzioneDeviazionePerQualita >= 0 && anagrafica.riduzioneDeviazionePerQualita < 1,
    'anagrafica.riduzioneDeviazionePerQualita deve stare fra 0 e 1 (escluso)',
  );

  for (const r of RUOLI_CLASSICI) {
    const fascia = rating.fasciaPerRuoloClassico[r];
    esigi(fascia != null, `manca la fascia di rating per il ruolo classico "${r}"`);
    esigi(fascia.ampiezza > 0, `fascia "${r}": ampiezza deve essere positiva`);
  }

  for (const r of RUOLI_MANTRA) {
    const profilo = profiliRuolo[r];
    esigi(profilo != null, `manca il profilo del ruolo Mantra "${r}"`);
    for (const a of NOMI_AREE) {
      esigi(
        Number.isFinite(profilo.aree[a]) && profilo.aree[a] >= 0,
        `profilo "${r}": area "${a}" assente o negativa`,
      );
    }
    for (const n of NOMI_PROPENSIONI) {
      const v = profilo.propensioni[n];
      esigi(Number.isFinite(v) && v >= 0 && v <= 1, `profilo "${r}": propensione "${n}" fuori da 0-1`);
    }
  }

  esigi(
    anagrafica.etaMinima < anagrafica.etaMassima,
    'anagrafica: etaMinima deve essere minore di etaMassima',
  );
  esigi(anagrafica.deviazioneEta > 0, 'anagrafica: deviazioneEta deve essere positiva');
  esigi(
    coppe.modalita === 'automatica' || coppe.modalita === 'elenco',
    `coppe.modalita sconosciuta: "${coppe.modalita}"`,
  );
  esigi(coppe.giocatoriConsideratiPerForza > 0, 'coppe: giocatoriConsideratiPerForza deve essere positivo');
}

function validaClub(club: ClubConfigurato[]): void {
  const perNome = new Set<string>();
  const perSigla = new Set<string>();
  for (const c of club) {
    esigi(typeof c.nome === 'string' && c.nome !== '', 'club senza nome');
    esigi(/^[A-Z]{3}$/.test(c.sigla), `club "${c.nome}": la sigla deve essere di tre lettere maiuscole`);
    esigi(!perNome.has(c.nome), `nome di club duplicato: "${c.nome}"`);
    esigi(!perSigla.has(c.sigla), `sigla di club duplicata: "${c.sigla}"`);
    esigi(
      c.coppa === null || (COMPETIZIONI as readonly string[]).includes(c.coppa),
      `club "${c.nome}": competizione "${c.coppa}" sconosciuta`,
    );
    perNome.add(c.nome);
    perSigla.add(c.sigla);
  }
}

export async function leggiConfigurazione(cartella: string): Promise<Configurazione> {
  const parametri = (await leggiJson(`${cartella}/parametri.json`)) as Parametri;
  const club = ((await leggiJson(`${cartella}/club.json`)).club ?? []) as ClubConfigurato[];
  const grezziOverride = (await leggiJson(`${cartella}/override-giocatori.json`)).override ?? {};

  validaParametri(parametri);
  validaClub(club);

  const override = new Map<number, OverrideGiocatore>();
  for (const [chiave, valore] of Object.entries(grezziOverride)) {
    const id = Number(chiave);
    esigi(Number.isInteger(id), `override: "${chiave}" non e' un identificativo valido`);
    override.set(id, valore as OverrideGiocatore);
  }

  return { parametri, club, override };
}

/**
 * Il ciclo di vita di uno scambio (SPEC 6.5): proposta, risposta, storico.
 *
 * Le regole di validita' (chi possiede cosa) sono uguali per tutti; la
 * decisione su una proposta invece no: se la controparte e' una persona resta
 * "proposto" finche' non risponde lei, se e' un bot si valuta e si risolve
 * nello stesso momento, perche' un bot non ha una sera in cui pensarci.
 */

import { randomUUID } from 'node:crypto';
import type { StagioneSimulata } from '../../engine/src/stagione.ts';
import type { Schierabile } from '../../fanta/src/tipi.ts';
import { trovaSquadra, type Archivio, type ScambioSalvato, type StatoLega } from './archivio.ts';
import { rosaDi, type ContestoMondo } from './lega.ts';
import { decisioneBot, type ConfigurazioneScambi } from './valutazione.ts';

export type PropostaScambio = {
  daSquadraId: string;
  aSquadraId: string;
  /** Giocatori che escono dalla rosa di `daSquadraId`. */
  offerti: string[];
  /** Giocatori che escono dalla rosa di `aSquadraId`. */
  richiesti: string[];
};

/**
 * Controlla che una proposta sia sensata: squadre diverse, rose vere, niente
 * doppioni, e che le due rose risultanti restino valide per la modalita'
 * della lega.
 *
 * **Non impone parita' di ruolo fra ceduti e ricevuti** (decisione del
 * proprietario, issue #14): il Mantra non lo richiede. L'unico vincolo e'
 * quello che il regolamento impone gia' a qualunque rosa — il minimo di
 * giocatori e di portieri (`RegoleSchieramento.validaRosa`, lo stesso
 * controllo dell'import) — cosi' non si duplica una seconda nozione di
 * "rosa valida" divergente da quella usata all'asta.
 */
export function validaProposta(stato: StatoLega, c: ContestoMondo, p: PropostaScambio): void {
  if (p.daSquadraId === p.aSquadraId) {
    throw new Error('Una squadra non puo’ scambiare con se stessa');
  }
  if (p.offerti.length === 0) throw new Error('Serve almeno un giocatore offerto');
  if (p.richiesti.length === 0) throw new Error('Serve almeno un giocatore richiesto');
  if (new Set(p.offerti).size !== p.offerti.length) {
    throw new Error('Lo stesso giocatore offerto due volte');
  }
  if (new Set(p.richiesti).size !== p.richiesti.length) {
    throw new Error('Lo stesso giocatore richiesto due volte');
  }

  const da = trovaSquadra(stato, p.daSquadraId);
  const a = trovaSquadra(stato, p.aSquadraId);
  const rosaDa = new Set(da.giocatori.map((g) => g.giocatoreId));
  const rosaA = new Set(a.giocatori.map((g) => g.giocatoreId));

  for (const id of p.offerti) {
    if (!rosaDa.has(id)) throw new Error(`Il giocatore ${id} non e’ nella rosa di ${da.nome}`);
  }
  for (const id of p.richiesti) {
    if (!rosaA.has(id)) throw new Error(`Il giocatore ${id} non e’ nella rosa di ${a.nome}`);
  }

  const offertiSet = new Set(p.offerti);
  const richiestiSet = new Set(p.richiesti);
  const daDopo = {
    ...da,
    giocatori: [...da.giocatori.filter((g) => !offertiSet.has(g.giocatoreId)), ...a.giocatori.filter((g) => richiestiSet.has(g.giocatoreId))],
  };
  const aDopo = {
    ...a,
    giocatori: [...a.giocatori.filter((g) => !richiestiSet.has(g.giocatoreId)), ...da.giocatori.filter((g) => offertiSet.has(g.giocatoreId))],
  };

  const regole = c.regole[stato.modalita];
  const segnala = (nome: string, rosa: readonly Schierabile[]): void => {
    const problemi = regole.validaRosa(rosa);
    if (problemi.length > 0) {
      throw new Error(`Dopo lo scambio, ${nome} non avrebbe piu’ una rosa valida: ${problemi.map((pr) => pr.messaggio).join(' ')}`);
    }
  };
  segnala(da.nome, rosaDi(daDopo, c));
  segnala(a.nome, rosaDi(aDopo, c));
}

/** Gli scambi che riguardano una squadra, i piu' recenti prima. */
export function scambiDiSquadra(stato: StatoLega, squadraId: string): ScambioSalvato[] {
  return stato.scambi
    .filter((s) => s.daSquadraId === squadraId || s.aSquadraId === squadraId)
    .sort((x, y) => y.creatoIl.localeCompare(x.creatoIl));
}

/** Quanti scambi una squadra ha gia' concluso questa stagione: la base del tetto stagionale. */
export function scambiAccettatiInStagione(stato: StatoLega, squadraId: string): number {
  return stato.scambi.filter(
    (s) => s.stato === 'accettato' && (s.daSquadraId === squadraId || s.aSquadraId === squadraId),
  ).length;
}

function nuovoScambio(p: PropostaScambio): ScambioSalvato {
  return {
    id: randomUUID(),
    daSquadraId: p.daSquadraId,
    aSquadraId: p.aSquadraId,
    offerti: [...p.offerti],
    richiesti: [...p.richiesti],
    stato: 'proposto',
    motivo: null,
    creatoIl: new Date().toISOString(),
    risoltoIl: null,
  };
}

export type EsitoProposta = { scambio: ScambioSalvato; messaggio: string };

/**
 * Propone uno scambio. Verso una persona resta in attesa; verso un bot viene
 * valutato e risolto subito, con l'esito gia' scritto in archivio.
 */
export async function proponiScambio(
  archivio: Archivio,
  stato: StatoLega,
  contesto: ContestoMondo,
  stagione: StagioneSimulata,
  config: ConfigurazioneScambi,
  proposta: PropostaScambio,
): Promise<EsitoProposta> {
  validaProposta(stato, contesto, proposta);
  const a = trovaSquadra(stato, proposta.aSquadraId);
  const base = nuovoScambio(proposta);

  if (a.proprietario !== null) {
    await archivio.proponiScambio(stato.id, base);
    return {
      scambio: base,
      messaggio: `Proposta inviata a ${a.nome}: resta in attesa della sua risposta.`,
    };
  }

  const decisione = decisioneBot(
    stato, contesto.mondo, stagione, config, base,
    scambiAccettatiInStagione(stato, a.id),
  );
  const risolto: ScambioSalvato = {
    ...base,
    stato: decisione.esito,
    motivo: decisione.motivo,
    risoltoIl: new Date().toISOString(),
  };
  await archivio.risolviScambio(stato.id, risolto);
  return {
    scambio: risolto,
    messaggio:
      decisione.esito === 'accettato'
        ? `${a.nome} (bot) ha accettato lo scambio.`
        : `${a.nome} (bot) ha rifiutato: ${decisione.motivo}`,
  };
}

function trovaScambioProposto(stato: StatoLega, scambioId: string): ScambioSalvato {
  const scambio = stato.scambi.find((s) => s.id === scambioId);
  if (!scambio) throw new Error(`Scambio sconosciuto: ${scambioId}`);
  if (scambio.stato !== 'proposto') {
    throw new Error('Questo scambio non e’ piu’ in attesa di risposta');
  }
  return scambio;
}

/** Risposta di una persona a uno scambio ricevuto: accetta o rifiuta. */
export async function rispondiScambio(
  archivio: Archivio,
  stato: StatoLega,
  scambioId: string,
  accetta: boolean,
): Promise<ScambioSalvato> {
  const scambio = trovaScambioProposto(stato, scambioId);
  const risolto: ScambioSalvato = {
    ...scambio,
    stato: accetta ? 'accettato' : 'rifiutato',
    risoltoIl: new Date().toISOString(),
  };
  await archivio.risolviScambio(stato.id, risolto);
  return risolto;
}

/** Ritira una propria proposta ancora in attesa. */
export async function ritiraScambio(
  archivio: Archivio,
  stato: StatoLega,
  scambioId: string,
): Promise<ScambioSalvato> {
  const scambio = trovaScambioProposto(stato, scambioId);
  const ritirato: ScambioSalvato = { ...scambio, stato: 'ritirato', risoltoIl: new Date().toISOString() };
  await archivio.risolviScambio(stato.id, ritirato);
  return ritirato;
}

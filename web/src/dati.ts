/**
 * Lo strato dati del sito.
 *
 * Tutto quello che sta qui gira **sul server**: legge l'archivio, ricostruisce
 * la lega e rigioca le giornate. Le pagine ricevono strutture gia' pronte da
 * disegnare, e non conoscono ne' il motore ne' le regole di lega.
 *
 * La ricostruzione costa qualche decimo di secondo per una stagione intera, che
 * per una richiesta HTTP e' troppo se si ripete a ogni click. Si tiene quindi in
 * memoria l'ultimo esito, con chiave lo stato salvato: finche' nessuno schiera
 * e nessuno gioca una giornata, la risposta e' gia' pronta; appena qualcosa
 * cambia, la chiave cambia e si ricalcola. Nessuna invalidazione da scrivere a
 * mano, che e' sempre il punto in cui una cache sbaglia.
 */

import { join } from 'node:path';
import { archivioSuFile, type Archivio, type StatoLega } from '../../jobs/src/archivio.ts';
import { archivioDallAmbiente, archivioSupabase } from '../../jobs/src/archivioSupabase.ts';
import {
  caricaContesto, formazionePerGiornata, legaDaStato, rosaDi, vistaStagione,
  type ContestoMondo,
} from '../../jobs/src/lega.ts';
import type { EsitoCiclo } from '../../jobs/src/ciclo.ts';
import type { Formazione, Schierabile } from '../../fanta/src/tipi.ts';
import { configurato, creaClientServer } from './supabase/server.ts';

export const RADICE = join(process.cwd(), '..');
const CARTELLA_LEGHE = process.env['FANTABLITZ_ARCHIVIO'] ?? join(RADICE, 'dati', 'leghe');

/**
 * L'archivio di servizio: usa la chiave che scavalca la RLS.
 *
 * Lo usa solo il job serale (`/api/gioca`), che lavora per conto della lega e
 * non di una persona: non c'e' nessuna sessione da cui prendere i cookie.
 * Le pagine e le azioni del sito devono usare `archivioPerRichiesta` qui
 * sotto, non questo: altrimenti l'accesso su invito (regola 8) varrebbe solo
 * sulla carta.
 */
export const archivioServizio: Archivio = archivioDallAmbiente(
  process.env,
  archivioSuFile(CARTELLA_LEGHE),
);

/**
 * L'archivio della richiesta corrente: porta i cookie di sessione, quindi le
 * policy RLS vedono la mail di chi sta chiedendo invece di essere scavalcate.
 *
 * Senza Supabase configurato si torna al file, com'era prima
 * dell'autenticazione: e' il modo di far girare il sito in locale senza un
 * database.
 */
export async function archivioPerRichiesta(): Promise<Archivio> {
  if (!configurato()) return archivioSuFile(CARTELLA_LEGHE);
  return archivioSupabase(await creaClientServer());
}

/* ------------------------------------------------------------------ */
/* Contesto, caricato una volta sola                                   */
/* ------------------------------------------------------------------ */

let contestoInCorso: Promise<ContestoMondo> | null = null;

export function contesto(): Promise<ContestoMondo> {
  // Il seed e le configurazioni non cambiano mentre il sito gira: si leggono
  // una volta. Si tiene la promessa, non il valore, cosi' due richieste
  // simultanee al primo avvio non leggono i file due volte.
  contestoInCorso ??= caricaContesto(RADICE);
  return contestoInCorso;
}

/* ------------------------------------------------------------------ */
/* La stagione, memorizzata sullo stato che l'ha prodotta              */
/* ------------------------------------------------------------------ */

let ultima: { chiave: string; esito: EsitoCiclo } | null = null;

export async function stagioneDi(stato: StatoLega): Promise<EsitoCiclo> {
  const chiave = JSON.stringify(stato);
  if (ultima?.chiave === chiave) return ultima.esito;
  const esito = vistaStagione(stato, await contesto());
  ultima = { chiave, esito };
  return esito;
}

/* ------------------------------------------------------------------ */
/* Lettura                                                             */
/* ------------------------------------------------------------------ */

export async function legaPredefinita(): Promise<StatoLega | null> {
  const archivio = await archivioPerRichiesta();
  const leghe = await archivio.elenca();
  const prima = leghe[0];
  return prima ? archivio.leggi(prima.id) : null;
}

export async function leggiLega(legaId: string): Promise<StatoLega | null> {
  return (await archivioPerRichiesta()).leggi(legaId);
}

/* ------------------------------------------------------------------ */
/* Viste per le pagine                                                 */
/* ------------------------------------------------------------------ */

export type GiocatoreInVista = {
  id: string;
  nome: string;
  club: string;
  clubBreve: string;
  colore: string;
  ruoloClassico: string;
  ruoliMantra: readonly string[];
  prezzo: number;
};

/** La rosa di una squadra, con i nomi: e' l'unico posto dove servono. */
export async function rosaInVista(
  stato: StatoLega,
  squadraId: string,
): Promise<GiocatoreInVista[]> {
  const c = await contesto();
  const squadra = stato.squadre.find((s) => s.id === squadraId);
  if (!squadra) return [];

  const prezzi = new Map(squadra.giocatori.map((g) => [g.giocatoreId, g.prezzo]));
  const rosa: GiocatoreInVista[] = [];

  for (const g of rosaDi(squadra, c)) {
    const nel = c.mondo.giocatorePerId.get(g.id);
    if (!nel) continue;
    const club = c.mondo.clubPerId.get(nel.clubId);
    rosa.push({
      id: g.id,
      nome: nel.nome,
      club: club?.nome ?? '',
      clubBreve: club?.abbreviazione ?? '',
      colore: club?.colore ?? '#888888',
      ruoloClassico: g.ruoloClassico,
      ruoliMantra: g.ruoliMantra,
      prezzo: prezzi.get(g.id) ?? 0,
    });
  }

  return rosa.sort(
    (a, b) =>
      'PDCA'.indexOf(a.ruoloClassico) - 'PDCA'.indexOf(b.ruoloClassico) ||
      b.prezzo - a.prezzo ||
      a.nome.localeCompare(b.nome),
  );
}

/** I nomi dei giocatori, per i tabellini. */
export async function nomiGiocatori(): Promise<Map<string, string>> {
  const c = await contesto();
  return new Map(c.mondo.giocatori.map((g) => [g.id, g.nome]));
}

/**
 * La formazione da mostrare nella schermata di schieramento.
 *
 * E' quella salvata per la prossima giornata; se non c'e', l'ultima salvata
 * prima; se non c'e' nemmeno quella, la migliore che la rosa esprime. Chi non
 * ha mai toccato niente non deve trovare una schermata vuota.
 */
export async function formazioneDaSchierare(
  stato: StatoLega,
  squadraId: string,
): Promise<{ formazione: Formazione; rosa: Schierabile[]; giornata: number }> {
  const c = await contesto();
  const giornata = stato.giornateGiocate + 1;
  const squadra = stato.squadre.find((s) => s.id === squadraId);
  if (!squadra) throw new Error(`Squadra sconosciuta: ${squadraId}`);

  const rosa = rosaDi(squadra, c);
  const salvata = formazionePerGiornata(stato, squadraId, giornata);
  if (salvata) return { formazione: salvata, rosa, giornata };

  const lega = legaDaStato(stato, c);
  const nella = lega.squadre.find((s) => s.id === squadraId);
  return { formazione: nella!.formazione, rosa, giornata };
}

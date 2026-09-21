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
import { cache } from 'react';
import { archivioSuFile, type Archivio, type StatoLega } from '../../jobs/src/archivio.ts';
import { archivioDallAmbiente, archivioSupabase, clientSupabase } from '../../jobs/src/archivioSupabase.ts';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  caricaContesto, formazionePerGiornata, legaDaStato, rosaDi, vistaStagione,
  type ContestoMondo,
} from '../../jobs/src/lega.ts';
import type { EsitoCiclo } from '../../jobs/src/ciclo.ts';
import { giornatePerStagione, posizioneStagione, type PosizioneStagione } from '../../jobs/src/stagioni.ts';
import { mediaVoto } from '../../jobs/src/valutazione.ts';
import type { Formazione, Schierabile } from '../../fanta/src/tipi.ts';
import { configurato, creaClientServer, emailUtente } from './supabase/server.ts';
import { amministraLega } from './admin.ts';

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

/**
 * Il client Supabase con la chiave di servizio, per le funzioni RPC che
 * neanche l'amministrazione puo' chiamare con l'archivio della richiesta
 * (es. `imposta_parola_lega`, concessa solo a `service_role`). `null` senza
 * Supabase configurato: quella funzionalita' resta assente in locale.
 */
export function clientServizio(): SupabaseClient | null {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const chiave = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !chiave) return null;
  return clientSupabase({ url, chiave });
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

export type PosizioneAttuale = PosizioneStagione & { giornatePerStagione: number };

/** A che punto della stagione e' una lega, per mostrarlo (SPEC 5.8): la lega non si ferma mai a una sola. */
export async function posizioneAttuale(stato: StatoLega): Promise<PosizioneAttuale> {
  const c = await contesto();
  const gps = giornatePerStagione(c.mondo);
  return { ...posizioneStagione(Math.max(1, stato.giornateGiocate), gps), giornatePerStagione: gps };
}

/* ------------------------------------------------------------------ */
/* Lettura                                                             */
/* ------------------------------------------------------------------ */

export async function leggiLega(legaId: string): Promise<StatoLega | null> {
  return (await archivioPerRichiesta()).leggi(legaId);
}

/**
 * Le leghe di chi ha fatto login (issue #16): quelle dove possiede una
 * squadra, piu' quelle che amministra pur non giocando lui stesso.
 *
 * La policy RLS "leghe: le proprie" (schema_lega.sql) filtra gia'
 * `archivioPerRichiesta().elenca()` per proprieta' di una squadra — non
 * serve una tabella di appartenenza dedicata. Il caso che la RLS non copre
 * e' l'amministratore che non gioca: per quello si scavalca la RLS con
 * `archivioServizio`, esattamente come gia' fa
 * `leghe/[legaId]/admin/page.tsx`, filtrando pero' esplicitamente per la
 * sua mail invece di mostrare tutto.
 */
export async function legheDiUtente(): Promise<StatoLega[]> {
  if (!configurato()) {
    const elenco = await archivioServizio.elenca();
    const lette = await Promise.all(elenco.map((l) => archivioServizio.leggi(l.id)));
    return lette.filter((s): s is StatoLega => s !== null);
  }

  const archivio = await archivioPerRichiesta();
  const proprie = await archivio.elenca();
  const possedute = (await Promise.all(proprie.map((l) => archivio.leggi(l.id)))).filter(
    (s): s is StatoLega => s !== null,
  );

  const email = await emailUtente();
  const gia = new Set(possedute.map((s) => s.id));
  const amministrate: StatoLega[] = [];
  if (email) {
    for (const { id } of await archivioServizio.elenca()) {
      if (gia.has(id)) continue;
      const stato = await archivioServizio.leggi(id);
      if (stato?.amministratore === email) amministrate.push(stato);
    }
  }

  return [...possedute, ...amministrate];
}

/**
 * Una lega, ma solo se chi la chiede ha il diritto di vederla: ci gioca (ha
 * una squadra) o la amministra. Sostituisce `legaPredefinita()` in ogni
 * pagina sotto `/leghe/[legaId]`, dove la lega non e' piu' "la prima
 * trovata" ma quella nell'URL — e va verificato che sia davvero la sua.
 *
 * Legge con `archivioServizio` (scavalca la RLS) perche' un amministratore
 * senza squadra propria altrimenti non passerebbe la RLS: il controllo di
 * autorizzazione si fa qui esplicitamente, non implicitamente via RLS.
 *
 * `cache()` di React: il layout di `/leghe/[legaId]` la chiama per disegnare
 * il menu, e la pagina sotto la richiama di nuovo per il proprio contenuto —
 * senza deduplicarla e' una lettura doppia (nove query a Supabase ciascuna,
 * `archivioServizio.leggi`) per ogni click. `cache()` la rende una sola
 * lettura per richiesta, non fra richieste diverse: resta corretta anche
 * se una simulazione cambia lo stato subito dopo.
 */
export const legaAutorizzata = cache(async (legaId: string): Promise<StatoLega | null> => {
  const stato = await archivioServizio.leggi(legaId);
  if (!stato) return null;
  if (!configurato()) return stato;

  const email = await emailUtente();
  const propria = email !== null && stato.squadre.some((s) => s.proprietario === email);
  if (propria || (await amministraLega(stato))) return stato;
  return null;
});

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

export type MvFm = { mv: number | null; fm: number | null };

/**
 * Media voto (del mondo) e fantamedia (di lega) per ogni giocatore di una
 * rosa, fino all'ultima giornata giocata. La fantamedia non ha una funzione
 * pronta come `mediaVoto` (`jobs/src/valutazione.ts`): si aggrega qui dalle
 * prestazioni gia' salvate in `stagioneDi`, senza toccare `/fanta` o
 * `/engine` per una vista di sola lettura.
 */
export async function mvFmDiRosa(
  stato: StatoLega,
  squadraId: string,
): Promise<Map<string, MvFm>> {
  const squadra = stato.squadre.find((s) => s.id === squadraId);
  const risultato = new Map<string, MvFm>();
  if (!squadra) return risultato;

  const stagione = await stagioneDi(stato);
  for (const g of squadra.giocatori) {
    const mv = mediaVoto(g.giocatoreId, stagione.mondo, stato.giornateGiocate);

    let somma = 0;
    let conteggio = 0;
    for (const giornata of stagione.giornate) {
      const prestazione = giornata.squadre
        .find((s) => s.squadraId === squadraId)
        ?.punteggio.prestazioni.find((p) => p.giocatoreId === g.giocatoreId);
      if (prestazione && prestazione.fantavoto !== null) {
        somma += prestazione.fantavoto;
        conteggio++;
      }
    }

    risultato.set(g.giocatoreId, { mv, fm: conteggio > 0 ? somma / conteggio : null });
  }
  return risultato;
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

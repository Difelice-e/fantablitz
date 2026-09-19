'use server';

/**
 * Le azioni della schermata scambi.
 *
 * Passano dalla chiave di servizio (`archivioServizio`), non dall'archivio
 * della richiesta: uno scambio accettato tocca le rose di *due* squadre, e la
 * RLS su `rose` non lascia scrivere niente dal sito (solo il job e
 * l'amministrazione, che usano la stessa chiave). L'autorizzazione — "questa è
 * davvero la tua squadra?" — si controlla qui in TypeScript, come per
 * l'amministrazione di lega.
 */

import { revalidatePath } from 'next/cache';
import { archivioServizio, contesto, stagioneDi } from '../../../../src/dati.ts';
import { configurato, emailUtente } from '../../../../src/supabase/server.ts';
import {
  proponiScambio, ritiraScambio, rispondiScambio, type PropostaScambio,
} from '../../../../../jobs/src/scambi.ts';
import type { StatoLega } from '../../../../../jobs/src/archivio.ts';

export type EsitoAzioneScambio = { riuscito: boolean; messaggio: string };

async function possiedeSquadra(stato: StatoLega, squadraId: string): Promise<boolean> {
  const squadra = stato.squadre.find((s) => s.id === squadraId);
  if (!squadra) return false;
  if (!configurato()) return true;
  return (await emailUtente()) === squadra.proprietario;
}

function messaggioErrore(errore: unknown): string {
  return errore instanceof Error ? errore.message : 'Errore sconosciuto.';
}

export async function proponiScambioAzione(
  legaId: string,
  daSquadraId: string,
  aSquadraId: string,
  offerti: string[],
  richiesti: string[],
): Promise<EsitoAzioneScambio> {
  const stato = await archivioServizio.leggi(legaId);
  if (!stato) return { riuscito: false, messaggio: 'Lega non trovata.' };
  if (!(await possiedeSquadra(stato, daSquadraId))) {
    return { riuscito: false, messaggio: 'Questa non è la tua squadra.' };
  }

  try {
    const c = await contesto();
    const stagione = (await stagioneDi(stato)).mondo;
    const proposta: PropostaScambio = { daSquadraId, aSquadraId, offerti, richiesti };
    const esito = await proponiScambio(archivioServizio, stato, c, stagione, c.scambi, proposta);
    revalidatePath('/', 'layout');
    return { riuscito: true, messaggio: esito.messaggio };
  } catch (errore) {
    return { riuscito: false, messaggio: messaggioErrore(errore) };
  }
}

export async function rispondiScambioAzione(
  legaId: string,
  scambioId: string,
  accetta: boolean,
): Promise<EsitoAzioneScambio> {
  const stato = await archivioServizio.leggi(legaId);
  if (!stato) return { riuscito: false, messaggio: 'Lega non trovata.' };
  const scambio = stato.scambi.find((s) => s.id === scambioId);
  if (!scambio) return { riuscito: false, messaggio: 'Scambio non trovato.' };
  if (!(await possiedeSquadra(stato, scambio.aSquadraId))) {
    return { riuscito: false, messaggio: 'Solo chi ha ricevuto la proposta può risponderle.' };
  }

  try {
    await rispondiScambio(archivioServizio, stato, scambioId, accetta);
    revalidatePath('/', 'layout');
    return { riuscito: true, messaggio: accetta ? 'Scambio accettato.' : 'Scambio rifiutato.' };
  } catch (errore) {
    return { riuscito: false, messaggio: messaggioErrore(errore) };
  }
}

export async function ritiraScambioAzione(legaId: string, scambioId: string): Promise<EsitoAzioneScambio> {
  const stato = await archivioServizio.leggi(legaId);
  if (!stato) return { riuscito: false, messaggio: 'Lega non trovata.' };
  const scambio = stato.scambi.find((s) => s.id === scambioId);
  if (!scambio) return { riuscito: false, messaggio: 'Scambio non trovato.' };
  if (!(await possiedeSquadra(stato, scambio.daSquadraId))) {
    return { riuscito: false, messaggio: 'Solo chi ha proposto lo scambio può ritirarlo.' };
  }

  try {
    await ritiraScambio(archivioServizio, stato, scambioId);
    revalidatePath('/', 'layout');
    return { riuscito: true, messaggio: 'Proposta ritirata.' };
  } catch (errore) {
    return { riuscito: false, messaggio: messaggioErrore(errore) };
  }
}

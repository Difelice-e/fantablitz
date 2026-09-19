'use server';

/**
 * Le azioni dell'amministrazione: creare una lega da un export di Fantalab,
 * e assegnare le squadre alle mail (l'invito, regola 8).
 *
 * Girano con la chiave di servizio (`archivioServizio`), non con l'archivio
 * della richiesta: sono operazioni di chi gestisce il sito, non di un
 * giocatore, e le policy RLS non concedono comunque scritture su
 * `leghe`/`squadre`/`rose` a un utente autenticato — le fa solo l'import.
 * `sonoAmministratore()` e' il controllo che sostituisce la RLS qui.
 */

import { revalidatePath } from 'next/cache';
import { archivioServizio, contesto } from '../../src/dati.ts';
import { sonoAmministratore } from '../../src/admin.ts';
import { contestoDaSeed, importaRose } from '../../../jobs/src/importa.ts';
import { statoDaImport } from '../../../jobs/src/lega.ts';
import type { Modalita } from '../../../fanta/src/tipi.ts';

/** Lo stesso slug di `jobs/src/cliCreaLega.ts`: un id stabile e leggibile dal nome. */
function identificativo(nome: string): string {
  const pulito = nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return pulito.length > 0 ? pulito : 'lega';
}

export type EsitoCreazione = { riuscito: boolean; messaggio: string; avvisi: string[] };

export async function creaLega(dati: FormData): Promise<EsitoCreazione> {
  if (!(await sonoAmministratore())) {
    return { riuscito: false, messaggio: 'Riservato all’amministratore.', avvisi: [] };
  }

  const nome = String(dati.get('nome') ?? '').trim();
  const modalitaGrezza = String(dati.get('modalita') ?? '');
  const budget = Number(dati.get('budget'));
  const file = dati.get('file');

  if (!nome) return { riuscito: false, messaggio: 'Manca il nome della lega.', avvisi: [] };
  if (modalitaGrezza !== 'classic' && modalitaGrezza !== 'mantra') {
    return { riuscito: false, messaggio: 'Modalità sconosciuta.', avvisi: [] };
  }
  if (!Number.isFinite(budget) || budget <= 0) {
    return { riuscito: false, messaggio: 'Budget non valido.', avvisi: [] };
  }
  if (!(file instanceof File) || file.size === 0) {
    return {
      riuscito: false,
      messaggio: 'Manca il file delle rose (export Fantalab, CSV).',
      avvisi: [],
    };
  }

  const modalita: Modalita = modalitaGrezza;
  const id = identificativo(nome);

  if (await archivioServizio.leggi(id)) {
    return { riuscito: false, messaggio: `Esiste già una lega con id "${id}".`, avvisi: [] };
  }

  const c = await contesto();
  const regole = c.regole[modalita];
  const contenuto = await file.text();
  const importato = importaRose(
    contenuto,
    contestoDaSeed(c.mondo, c.riferimenti, regole, { budget }),
  );

  if (!importato.riuscito) {
    return {
      riuscito: false,
      messaggio: 'Le rose non si importano, la lega non si crea.',
      avvisi: importato.errori.map((e) => `[${e.tipo}] ${e.messaggio}`),
    };
  }

  const stato = statoDaImport({ id, nome, seme: id, modalita, budget }, importato.squadre);
  await archivioServizio.scrivi(stato);

  revalidatePath('/', 'layout');
  return {
    riuscito: true,
    messaggio: `Lega "${nome}" creata con ${stato.squadre.length} squadre. Ora assegna le squadre alle mail qui sotto.`,
    avvisi: importato.avvisi.map((a) => a.messaggio),
  };
}

export type EsitoAssegnazione = { riuscito: boolean; messaggio: string };

export async function assegnaSquadra(
  legaId: string,
  squadraId: string,
  mailGrezza: string,
): Promise<EsitoAssegnazione> {
  if (!(await sonoAmministratore())) {
    return { riuscito: false, messaggio: 'Riservato all’amministratore.' };
  }

  const stato = await archivioServizio.leggi(legaId);
  if (!stato) return { riuscito: false, messaggio: 'Lega non trovata.' };

  const squadra = stato.squadre.find((s) => s.id === squadraId);
  if (!squadra) return { riuscito: false, messaggio: 'Squadra non trovata.' };

  const mail = mailGrezza.trim() === '' ? null : mailGrezza.trim();
  await archivioServizio.scrivi({
    ...stato,
    squadre: stato.squadre.map((s) => (s.id === squadraId ? { ...s, proprietario: mail } : s)),
  });

  revalidatePath('/', 'layout');
  return {
    riuscito: true,
    messaggio: mail ? `Assegnata a ${mail}.` : 'Torna un bot: nessun proprietario.',
  };
}

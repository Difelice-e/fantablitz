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
import { archivioServizio, clientServizio, contesto } from '../../src/dati.ts';
import { amministraLega, sonoAmministratore } from '../../src/admin.ts';
import { configurato, emailUtente } from '../../src/supabase/server.ts';
import { contestoDaSeed, importaRose } from '../../../jobs/src/importa.ts';
import { statoDaImport } from '../../../jobs/src/lega.ts';
import { giocaGiornate } from '../../../jobs/src/cicloGiornaliero.ts';
import { providerDallAmbiente } from '../../../jobs/src/ai/provider.ts';
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
  const squadreAttesaGrezza = String(dati.get('squadreAttese') ?? '').trim();
  const giornateAlGiornoGrezzo = Number(dati.get('giornateAlGiorno') ?? '1');

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
  let squadreAttese: number | undefined;
  if (squadreAttesaGrezza !== '') {
    squadreAttese = Number(squadreAttesaGrezza);
    if (!Number.isInteger(squadreAttese) || squadreAttese < 2) {
      return { riuscito: false, messaggio: 'Numero di partecipanti non valido.', avvisi: [] };
    }
  }
  if (!Number.isInteger(giornateAlGiornoGrezzo) || giornateAlGiornoGrezzo < 1) {
    return { riuscito: false, messaggio: 'Giornate al giorno non valido.', avvisi: [] };
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
    contestoDaSeed(c.mondo, c.riferimenti, regole, { budget, squadreAttese }),
  );

  if (!importato.riuscito) {
    return {
      riuscito: false,
      messaggio: 'Le rose non si importano, la lega non si crea.',
      avvisi: importato.errori.map((e) => `[${e.tipo}] ${e.messaggio}`),
    };
  }

  // Chi crea la lega ne e' l'amministratore. In locale senza Supabase non
  // c'e' nessuno autenticato: resta null, come oggi.
  const amministratore = configurato() ? await emailUtente() : null;

  const stato = statoDaImport(
    { id, nome, seme: id, modalita, budget, amministratore, giornateAlGiorno: giornateAlGiornoGrezzo },
    importato.squadre,
  );
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
  const stato = await archivioServizio.leggi(legaId);
  if (!stato) return { riuscito: false, messaggio: 'Lega non trovata.' };
  if (!(await amministraLega(stato))) {
    return { riuscito: false, messaggio: 'Riservato all’amministratore della lega.' };
  }

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

export type EsitoSimulazione = { riuscito: boolean; messaggio: string };

/**
 * Simula subito il ciclo di una lega, senza aspettare l'orario fisso del
 * cron (issue #12): utile per testare senza aspettare la sera. Passa dalla
 * stessa `giocaGiornate` che chiama `/api/gioca` — un solo percorso, cosi'
 * il pulsante non puo' divergere dal job automatico ne' romperne
 * l'idempotenza.
 *
 * Riservata al superadmin globale (`sonoAmministratore()`, `ADMIN_EMAIL`),
 * anche online: deliberatamente piu' stretta di `amministraLega`, che
 * lascerebbe passare anche chi amministra una singola lega. Chi puo' far
 * avanzare una lega a piacimento dev'essere un solo account, non uno per
 * lega.
 */
export async function simulaOraAzione(legaId: string): Promise<EsitoSimulazione> {
  if (!(await sonoAmministratore())) {
    return { riuscito: false, messaggio: 'Riservato all’amministratore.' };
  }

  const stato = await archivioServizio.leggi(legaId);
  if (!stato) return { riuscito: false, messaggio: 'Lega non trovata.' };

  const c = await contesto();
  const provider = providerDallAmbiente(process.env);
  const { da, fino } = await giocaGiornate(archivioServizio, c, provider, stato, stato.giornateAlGiorno);

  revalidatePath('/', 'layout');
  return {
    riuscito: true,
    messaggio:
      fino > da
        ? `Giocate le giornate da ${da} a ${fino}.`
        : `Giocata la giornata ${fino}.`,
  };
}

export type EsitoParola = { riuscito: boolean; messaggio: string };

/**
 * Imposta o cambia la parola d'ordine della lega, per l'ingresso autonomo
 * (nome lega + parola). L'hash e il confronto restano in Postgres
 * (`imposta_parola_lega`, pgcrypto): qui non passa mai in chiaro se non
 * verso quella funzione, e non si salva mai.
 */
export async function impostaParolaLega(legaId: string, parola: string): Promise<EsitoParola> {
  const stato = await archivioServizio.leggi(legaId);
  if (!stato) return { riuscito: false, messaggio: 'Lega non trovata.' };
  if (!(await amministraLega(stato))) {
    return { riuscito: false, messaggio: 'Riservato all’amministratore della lega.' };
  }
  if (parola.trim().length < 6) {
    return { riuscito: false, messaggio: 'La parola d’ordine deve avere almeno 6 caratteri.' };
  }

  const client = clientServizio();
  if (!client) {
    return { riuscito: false, messaggio: 'Supabase non è configurato: la parola d’ordine vive solo lì.' };
  }

  const { error } = await client.rpc('imposta_parola_lega', { lega_id: legaId, parola: parola.trim() });
  if (error) return { riuscito: false, messaggio: `Errore: ${error.message}` };

  return { riuscito: true, messaggio: 'Parola d’ordine impostata.' };
}

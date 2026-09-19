'use server';

/**
 * L'ingresso per nome lega + parola d'ordine (SPEC.md §9).
 *
 * Girano con l'archivio della richiesta (cookie di sessione): chi chiama
 * queste funzioni ha gia' un account ma non e' ancora entrato in nessuna
 * lega, e le due funzioni RPC (`squadre_libere`, `rivendica_squadra`) sono
 * fatte apposta per essere chiamabili da un `authenticated` cosi' — vedi la
 * migrazione `parola_lega_e_ingresso`.
 */

import { revalidatePath } from 'next/cache';
import { creaClientServer } from '../../src/supabase/server.ts';

export type SquadraLibera = {
  legaId: string;
  legaNome: string;
  squadraId: string;
  squadraNome: string;
};

export type EsitoRicerca =
  | { trovate: true; squadre: SquadraLibera[] }
  | { trovate: false; messaggio: string };

export async function cercaSquadreLibere(nomeLega: string, parola: string): Promise<EsitoRicerca> {
  if (!nomeLega.trim() || !parola) {
    return { trovate: false, messaggio: 'Nome della lega e parola d’ordine sono obbligatori.' };
  }

  const supabase = await creaClientServer();
  const { data, error } = await supabase.rpc('squadre_libere', {
    nome_lega: nomeLega.trim(),
    parola,
  });
  if (error) return { trovate: false, messaggio: `Errore: ${error.message}` };

  const righe = (data ?? []) as {
    lega_id: string;
    lega_nome: string;
    squadra_id: string;
    squadra_nome: string;
  }[];

  if (righe.length === 0) {
    return {
      trovate: false,
      messaggio:
        'Nessuna squadra libera: nome o parola sbagliati, oppure sono già tutte assegnate.',
    };
  }

  return {
    trovate: true,
    squadre: righe.map((r) => ({
      legaId: r.lega_id,
      legaNome: r.lega_nome,
      squadraId: r.squadra_id,
      squadraNome: r.squadra_nome,
    })),
  };
}

export type EsitoScelta = { riuscito: boolean; messaggio: string };

export async function scegliSquadra(
  nomeLega: string,
  parola: string,
  squadraId: string,
): Promise<EsitoScelta> {
  const supabase = await creaClientServer();
  const { data, error } = await supabase.rpc('rivendica_squadra', {
    nome_lega: nomeLega.trim(),
    parola,
    squadra_scelta: squadraId,
  });
  if (error) return { riuscito: false, messaggio: error.message };

  revalidatePath('/', 'layout');
  const riga = (data as { squadra_nome: string }[] | null)?.[0];
  return { riuscito: true, messaggio: riga ? `Sei entrato in ${riga.squadra_nome}.` : 'Fatto.' };
}

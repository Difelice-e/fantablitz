/**
 * Il client Supabase della richiesta corrente.
 *
 * A differenza del client con la chiave di servizio (jobs/src/archivioSupabase.ts,
 * usato dal job serale), questo porta i cookie di sessione: le policy RLS
 * vedono la mail di chi sta chiedendo e non vengono scavalcate. E' quello che
 * rende vero anche lato sito, non solo lato database, che chi non e' invitato
 * non vede niente (regola 8).
 *
 * Senza le due variabili pubbliche di Supabase configurate si lavora in
 * locale senza autenticazione, com'era prima di questo file: `configurato()`
 * lo dice a chi deve decidere se saltare l'autenticazione o no.
 */

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { cache } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

export function configurato(): boolean {
  return Boolean(
    process.env['NEXT_PUBLIC_SUPABASE_URL'] && process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'],
  );
}

function richiedi(nome: string): string {
  const valore = process.env[nome];
  if (!valore) throw new Error(`Variabile d'ambiente mancante: ${nome}`);
  return valore;
}

export async function creaClientServer(): Promise<SupabaseClient> {
  const cookieStore = await cookies();

  return createServerClient(richiedi('NEXT_PUBLIC_SUPABASE_URL'), richiedi('NEXT_PUBLIC_SUPABASE_ANON_KEY'), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(daImpostare: { name: string; value: string; options: CookieOptions }[]) {
        try {
          for (const { name, value, options } of daImpostare) cookieStore.set(name, value, options);
        } catch {
          // Chiamato da un Server Component, dove i cookie sono in sola lettura:
          // il proxy rinfresca comunque la sessione a ogni richiesta, quindi qui
          // si puo' ignorare senza perdere niente.
        }
      },
    },
  });
}

/**
 * La mail di chi sta guardando, o `null` se non ha fatto login (o Supabase non e' configurato).
 *
 * Avvolta in `cache()`: `client.auth.getUser()` non legge un cookie, chiama
 * l'endpoint `/auth/v1/user` di Supabase per validare il token. Il layout di
 * lega, la pagina sotto, e ogni controllo di proprietario (`amministraLega`,
 * le azioni di scambio e formazione) la richiamano tutti nella stessa
 * richiesta: senza questa cache erano fino a 4-5 chiamate di rete alla stessa
 * domanda, ognuna pagata per intero (Supabase e' in un'altra regione).
 */
export const emailUtente = cache(async (): Promise<string | null> => {
  if (!configurato()) return null;
  const client = await creaClientServer();
  const {
    data: { user },
  } = await client.auth.getUser();
  return user?.email ?? null;
});

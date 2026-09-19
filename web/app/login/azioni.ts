'use server';

/**
 * Invia il link magico. Nessuna password: la mail e' insieme identita' e invito,
 * perche' e' quella confrontata da `squadre.proprietario` nelle policy RLS.
 */

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { creaClientServer } from '../../src/supabase/server.ts';

export async function inviaLinkMagico(dati: FormData): Promise<void> {
  const email = String(dati.get('email') ?? '').trim();
  if (!email) redirect('/login?errore=Manca%20la%20mail.');

  const intestazioni = await headers();
  const host = intestazioni.get('host') ?? 'localhost:3000';
  const proto = intestazioni.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');

  const supabase = await creaClientServer();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${proto}://${host}/auth/callback` },
  });

  if (error) redirect(`/login?errore=${encodeURIComponent(error.message)}`);
  redirect('/login?inviato=1');
}

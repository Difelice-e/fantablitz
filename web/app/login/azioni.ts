'use server';

/**
 * Accesso con mail e password. Niente link magico: la registrazione e'
 * aperta (chiunque puo' crearsi un account), ma da sola non basta a vedere
 * niente — serve un invito, per mail assegnata o per nome lega + parola
 * d'ordine (`/entra`). E' il modo in cui la regola 8 resta vera anche con
 * la registrazione aperta.
 */

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { creaClientServer } from '../../src/supabase/server.ts';

async function origine(): Promise<string> {
  const intestazioni = await headers();
  const host = intestazioni.get('host') ?? 'localhost:3000';
  const proto = intestazioni.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

function credenziali(dati: FormData): { email: string; password: string } {
  return {
    email: String(dati.get('email') ?? '').trim(),
    password: String(dati.get('password') ?? ''),
  };
}

export async function accedi(dati: FormData): Promise<void> {
  const { email, password } = credenziali(dati);
  if (!email || !password) redirect('/login?errore=Mail%20e%20password%20sono%20obbligatorie.');

  const supabase = await creaClientServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(`/login?errore=${encodeURIComponent(error.message)}`);
  redirect('/');
}

export async function registrati(dati: FormData): Promise<void> {
  const { email, password } = credenziali(dati);
  if (!email || !password) {
    redirect('/login?modo=registrati&errore=Mail%20e%20password%20sono%20obbligatorie.');
  }
  if (password.length < 6) {
    redirect('/login?modo=registrati&errore=La%20password%20deve%20avere%20almeno%206%20caratteri.');
  }

  const supabase = await creaClientServer();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${await origine()}/auth/callback` },
  });
  if (error) redirect(`/login?modo=registrati&errore=${encodeURIComponent(error.message)}`);

  // Se la conferma mail e' disattivata su Supabase, signUp restituisce gia'
  // una sessione attiva: si entra subito invece di aspettare una mail che
  // non parte.
  if (data.session) redirect('/');
  redirect('/login?registrato=1');
}

export async function richiediReset(dati: FormData): Promise<void> {
  const email = String(dati.get('email') ?? '').trim();
  if (!email) redirect('/login?modo=reset&errore=Manca%20la%20mail.');

  const supabase = await creaClientServer();
  const prossima = encodeURIComponent('/auth/nuova-password');
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await origine()}/auth/callback?next=${prossima}`,
  });
  if (error) redirect(`/login?modo=reset&errore=${encodeURIComponent(error.message)}`);
  redirect('/login?modo=reset&inviato=1');
}

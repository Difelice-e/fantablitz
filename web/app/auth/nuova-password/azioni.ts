'use server';

import { redirect } from 'next/navigation';
import { creaClientServer } from '../../../src/supabase/server.ts';

export async function impostaNuovaPassword(dati: FormData): Promise<void> {
  const password = String(dati.get('password') ?? '');
  if (password.length < 6) redirect('/auth/nuova-password?errore=Almeno%206%20caratteri.');

  const supabase = await creaClientServer();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect(`/auth/nuova-password?errore=${encodeURIComponent(error.message)}`);
  redirect('/');
}

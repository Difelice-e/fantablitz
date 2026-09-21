import { redirect } from 'next/navigation';
import { configurato, emailUtente } from '../src/supabase/server.ts';

export const dynamic = 'force-dynamic';

/** La home non mostra piu' niente da sola (issue #16): smista soltanto. */
export default async function Home() {
  if (configurato() && !(await emailUtente())) redirect('/login');
  redirect('/leghe');
}

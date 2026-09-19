/**
 * Dove torna chi clicca il link magico.
 *
 * Supabase manda qui con `?code=...` (flusso PKCE): si scambia il codice con
 * una sessione, che finisce nei cookie, e si torna alla pagina di partenza.
 */

import { NextResponse } from 'next/server';
import { creaClientServer } from '../../../src/supabase/server.ts';

export const dynamic = 'force-dynamic';

export async function GET(richiesta: Request): Promise<Response> {
  const url = new URL(richiesta.url);
  const code = url.searchParams.get('code');
  const prossima = url.searchParams.get('next') ?? '/';

  if (code) {
    const supabase = await creaClientServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(prossima, url.origin));
  }

  return NextResponse.redirect(new URL('/login?errore=Link%20non%20valido%20o%20scaduto.', url.origin));
}

/**
 * Rinfresca la sessione a ogni richiesta e blocca chi non ha fatto login.
 *
 * In Next.js 16 questo file si chiamava `middleware.ts`: e' lo stesso
 * meccanismo, rinominato (vedi node_modules/next/dist/docs/.../proxy.md).
 *
 * Le pagine sono su invito (regola 8): senza sessione non si vede niente, a
 * parte la pagina di login e il rientro del link magico. `/api/gioca` si
 * protegge da solo con CRON_SECRET e non ha un utente: e' escluso dal
 * matcher qui sotto, non da un controllo qui dentro, cosi' resta un solo
 * posto che decide cosa e' pubblico.
 *
 * Senza le due variabili pubbliche di Supabase configurate si lascia passare
 * tutto: e' il modo di far girare il sito in locale senza un database, come
 * prima che questo file esistesse.
 */

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBBLICHE = ['/login', '/auth/callback'];

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const chiave = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];
  if (!url || !chiave) return NextResponse.next();

  let risposta = NextResponse.next({ request });

  const supabase = createServerClient(url, chiave, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(daImpostare) {
        for (const { name, value } of daImpostare) request.cookies.set(name, value);
        risposta = NextResponse.next({ request });
        for (const { name, value, options } of daImpostare) risposta.cookies.set(name, value, options);
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pubblica = PUBBLICHE.includes(request.nextUrl.pathname);

  if (!user && !pubblica) {
    const destinazione = request.nextUrl.clone();
    destinazione.pathname = '/login';
    return NextResponse.redirect(destinazione);
  }

  if (user && request.nextUrl.pathname === '/login') {
    const destinazione = request.nextUrl.clone();
    destinazione.pathname = '/';
    return NextResponse.redirect(destinazione);
  }

  return risposta;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|api/gioca).*)'],
};

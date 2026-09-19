import { NextResponse } from 'next/server';
import { creaClientServer } from '../../../src/supabase/server.ts';

export async function POST(richiesta: Request): Promise<Response> {
  const supabase = await creaClientServer();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/login', richiesta.url));
}

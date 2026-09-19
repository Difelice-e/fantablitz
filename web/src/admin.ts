/**
 * L'amministratore e' una sola mail, in `ADMIN_EMAIL`.
 *
 * Crea leghe, importa rose e assegna squadre e' sempre lo stesso proprietario
 * del sito: con dieci amici e una lega per volta non serve un ruolo per
 * lega, e la colonna `leghe.amministratore` nello schema resta per quando
 * (e se) servira' davvero.
 *
 * Senza Supabase configurato si lavora in locale senza controlli, come per
 * l'autenticazione (`web/src/supabase/server.ts`): e' il modo di far girare
 * tutto senza database.
 */

import { configurato, emailUtente } from './supabase/server.ts';

export async function sonoAmministratore(): Promise<boolean> {
  if (!configurato()) return true;
  const atteso = process.env['ADMIN_EMAIL'];
  if (!atteso) return false;
  return (await emailUtente()) === atteso;
}

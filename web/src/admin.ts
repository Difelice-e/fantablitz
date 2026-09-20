/**
 * Due livelli di amministrazione.
 *
 * `sonoAmministratore()` e' globale, in `ADMIN_EMAIL`: oggi e' l'unica mail
 * che puo' creare una lega, perche' la fase attuale ha un solo creatore.
 *
 * `amministraLega(stato)` e' per lega: chi l'ha creata (`stato.amministratore`)
 * puo' assegnarne le squadre e impostarne la parola d'ordine. `ADMIN_EMAIL`
 * puo' farlo comunque, su qualunque lega — oggi coincidono sempre, visto che
 * solo lui puo' creare leghe, ma il controllo e' gia' pronto per il giorno in
 * cui altri creeranno le proprie.
 *
 * Senza Supabase configurato si lavora in locale senza controlli, come per
 * l'autenticazione (`web/src/supabase/server.ts`): e' il modo di far girare
 * tutto senza database.
 */

import { configurato, emailUtente } from './supabase/server.ts';
import type { StatoLega } from '../../jobs/src/archivio.ts';

export async function sonoAmministratore(): Promise<boolean> {
  if (!configurato()) return true;
  const atteso = process.env['ADMIN_EMAIL'];
  if (!atteso) return false;
  return (await emailUtente()) === atteso;
}

export async function amministraLega(stato: StatoLega): Promise<boolean> {
  if (!configurato()) return true;
  const email = await emailUtente();
  if (!email) return false;
  return email === stato.amministratore || email === process.env['ADMIN_EMAIL'];
}

/**
 * Siamo in un ambiente locale, non su Vercel?
 *
 * Vercel imposta `VERCEL` in ogni suo ambiente — produzione, preview e anche
 * `vercel dev` — quindi la sua assenza e' il segnale che serve al pulsante
 * admin "simula ora" (issue #12): deve restare invisibile appena il sito gira
 * davvero online, anche in preview, non solo in produzione.
 */
export function siamoInLocale(): boolean {
  return !process.env['VERCEL'];
}

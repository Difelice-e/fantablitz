/**
 * Due livelli di amministrazione.
 *
 * `sonoAmministratore()` e' globale, in `ADMIN_EMAIL`: oggi e' l'unica mail
 * che puo' creare una lega, perche' la fase attuale ha un solo creatore — ed
 * e' anche il superadmin che vede il pulsante "simula ora" (issue #12), in
 * produzione compresa: e' un'azione riservata a lui solo, non a chiunque
 * amministri una singola lega.
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

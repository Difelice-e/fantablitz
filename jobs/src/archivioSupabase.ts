/**
 * L'archivio su Supabase: la seconda implementazione del contratto.
 *
 * Il contratto e' in `archivio.ts` e non cambia. Chi legge e scrive non sa da
 * dove arrivano i dati, ed e' per questo che il sito e i job non sono cambiati
 * di una riga per passare dal file al database.
 *
 * ## Perche' quattro tabelle e non una colonna JSON
 *
 * La tentazione, visto che lo stato e' piccolo, e' una riga per lega con tutto
 * dentro un JSONB. Sarebbe piu' corto e sbagliato: la sera prima di una
 * giornata schierano tutti insieme, e due che salvano nello stesso momento si
 * sovrascriverebbero a vicenda. Con una riga per formazione toccano due righe
 * diverse e non si vedono nemmeno.
 *
 * La divisione paga anche altrove: la chiave primaria di `rose` e'
 * `(lega, giocatore)`, quindi e' Postgres a garantire che lo stesso giocatore
 * non stia in due rose. E' un'invariante che il codice controllava gia', ma un
 * controllo che sta nel database non si puo' dimenticare di chiamare.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  validaStatoLega, VERSIONE_STATO,
  type Archivio, type FormazioneSalvata, type StatoLega,
} from './archivio.ts';

/* ------------------------------------------------------------------ */

type RigaLega = {
  id: string;
  nome: string;
  seme: string;
  modalita: 'classic' | 'mantra';
  budget: number;
  giornate_giocate: number;
  amministratore: string | null;
};

type RigaSquadra = { lega_id: string; id: string; nome: string; proprietario: string | null };
type RigaRosa = { lega_id: string; squadra_id: string; giocatore_id: string; prezzo: number };
type RigaFormazione = {
  lega_id: string;
  squadra_id: string;
  giornata: number;
  modulo: string;
  titolari: [string, string][];
  panchina: string[];
};

/** Un errore di Supabase diventa un errore leggibile, col contesto di cosa si stava facendo. */
function esigiRiuscito(errore: { message: string } | null, cosa: string): void {
  if (errore) throw new Error(`${cosa}: ${errore.message}`);
}

/* ------------------------------------------------------------------ */

export type OpzioniSupabase = {
  url: string;
  chiave: string;
};

/**
 * Costruisce il client.
 *
 * `persistSession: false` perche' qui non c'e' nessuna sessione da conservare:
 * questo client lavora per conto della lega, non di una persona, e vive quanto
 * dura una richiesta.
 */
export function clientSupabase(o: OpzioniSupabase): SupabaseClient {
  return createClient(o.url, o.chiave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function archivioSupabase(client: SupabaseClient): Archivio {
  return {
    async leggi(legaId) {
      const { data: lega, error } = await client
        .from('leghe')
        .select('*')
        .eq('id', legaId)
        .maybeSingle<RigaLega>();
      esigiRiuscito(error, `lettura della lega ${legaId}`);
      if (!lega) return null;

      // Tre letture in parallelo: sono indipendenti e la latenza verso il
      // database si paga una volta sola invece di tre.
      const [squadre, rose, formazioni] = await Promise.all([
        client.from('squadre').select('*').eq('lega_id', legaId).order('id'),
        client.from('rose').select('*').eq('lega_id', legaId),
        client.from('formazioni').select('*').eq('lega_id', legaId),
      ]);
      esigiRiuscito(squadre.error, 'lettura delle squadre');
      esigiRiuscito(rose.error, 'lettura delle rose');
      esigiRiuscito(formazioni.error, 'lettura delle formazioni');

      const perSquadra = new Map<string, { giocatoreId: string; prezzo: number }[]>();
      for (const r of (rose.data ?? []) as RigaRosa[]) {
        const elenco = perSquadra.get(r.squadra_id) ?? [];
        elenco.push({ giocatoreId: r.giocatore_id, prezzo: r.prezzo });
        perSquadra.set(r.squadra_id, elenco);
      }

      const stato: StatoLega = {
        versione: VERSIONE_STATO,
        id: lega.id,
        nome: lega.nome,
        seme: lega.seme,
        modalita: lega.modalita,
        budget: lega.budget,
        giornateGiocate: lega.giornate_giocate,
        squadre: ((squadre.data ?? []) as RigaSquadra[]).map((s) => ({
          id: s.id,
          nome: s.nome,
          proprietario: s.proprietario,
          giocatori: perSquadra.get(s.id) ?? [],
        })),
        formazioni: ((formazioni.data ?? []) as RigaFormazione[]).map((f) => ({
          squadraId: f.squadra_id,
          giornata: f.giornata,
          modulo: f.modulo,
          titolari: f.titolari,
          panchina: f.panchina,
        })),
      };

      // Si valida anche quello che arriva dal database: le regole che il
      // database non puo' esprimere restano nostre, e un dato che non torna
      // deve fermarsi qui.
      return validaStatoLega(stato);
    },

    async scrivi(stato) {
      validaStatoLega(stato);

      // Serve a creare una lega. Non c'e' una transazione perche' il client
      // REST non le espone: si scrive dall'alto verso il basso, cosi' una
      // scrittura interrotta lascia una lega incompleta ma coerente — e chi
      // crea una lega e' una persona sola davanti a un terminale, non dieci
      // che schierano insieme.
      esigiRiuscito(
        (
          await client.from('leghe').upsert({
            id: stato.id,
            nome: stato.nome,
            seme: stato.seme,
            modalita: stato.modalita,
            budget: stato.budget,
            giornate_giocate: stato.giornateGiocate,
          } satisfies Omit<RigaLega, 'amministratore'>)
        ).error,
        'scrittura della lega',
      );

      esigiRiuscito(
        (
          await client.from('squadre').upsert(
            stato.squadre.map((s) => ({
              lega_id: stato.id,
              id: s.id,
              nome: s.nome,
              proprietario: s.proprietario,
            })),
          )
        ).error,
        'scrittura delle squadre',
      );

      const rose = stato.squadre.flatMap((s) =>
        s.giocatori.map((g) => ({
          lega_id: stato.id,
          squadra_id: s.id,
          giocatore_id: g.giocatoreId,
          prezzo: g.prezzo,
        })),
      );
      if (rose.length > 0) {
        esigiRiuscito((await client.from('rose').upsert(rose)).error, 'scrittura delle rose');
      }

      if (stato.formazioni.length > 0) {
        esigiRiuscito(
          (
            await client.from('formazioni').upsert(
              stato.formazioni.map((f) => ({
                lega_id: stato.id,
                squadra_id: f.squadraId,
                giornata: f.giornata,
                modulo: f.modulo,
                titolari: f.titolari,
                panchina: f.panchina,
              })),
            )
          ).error,
          'scrittura delle formazioni',
        );
      }
    },

    async salvaFormazione(legaId, formazione: FormazioneSalvata) {
      // Una riga sola. E' il punto per cui esiste questo metodo: dieci persone
      // che schierano la stessa sera toccano dieci righe diverse.
      esigiRiuscito(
        (
          await client.from('formazioni').upsert({
            lega_id: legaId,
            squadra_id: formazione.squadraId,
            giornata: formazione.giornata,
            modulo: formazione.modulo,
            titolari: formazione.titolari,
            panchina: formazione.panchina,
            aggiornata_il: new Date().toISOString(),
          })
        ).error,
        `salvataggio della formazione di ${formazione.squadraId}`,
      );
    },

    async segnaGiornateGiocate(legaId, fino) {
      esigiRiuscito(
        (await client.from('leghe').update({ giornate_giocate: fino }).eq('id', legaId)).error,
        'aggiornamento delle giornate giocate',
      );
    },

    async elenca() {
      const { data, error } = await client.from('leghe').select('id, nome').order('nome');
      esigiRiuscito(error, 'elenco delle leghe');
      return (data ?? []) as { id: string; nome: string }[];
    },
  };
}

/* ------------------------------------------------------------------ */

/**
 * L'archivio giusto secondo l'ambiente.
 *
 * Con le variabili di Supabase configurate si usa il database; senza, il file.
 * Non e' una scorciatoia: e' quello che permette di sviluppare e far girare i
 * test senza un database, e di non avere due strade diverse fra sviluppo e
 * produzione se non nell'ultimo metro.
 */
export function archivioDallAmbiente(
  ambiente: Record<string, string | undefined>,
  diRiserva: Archivio,
): Archivio {
  const url = ambiente['NEXT_PUBLIC_SUPABASE_URL'];
  const chiave = ambiente['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !chiave) return diRiserva;
  return archivioSupabase(clientSupabase({ url, chiave }));
}

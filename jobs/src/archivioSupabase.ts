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
  type Archivio, type CronacaSalvata, type EditorialeSalvato, type FormazioneSalvata,
  type MessaggioChat, type ScambioSalvato, type StatoLega, type VerdettoStagione, type VociMercatoSalvate,
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
type RigaScambio = {
  lega_id: string;
  id: string;
  da_squadra_id: string;
  a_squadra_id: string;
  offerti: string[];
  richiesti: string[];
  stato: string;
  motivo: string | null;
  creato_il: string;
  risolto_il: string | null;
};
type RigaCronaca = {
  lega_id: string;
  giornata: number;
  casa_id: string;
  ospite_id: string;
  testo: string;
  fonte: string;
};
type RigaEditoriale = { lega_id: string; giornata: number; testo: string; fonte: string };
type RigaMessaggioChat = {
  lega_id: string;
  id: string;
  giornata: number;
  squadra_id: string;
  evento: string;
  riferimento: string | null;
  testo: string;
  fonte: string;
};
type RigaVerdetto = {
  lega_id: string;
  stagione: number;
  campione_squadra_id: string;
  punti_campione: number;
  fantapunti_campione: number;
};
type RigaVociMercato = { lega_id: string; stagione: number; testo: string; fonte: string };

/** Un errore di Supabase diventa un errore leggibile, col contesto di cosa si stava facendo. */
function esigiRiuscito(errore: { message: string } | null, cosa: string): void {
  if (errore) throw new Error(`${cosa}: ${errore.message}`);
}

function daRigaScambio(r: RigaScambio): ScambioSalvato {
  return {
    id: r.id,
    daSquadraId: r.da_squadra_id,
    aSquadraId: r.a_squadra_id,
    offerti: r.offerti,
    richiesti: r.richiesti,
    stato: r.stato as ScambioSalvato['stato'],
    motivo: r.motivo,
    creatoIl: r.creato_il,
    risoltoIl: r.risolto_il,
  };
}

function aRigaScambio(legaId: string, s: ScambioSalvato): RigaScambio {
  return {
    lega_id: legaId,
    id: s.id,
    da_squadra_id: s.daSquadraId,
    a_squadra_id: s.aSquadraId,
    offerti: s.offerti,
    richiesti: s.richiesti,
    stato: s.stato,
    motivo: s.motivo,
    creato_il: s.creatoIl,
    risolto_il: s.risoltoIl,
  };
}

function daRigaCronaca(r: RigaCronaca): CronacaSalvata {
  return {
    giornata: r.giornata, casaId: r.casa_id, ospiteId: r.ospite_id,
    testo: r.testo, fonte: r.fonte as CronacaSalvata['fonte'],
  };
}

function aRigaCronaca(legaId: string, c: CronacaSalvata): RigaCronaca {
  return {
    lega_id: legaId, giornata: c.giornata, casa_id: c.casaId, ospite_id: c.ospiteId,
    testo: c.testo, fonte: c.fonte,
  };
}

function daRigaEditoriale(r: RigaEditoriale): EditorialeSalvato {
  return { giornata: r.giornata, testo: r.testo, fonte: r.fonte as EditorialeSalvato['fonte'] };
}

function aRigaEditoriale(legaId: string, e: EditorialeSalvato): RigaEditoriale {
  return { lega_id: legaId, giornata: e.giornata, testo: e.testo, fonte: e.fonte };
}

function daRigaMessaggioChat(r: RigaMessaggioChat): MessaggioChat {
  return {
    id: r.id, giornata: r.giornata, squadraId: r.squadra_id,
    evento: r.evento as MessaggioChat['evento'], riferimento: r.riferimento,
    testo: r.testo, fonte: r.fonte as MessaggioChat['fonte'],
  };
}

function aRigaMessaggioChat(legaId: string, m: MessaggioChat): RigaMessaggioChat {
  return {
    lega_id: legaId, id: m.id, giornata: m.giornata, squadra_id: m.squadraId,
    evento: m.evento, riferimento: m.riferimento, testo: m.testo, fonte: m.fonte,
  };
}

function daRigaVerdetto(r: RigaVerdetto): VerdettoStagione {
  return {
    stagione: r.stagione, campioneSquadraId: r.campione_squadra_id,
    puntiCampione: r.punti_campione, fantapuntiCampione: r.fantapunti_campione,
  };
}

function aRigaVerdetto(legaId: string, v: VerdettoStagione): RigaVerdetto {
  return {
    lega_id: legaId, stagione: v.stagione, campione_squadra_id: v.campioneSquadraId,
    punti_campione: v.puntiCampione, fantapunti_campione: v.fantapuntiCampione,
  };
}

function daRigaVociMercato(r: RigaVociMercato): VociMercatoSalvate {
  return { stagione: r.stagione, testo: r.testo, fonte: r.fonte as VociMercatoSalvate['fonte'] };
}

function aRigaVociMercato(legaId: string, v: VociMercatoSalvate): RigaVociMercato {
  return { lega_id: legaId, stagione: v.stagione, testo: v.testo, fonte: v.fonte };
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

      // Nove letture in parallelo: sono indipendenti e la latenza verso il
      // database si paga una volta sola invece di nove.
      const [squadre, rose, formazioni, scambi, cronache, editoriali, chat, alboDoro, vociMercato] =
        await Promise.all([
          client.from('squadre').select('*').eq('lega_id', legaId).order('id'),
          client.from('rose').select('*').eq('lega_id', legaId),
          client.from('formazioni').select('*').eq('lega_id', legaId),
          client.from('scambi').select('*').eq('lega_id', legaId).order('creato_il'),
          client.from('cronache').select('*').eq('lega_id', legaId),
          client.from('editoriali').select('*').eq('lega_id', legaId),
          client.from('chat').select('*').eq('lega_id', legaId),
          client.from('albo_doro').select('*').eq('lega_id', legaId),
          client.from('voci_mercato').select('*').eq('lega_id', legaId),
        ]);
      esigiRiuscito(squadre.error, 'lettura delle squadre');
      esigiRiuscito(rose.error, 'lettura delle rose');
      esigiRiuscito(formazioni.error, 'lettura delle formazioni');
      esigiRiuscito(scambi.error, 'lettura degli scambi');
      esigiRiuscito(cronache.error, 'lettura delle cronache');
      esigiRiuscito(editoriali.error, 'lettura degli editoriali');
      esigiRiuscito(chat.error, 'lettura della chat');
      esigiRiuscito(alboDoro.error, 'lettura dell’albo d’oro');
      esigiRiuscito(vociMercato.error, 'lettura delle voci di mercato');

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
        amministratore: lega.amministratore,
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
        scambi: ((scambi.data ?? []) as RigaScambio[]).map(daRigaScambio),
        cronache: ((cronache.data ?? []) as RigaCronaca[]).map(daRigaCronaca),
        editoriali: ((editoriali.data ?? []) as RigaEditoriale[]).map(daRigaEditoriale),
        chat: ((chat.data ?? []) as RigaMessaggioChat[]).map(daRigaMessaggioChat),
        alboDoro: ((alboDoro.data ?? []) as RigaVerdetto[]).map(daRigaVerdetto),
        vociMercato: ((vociMercato.data ?? []) as RigaVociMercato[]).map(daRigaVociMercato),
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
            amministratore: stato.amministratore,
          } satisfies RigaLega)
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

      if (stato.scambi.length > 0) {
        esigiRiuscito(
          (await client.from('scambi').upsert(stato.scambi.map((s) => aRigaScambio(stato.id, s))))
            .error,
          'scrittura degli scambi',
        );
      }

      if (stato.cronache.length > 0) {
        esigiRiuscito(
          (
            await client
              .from('cronache')
              .upsert(stato.cronache.map((c) => aRigaCronaca(stato.id, c)))
          ).error,
          'scrittura delle cronache',
        );
      }

      if (stato.editoriali.length > 0) {
        esigiRiuscito(
          (
            await client
              .from('editoriali')
              .upsert(stato.editoriali.map((e) => aRigaEditoriale(stato.id, e)))
          ).error,
          'scrittura degli editoriali',
        );
      }

      if (stato.chat.length > 0) {
        esigiRiuscito(
          (await client.from('chat').upsert(stato.chat.map((m) => aRigaMessaggioChat(stato.id, m))))
            .error,
          'scrittura della chat',
        );
      }

      if (stato.alboDoro.length > 0) {
        esigiRiuscito(
          (
            await client
              .from('albo_doro')
              .upsert(stato.alboDoro.map((v) => aRigaVerdetto(stato.id, v)))
          ).error,
          'scrittura dell’albo d’oro',
        );
      }

      if (stato.vociMercato.length > 0) {
        esigiRiuscito(
          (
            await client
              .from('voci_mercato')
              .upsert(stato.vociMercato.map((v) => aRigaVociMercato(stato.id, v)))
          ).error,
          'scrittura delle voci di mercato',
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

    async proponiScambio(legaId, scambio) {
      esigiRiuscito(
        (await client.from('scambi').insert(aRigaScambio(legaId, scambio))).error,
        `proposta dello scambio ${scambio.id}`,
      );
    },

    async risolviScambio(legaId, scambio) {
      // Se accettato, prima si spostano i giocatori fra le rose e solo dopo si
      // marca lo scambio risolto: un'interruzione a meta' lascia uno scambio
      // ancora "proposto" da poter ritentare, mai un doppio spostamento.
      if (scambio.stato === 'accettato') {
        esigiRiuscito(
          (
            await client
              .from('rose')
              .update({ squadra_id: scambio.aSquadraId })
              .eq('lega_id', legaId)
              .in('giocatore_id', scambio.offerti)
          ).error,
          `scambio ${scambio.id}: spostamento dei giocatori offerti`,
        );
        esigiRiuscito(
          (
            await client
              .from('rose')
              .update({ squadra_id: scambio.daSquadraId })
              .eq('lega_id', legaId)
              .in('giocatore_id', scambio.richiesti)
          ).error,
          `scambio ${scambio.id}: spostamento dei giocatori richiesti`,
        );
      }

      esigiRiuscito(
        (await client.from('scambi').update(aRigaScambio(legaId, scambio)).eq('id', scambio.id))
          .error,
        `risoluzione dello scambio ${scambio.id}`,
      );
    },

    async salvaCronaca(legaId, cronaca) {
      esigiRiuscito(
        (await client.from('cronache').upsert(aRigaCronaca(legaId, cronaca))).error,
        `salvataggio della cronaca ${cronaca.casaId}-${cronaca.ospiteId}, giornata ${cronaca.giornata}`,
      );
    },

    async salvaEditoriale(legaId, editoriale) {
      esigiRiuscito(
        (await client.from('editoriali').upsert(aRigaEditoriale(legaId, editoriale))).error,
        `salvataggio dell'editoriale della giornata ${editoriale.giornata}`,
      );
    },

    async salvaMessaggioChat(legaId, messaggio) {
      esigiRiuscito(
        (await client.from('chat').insert(aRigaMessaggioChat(legaId, messaggio))).error,
        `salvataggio del messaggio di chat ${messaggio.id}`,
      );
    },

    async salvaVerdettoStagione(legaId, verdetto) {
      esigiRiuscito(
        (await client.from('albo_doro').upsert(aRigaVerdetto(legaId, verdetto))).error,
        `salvataggio del verdetto della stagione ${verdetto.stagione}`,
      );
    },

    async salvaVociMercato(legaId, voci) {
      esigiRiuscito(
        (await client.from('voci_mercato').upsert(aRigaVociMercato(legaId, voci))).error,
        `salvataggio delle voci di mercato della stagione ${voci.stagione}`,
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

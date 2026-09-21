/**
 * Dove vive lo stato della lega.
 *
 * `Archivio` e' un **contratto** (regola 4), non un'implementazione unica:
 * oggi lo stato sta in un file JSON e domani stara' su Supabase, e chi legge e
 * scrive non deve accorgersene. L'implementazione su file non e' un ripiego
 * temporaneo da buttare: e' anche il modo di far girare tutto in locale senza
 * un database, che serve ai test e a chi sviluppa.
 *
 * ## Cosa si salva, e cosa no
 *
 * Si salva **solo quello che ha deciso una persona**: la configurazione della
 * lega, le rose uscite dall'asta, le formazioni schierate e quante giornate si
 * sono giocate. Voti, statistiche, risultati e classifica **non si salvano**,
 * perche' non sono dati: sono una funzione pura del seme del mondo e delle
 * formazioni salvate, e ricalcolarli da' sempre lo stesso identico esito.
 *
 * Non e' un risparmio di spazio, e' la stessa idempotenza della regola 6 vista
 * da un'altra parte. Uno stato che si puo' solo ricalcolare non puo' andare
 * fuori sincrono con quello che e' successo: non esiste il caso in cui la
 * classifica salvata dice una cosa e i risultati un'altra.
 *
 * **Cronache ed editoriali sono l'eccezione dichiarata** (SPEC 8): sono
 * derivate dai risultati come la classifica, ma generarle costa una chiamata
 * a un provider esterno, non un calcolo. Si generano una volta nel job serale
 * e si salvano per davvero — "mai generazione al caricamento della pagina" —
 * altrimenti ogni visita alla schermata delle giornate ripagherebbe la stessa
 * cronaca in quota Groq.
 *
 * **`vistaStagione` (jobs/src/lega.ts) ha la stessa eccezione, per lo stesso
 * motivo con un costo diverso**: e' un ricalcolo, non una chiamata esterna,
 * ma rigioca l'intera storia della lega a ogni chiamata (SPEC 6, idempotenza
 * vista dal contatore) — su un'istanza serverless fredda quel costo si paga a
 * ogni visita, non solo la prima. `leggiVistaStagioneCache`/
 * `scriviVistaStagioneCache` non sono una quarta cosa "che ha deciso una
 * persona": sono un dettaglio implementativo, best-effort. Una lettura che
 * torna `null`, o una `giornateGiocate` che non corrisponde piu' allo stato
 * attuale, si tratta esattamente come una cache assente — chi chiama ricalcola
 * dal vivo, come farebbe senza questi due metodi.
 */

import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { EsitoCiclo } from './ciclo.ts';

/* ------------------------------------------------------------------ */
/* Lo stato                                                            */
/* ------------------------------------------------------------------ */

export type ModalitaSalvata = 'classic' | 'mantra';

export type GiocatoreInRosa = {
  giocatoreId: string;
  /** Crediti pagati all'asta. Serve alla rosa e, un domani, agli scambi. */
  prezzo: number;
};

export type SquadraSalvata = {
  id: string;
  nome: string;
  /**
   * Chi la gestisce, per quando ci sara' l'autenticazione. `null` e' un bot.
   * Oggi non decide niente: e' qui perche' le rose importate lo dicono gia'.
   */
  proprietario: string | null;
  giocatori: GiocatoreInRosa[];
};

/**
 * Una formazione come e' stata salvata per una certa giornata.
 *
 * I titolari sono coppie `[slot, giocatoreId]` invece di una mappa perche' il
 * JSON non ha le mappe. La conversione sta in `formazioneDaSalvata`.
 */
export type FormazioneSalvata = {
  squadraId: string;
  giornata: number;
  modulo: string;
  titolari: [string, string][];
  panchina: string[];
};

/**
 * Uno scambio, dalla proposta alla risoluzione (SPEC 6.5).
 *
 * `offerti` sono i giocatori che escono dalla rosa di `daSquadraId` verso
 * `aSquadraId`; `richiesti` il contrario. Il record resta anche dopo essere
 * stato risolto: e' lo storico che SPEC 6.5 chiede, e senza uno stato passato
 * non si potrebbe nemmeno contare il tetto di scambi per stagione.
 */
export type StatoScambio = 'proposto' | 'accettato' | 'rifiutato' | 'ritirato';

export type ScambioSalvato = {
  id: string;
  daSquadraId: string;
  aSquadraId: string;
  offerti: string[];
  richiesti: string[];
  stato: StatoScambio;
  /** Perche' e' stato deciso cosi': soprattutto per i rifiuti automatici dei bot. */
  motivo: string | null;
  creatoIl: string;
  /** `null` finche' e' `proposto`. */
  risoltoIl: string | null;
};

/** Da chi viene un testo generato (SPEC 8): serve a mostrarlo diversamente, non a nasconderlo. */
export type FonteTesto = 'ai' | 'template';

/** La cronaca di una partita del mondo simulato: 10 a giornata, indipendenti dalla lega. */
export type CronacaSalvata = {
  giornata: number;
  casaId: string;
  ospiteId: string;
  testo: string;
  fonte: FonteTesto;
};

/** L'editoriale di lega di una giornata: uno solo, dipende dai risultati fanta. */
export type EditorialeSalvato = {
  giornata: number;
  testo: string;
  fonte: FonteTesto;
};

/** L'evento che fa intervenire un bot in chat (SPEC 7.2). */
export type EventoChat = 'sconfittaPesante' | 'scambioRifiutato' | 'colpoDiMercato';

/**
 * Un messaggio di un bot in chat: reazione a un evento scatenante, mai un
 * commento libero. `riferimento` e' l'id dello scambio quando l'evento e' uno
 * scambio, `null` per una sconfitta — serve a non far reagire due volte allo
 * stesso episodio.
 */
export type MessaggioChat = {
  id: string;
  giornata: number;
  squadraId: string;
  evento: EventoChat;
  riferimento: string | null;
  testo: string;
  fonte: FonteTesto;
};

/**
 * Il verdetto di una stagione chiusa (SPEC 5.8 punto 1): chi l'ha vinta.
 * Non e' un derivato da ricalcolare come la classifica in corso — una volta
 * chiusa, una stagione non deve poter cambiare verdetto perche' e' cambiata
 * la formula del fantavoto o un bug e' stato corretto nel frattempo. E'
 * l'albo d'oro della carriera: si scrive una volta e resta.
 */
export type VerdettoStagione = {
  stagione: number;
  campioneSquadraId: string;
  puntiCampione: number;
  fantapuntiCampione: number;
};

/** Le voci di mercato di una stagione (SPEC 8): una alla finestra di fine stagione. */
export type VociMercatoSalvate = {
  /** La stagione che sta per iniziare, non quella appena chiusa: sono voci su cosa succedera'. */
  stagione: number;
  testo: string;
  fonte: FonteTesto;
};

export type StatoLega = {
  versione: number;
  id: string;
  nome: string;
  /** Decide il mondo simulato e il calendario: due leghe con semi diversi vedono campionati diversi. */
  seme: string;
  modalita: ModalitaSalvata;
  budget: number;
  /** Quante giornate sono state giocate. Le successive non esistono ancora. */
  giornateGiocate: number;
  /**
   * Quante giornate gioca il job automatico a ogni ciclo (SPEC §4
   * `giornate_per_ciclo`): il "ritmo" della lega. L'orario resta invece fisso
   * per tutte le leghe (stesso §4, "Orario del ciclo: fisso, serale") — il
   * piano gratuito di Vercel esegue un solo cron al giorno, alla stessa ora
   * per chiunque, quindi non e' un parametro di lega.
   */
  giornateAlGiorno: number;
  /**
   * La mail di chi ha creato la lega: puo' assegnare le sue squadre e
   * impostarne la parola d'ordine. Non e' un ruolo globale, e' per lega.
   */
  amministratore: string | null;
  squadre: SquadraSalvata[];
  formazioni: FormazioneSalvata[];
  scambi: ScambioSalvato[];
  cronache: CronacaSalvata[];
  editoriali: EditorialeSalvato[];
  chat: MessaggioChat[];
  alboDoro: VerdettoStagione[];
  vociMercato: VociMercatoSalvate[];
};

export const VERSIONE_STATO = 6;

/* ------------------------------------------------------------------ */
/* Il contratto                                                        */
/* ------------------------------------------------------------------ */

export type Archivio = {
  /** `null` se la lega non esiste. */
  leggi(legaId: string): Promise<StatoLega | null>;
  /**
   * Sovrascrive per intero. Deve essere atomico: o tutto, o niente.
   *
   * Serve a creare una lega, non a modificarla: per le due cose che
   * cambiano davvero durante la stagione ci sono i due metodi qui sotto.
   */
  scrivi(stato: StatoLega): Promise<void>;
  /**
   * Salva la formazione di **una** squadra per **una** giornata.
   *
   * Non e’ una comodita’: riscrivere tutto lo stato per salvare una
   * formazione perderebbe il lavoro di chi ha schierato nello stesso
   * momento, e la sera prima di una giornata schierano tutti insieme.
   * Qui due persone che salvano contemporaneamente toccano due righe
   * diverse e non si vedono nemmeno.
   */
  salvaFormazione(legaId: string, formazione: FormazioneSalvata): Promise<void>;
  /**
   * Porta le giornate giocate a `fino`. E’ l’unica cosa che scrive il job
   * serale, ed e’ il motivo per cui e’ idempotente: scriverci due volte lo
   * stesso numero non cambia niente.
   */
  segnaGiornateGiocate(legaId: string, fino: number): Promise<void>;
  /**
   * Registra una nuova proposta di scambio. Una riga sola, per lo stesso
   * motivo di `salvaFormazione`: proporre uno scambio non deve poter
   * travolgere il lavoro di chi ne sta proponendo un altro nello stesso
   * momento.
   */
  proponiScambio(legaId: string, scambio: ScambioSalvato): Promise<void>;
  /**
   * Risolve uno scambio gia' proposto: ne aggiorna lo stato e, se accettato,
   * sposta i giocatori fra le due rose nella stessa scrittura logica. Non e'
   * `scrivi()` perche' tocca solo le due squadre coinvolte, non l'intera lega.
   */
  risolviScambio(legaId: string, scambio: ScambioSalvato): Promise<void>;
  /**
   * Salva la cronaca di **una** partita di **una** giornata. Rigenerarla
   * sostituisce quella salvata: e' cosi' che il job serale resta idempotente
   * anche qui, senza bisogno di una guardia "l'ho gia' generata?".
   */
  salvaCronaca(legaId: string, cronaca: CronacaSalvata): Promise<void>;
  /** Salva l'editoriale di **una** giornata. Stessa logica di `salvaCronaca`. */
  salvaEditoriale(legaId: string, editoriale: EditorialeSalvato): Promise<void>;
  /**
   * Aggiunge un messaggio di chat. Sempre in aggiunta, mai in sostituzione:
   * a differenza di cronaca ed editoriale, in una giornata possono convivere
   * piu' messaggi (di bot diversi, o per eventi diversi). E' chi genera —
   * `chat.ts` — a non generarne due per lo stesso evento, controllando prima
   * lo storico.
   */
  salvaMessaggioChat(legaId: string, messaggio: MessaggioChat): Promise<void>;
  /**
   * Registra il verdetto di una stagione appena chiusa (SPEC 5.8 punto 1).
   * Una sola volta per stagione: chi chiama controlla prima che non ci sia
   * gia', esattamente come per i messaggi di chat.
   */
  salvaVerdettoStagione(legaId: string, verdetto: VerdettoStagione): Promise<void>;
  /** Salva le voci di mercato di una stagione in arrivo. Rigenerarle sostituisce, come `salvaEditoriale`. */
  salvaVociMercato(legaId: string, voci: VociMercatoSalvate): Promise<void>;
  elenca(): Promise<{ id: string; nome: string }[]>;
  /**
   * Cache best-effort di `vistaStagione` (vedi il commento in cima al file).
   * `null` se non c'e' una cache, non se la lega non esiste: chi chiama non
   * deve distinguere i due casi, in entrambi ricalcola dal vivo.
   */
  leggiVistaStagioneCache(legaId: string): Promise<{ giornateGiocate: number; vista: EsitoCiclo } | null>;
  /** Scrive la cache. Sovrascrive quella precedente: una riga per lega, non una storia che cresce. */
  scriviVistaStagioneCache(legaId: string, giornateGiocate: number, vista: EsitoCiclo): Promise<void>;
};

/* ------------------------------------------------------------------ */
/* Validazione                                                         */
/* ------------------------------------------------------------------ */

function esigi(condizione: boolean, messaggio: string): void {
  if (!condizione) throw new Error(`Stato di lega non valido: ${messaggio}`);
}

/** Trova una squadra per id, o fallisce con un messaggio che dice quale manca. */
export function trovaSquadra(stato: StatoLega, squadraId: string): SquadraSalvata {
  const squadra = stato.squadre.find((s) => s.id === squadraId);
  if (!squadra) throw new Error(`Squadra sconosciuta: ${squadraId}`);
  return squadra;
}

/**
 * Controlla quello che il tipo non puo' controllare.
 *
 * Un file scritto a mano o lasciato indietro da una versione precedente deve
 * fermarsi qui, non tre schermate piu' avanti con una formazione a dieci
 * uomini e nessuno che capisce perche'.
 */
export function validaStatoLega(s: StatoLega): StatoLega {
  esigi(s.versione === VERSIONE_STATO, `versione ${s.versione} non supportata`);
  esigi(s.id.length > 0, 'la lega deve avere un id');
  esigi(s.seme.length > 0, 'la lega deve avere un seme');
  esigi(s.giornateGiocate >= 0, 'le giornate giocate non possono essere negative');
  esigi(
    Number.isInteger(s.giornateAlGiorno) && s.giornateAlGiorno >= 1,
    `giornateAlGiorno deve essere un intero positivo, ricevuto ${s.giornateAlGiorno}`,
  );
  esigi(s.squadre.length > 0, 'una lega senza squadre non e’ una lega');

  const viste = new Set<string>();
  for (const squadra of s.squadre) {
    esigi(!viste.has(squadra.id), `squadra duplicata: ${squadra.id}`);
    viste.add(squadra.id);
    const giocatori = new Set(squadra.giocatori.map((g) => g.giocatoreId));
    esigi(
      giocatori.size === squadra.giocatori.length,
      `${squadra.nome}: lo stesso giocatore compare due volte in rosa`,
    );
  }

  // Lo stesso giocatore non puo' stare in due rose: e' l'invariante che rende
  // sensata una lega, e un import andato storto e' il modo piu' facile di
  // romperla.
  const proprietario = new Map<string, string>();
  for (const squadra of s.squadre) {
    for (const g of squadra.giocatori) {
      const altra = proprietario.get(g.giocatoreId);
      esigi(
        altra === undefined,
        `il giocatore ${g.giocatoreId} e’ sia di ${altra} sia di ${squadra.nome}`,
      );
      proprietario.set(g.giocatoreId, squadra.nome);
    }
  }

  for (const f of s.formazioni) {
    esigi(viste.has(f.squadraId), `formazione di una squadra inesistente: ${f.squadraId}`);
    esigi(f.giornata >= 1, `formazione con giornata ${f.giornata}`);
    const titolari = new Set(f.titolari.map(([, id]) => id));
    esigi(
      titolari.size === f.titolari.length,
      `${f.squadraId}, giornata ${f.giornata}: un titolare schierato due volte`,
    );
  }

  const scambiVisti = new Set<string>();
  for (const sc of s.scambi) {
    esigi(!scambiVisti.has(sc.id), `scambio duplicato: ${sc.id}`);
    scambiVisti.add(sc.id);
    esigi(viste.has(sc.daSquadraId), `scambio ${sc.id}: squadra inesistente ${sc.daSquadraId}`);
    esigi(viste.has(sc.aSquadraId), `scambio ${sc.id}: squadra inesistente ${sc.aSquadraId}`);
    esigi(sc.daSquadraId !== sc.aSquadraId, `scambio ${sc.id}: una squadra non scambia con se stessa`);
    esigi(sc.offerti.length > 0, `scambio ${sc.id}: nessun giocatore offerto`);
    esigi(sc.richiesti.length > 0, `scambio ${sc.id}: nessun giocatore richiesto`);
  }

  const cronacheViste = new Set<string>();
  for (const c of s.cronache) {
    const chiave = `${c.giornata}:${c.casaId}:${c.ospiteId}`;
    esigi(!cronacheViste.has(chiave), `cronaca duplicata: ${chiave}`);
    cronacheViste.add(chiave);
    esigi(c.giornata >= 1, `cronaca con giornata ${c.giornata}`);
  }

  const editorialiVisti = new Set<number>();
  for (const e of s.editoriali) {
    esigi(!editorialiVisti.has(e.giornata), `editoriale duplicato per la giornata ${e.giornata}`);
    editorialiVisti.add(e.giornata);
    esigi(e.giornata >= 1, `editoriale con giornata ${e.giornata}`);
  }

  const messaggiVisti = new Set<string>();
  for (const m of s.chat) {
    esigi(!messaggiVisti.has(m.id), `messaggio di chat duplicato: ${m.id}`);
    messaggiVisti.add(m.id);
    esigi(viste.has(m.squadraId), `messaggio di chat di una squadra inesistente: ${m.squadraId}`);
    esigi(m.giornata >= 1, `messaggio di chat con giornata ${m.giornata}`);
  }

  const stagioniVerdetto = new Set<number>();
  for (const v of s.alboDoro) {
    esigi(!stagioniVerdetto.has(v.stagione), `verdetto duplicato per la stagione ${v.stagione}`);
    stagioniVerdetto.add(v.stagione);
    esigi(v.stagione >= 1, `verdetto con stagione ${v.stagione}`);
    esigi(viste.has(v.campioneSquadraId), `verdetto di una squadra inesistente: ${v.campioneSquadraId}`);
  }

  const stagioniVociMercato = new Set<number>();
  for (const voci of s.vociMercato) {
    esigi(!stagioniVociMercato.has(voci.stagione), `voci di mercato duplicate per la stagione ${voci.stagione}`);
    stagioniVociMercato.add(voci.stagione);
    esigi(voci.stagione >= 1, `voci di mercato con stagione ${voci.stagione}`);
  }

  return s;
}

/* ------------------------------------------------------------------ */
/* Scambi: la parte comune alle implementazioni dell'archivio           */
/* ------------------------------------------------------------------ */

/**
 * Applica a uno stato l'esito di uno scambio gia' deciso altrove: aggiorna il
 * suo record e, se accettato, sposta i giocatori fra le due rose.
 *
 * E' una funzione pura e non fa parte del contratto: le tre implementazioni la
 * condividono per non dover concordare tre volte la stessa regola su "cosa
 * vuol dire accettare uno scambio".
 */
export function applicaEsitoScambio(stato: StatoLega, scambio: ScambioSalvato): StatoLega {
  const altri = stato.scambi.filter((s) => s.id !== scambio.id);

  if (scambio.stato !== 'accettato') {
    return { ...stato, scambi: [...altri, scambio] };
  }

  const da = stato.squadre.find((s) => s.id === scambio.daSquadraId);
  const a = stato.squadre.find((s) => s.id === scambio.aSquadraId);
  if (!da || !a) throw new Error(`Scambio ${scambio.id}: squadra sconosciuta`);

  const offertiSet = new Set(scambio.offerti);
  const richiestiSet = new Set(scambio.richiesti);
  const daGiocatori = da.giocatori.filter((g) => !offertiSet.has(g.giocatoreId));
  const aGiocatori = a.giocatori.filter((g) => !richiestiSet.has(g.giocatoreId));
  const spostatiVersoA = da.giocatori.filter((g) => offertiSet.has(g.giocatoreId));
  const spostatiVersoDa = a.giocatori.filter((g) => richiestiSet.has(g.giocatoreId));

  const squadre = stato.squadre.map((s) => {
    if (s.id === da.id) return { ...s, giocatori: [...daGiocatori, ...spostatiVersoDa] };
    if (s.id === a.id) return { ...s, giocatori: [...aGiocatori, ...spostatiVersoA] };
    return s;
  });

  return { ...stato, squadre, scambi: [...altri, scambio] };
}

/* ------------------------------------------------------------------ */
/* Implementazione su file                                             */
/* ------------------------------------------------------------------ */

/**
 * Una lega per file, in una cartella.
 *
 * La scrittura passa per un file temporaneo e una `rename`, che sui filesystem
 * normali e' atomica: se il processo muore a meta' si ritrova la versione
 * precedente intatta, mai un JSON tronco. Una lega mezza scritta vorrebbe dire
 * rifare l'asta.
 */
export function archivioSuFile(cartella: string): Archivio {
  const percorso = (id: string): string => join(cartella, `${id}.json`);

  return {
    async leggi(legaId) {
      try {
        const testo = await readFile(percorso(legaId), 'utf8');
        return validaStatoLega(JSON.parse(testo) as StatoLega);
      } catch (errore) {
        if ((errore as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw errore;
      }
    },

    async scrivi(stato) {
      validaStatoLega(stato);
      const destinazione = percorso(stato.id);
      await mkdir(dirname(destinazione), { recursive: true });
      const temporaneo = `${destinazione}.${process.pid}.tmp`;
      await writeFile(temporaneo, `${JSON.stringify(stato, null, 2)}\n`, 'utf8');
      await rename(temporaneo, destinazione);
    },

    async salvaFormazione(legaId, formazione) {
      const stato = await this.leggi(legaId);
      if (!stato) throw new Error(`Lega inesistente: ${legaId}`);
      // Su file si rilegge e si riscrive tutto: e’ un processo solo, e il
      // rename atomico basta. La differenza col database si vede con dieci
      // persone che schierano insieme, non qui.
      const altre = stato.formazioni.filter(
        (f) => !(f.squadraId === formazione.squadraId && f.giornata === formazione.giornata),
      );
      await this.scrivi({ ...stato, formazioni: [...altre, formazione] });
    },

    async segnaGiornateGiocate(legaId, fino) {
      const stato = await this.leggi(legaId);
      if (!stato) throw new Error(`Lega inesistente: ${legaId}`);
      await this.scrivi({ ...stato, giornateGiocate: fino });
    },

    async proponiScambio(legaId, scambio) {
      const stato = await this.leggi(legaId);
      if (!stato) throw new Error(`Lega inesistente: ${legaId}`);
      await this.scrivi({ ...stato, scambi: [...stato.scambi, scambio] });
    },

    async risolviScambio(legaId, scambio) {
      const stato = await this.leggi(legaId);
      if (!stato) throw new Error(`Lega inesistente: ${legaId}`);
      await this.scrivi(applicaEsitoScambio(stato, scambio));
    },

    async salvaCronaca(legaId, cronaca) {
      const stato = await this.leggi(legaId);
      if (!stato) throw new Error(`Lega inesistente: ${legaId}`);
      const altre = stato.cronache.filter(
        (c) => !(c.giornata === cronaca.giornata && c.casaId === cronaca.casaId && c.ospiteId === cronaca.ospiteId),
      );
      await this.scrivi({ ...stato, cronache: [...altre, cronaca] });
    },

    async salvaEditoriale(legaId, editoriale) {
      const stato = await this.leggi(legaId);
      if (!stato) throw new Error(`Lega inesistente: ${legaId}`);
      const altri = stato.editoriali.filter((e) => e.giornata !== editoriale.giornata);
      await this.scrivi({ ...stato, editoriali: [...altri, editoriale] });
    },

    async salvaMessaggioChat(legaId, messaggio) {
      const stato = await this.leggi(legaId);
      if (!stato) throw new Error(`Lega inesistente: ${legaId}`);
      await this.scrivi({ ...stato, chat: [...stato.chat, messaggio] });
    },

    async salvaVerdettoStagione(legaId, verdetto) {
      const stato = await this.leggi(legaId);
      if (!stato) throw new Error(`Lega inesistente: ${legaId}`);
      await this.scrivi({ ...stato, alboDoro: [...stato.alboDoro, verdetto] });
    },

    async salvaVociMercato(legaId, voci) {
      const stato = await this.leggi(legaId);
      if (!stato) throw new Error(`Lega inesistente: ${legaId}`);
      const altre = stato.vociMercato.filter((v) => v.stagione !== voci.stagione);
      await this.scrivi({ ...stato, vociMercato: [...altre, voci] });
    },

    async elenca() {
      let file: string[];
      try {
        file = await readdir(cartella);
      } catch (errore) {
        if ((errore as NodeJS.ErrnoException).code === 'ENOENT') return [];
        throw errore;
      }

      const leghe: { id: string; nome: string }[] = [];
      for (const nome of file.filter((f) => f.endsWith('.json'))) {
        const id = nome.slice(0, -'.json'.length);
        try {
          const stato = JSON.parse(await readFile(join(cartella, nome), 'utf8')) as StatoLega;
          leghe.push({ id, nome: stato.nome ?? id });
        } catch {
          // Un file illeggibile non deve impedire di vedere le altre leghe.
        }
      }
      return leghe.sort((a, b) => a.nome.localeCompare(b.nome));
    },

    // Su file il processo e' uno solo e vive a lungo quanto serve: la cache
    // in memoria di `stagioneDi` (web/src/dati.ts) gia' evita il ricalcolo
    // entro lo stesso processo. Il problema che questa cache risolve —
    // un'istanza diversa a ogni richiesta — qui non esiste.
    async leggiVistaStagioneCache() {
      return null;
    },
    async scriviVistaStagioneCache() {},
  };
}

/* ------------------------------------------------------------------ */
/* Archivio in memoria, per i test                                     */
/* ------------------------------------------------------------------ */

export function archivioInMemoria(iniziale: StatoLega[] = []): Archivio {
  const leghe = new Map(iniziale.map((s) => [s.id, structuredClone(s)]));
  return {
    async leggi(legaId) {
      const s = leghe.get(legaId);
      return s ? validaStatoLega(structuredClone(s)) : null;
    },
    async scrivi(stato) {
      validaStatoLega(stato);
      leghe.set(stato.id, structuredClone(stato));
    },
    async salvaFormazione(legaId, formazione) {
      const stato = leghe.get(legaId);
      if (!stato) throw new Error(`Lega inesistente: ${legaId}`);
      stato.formazioni = [
        ...stato.formazioni.filter(
          (f) => !(f.squadraId === formazione.squadraId && f.giornata === formazione.giornata),
        ),
        structuredClone(formazione),
      ];
      validaStatoLega(stato);
    },
    async segnaGiornateGiocate(legaId, fino) {
      const stato = leghe.get(legaId);
      if (!stato) throw new Error(`Lega inesistente: ${legaId}`);
      stato.giornateGiocate = fino;
    },
    async proponiScambio(legaId, scambio) {
      const stato = leghe.get(legaId);
      if (!stato) throw new Error(`Lega inesistente: ${legaId}`);
      stato.scambi = [...stato.scambi, structuredClone(scambio)];
    },
    async risolviScambio(legaId, scambio) {
      const stato = leghe.get(legaId);
      if (!stato) throw new Error(`Lega inesistente: ${legaId}`);
      leghe.set(legaId, applicaEsitoScambio(stato, structuredClone(scambio)));
    },
    async salvaCronaca(legaId, cronaca) {
      const stato = leghe.get(legaId);
      if (!stato) throw new Error(`Lega inesistente: ${legaId}`);
      stato.cronache = [
        ...stato.cronache.filter(
          (c) => !(c.giornata === cronaca.giornata && c.casaId === cronaca.casaId && c.ospiteId === cronaca.ospiteId),
        ),
        structuredClone(cronaca),
      ];
    },
    async salvaEditoriale(legaId, editoriale) {
      const stato = leghe.get(legaId);
      if (!stato) throw new Error(`Lega inesistente: ${legaId}`);
      stato.editoriali = [
        ...stato.editoriali.filter((e) => e.giornata !== editoriale.giornata),
        structuredClone(editoriale),
      ];
    },
    async salvaMessaggioChat(legaId, messaggio) {
      const stato = leghe.get(legaId);
      if (!stato) throw new Error(`Lega inesistente: ${legaId}`);
      stato.chat = [...stato.chat, structuredClone(messaggio)];
    },
    async salvaVerdettoStagione(legaId, verdetto) {
      const stato = leghe.get(legaId);
      if (!stato) throw new Error(`Lega inesistente: ${legaId}`);
      stato.alboDoro = [...stato.alboDoro, structuredClone(verdetto)];
    },
    async salvaVociMercato(legaId, voci) {
      const stato = leghe.get(legaId);
      if (!stato) throw new Error(`Lega inesistente: ${legaId}`);
      stato.vociMercato = [
        ...stato.vociMercato.filter((v) => v.stagione !== voci.stagione),
        structuredClone(voci),
      ];
    },
    async elenca() {
      return [...leghe.values()]
        .map((s) => ({ id: s.id, nome: s.nome }))
        .sort((a, b) => a.nome.localeCompare(b.nome));
    },

    async leggiVistaStagioneCache() {
      return null;
    },
    async scriviVistaStagioneCache() {},
  };
}

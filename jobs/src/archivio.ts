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
 */

import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

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
   * La mail di chi ha creato la lega: puo' assegnare le sue squadre e
   * impostarne la parola d'ordine. Non e' un ruolo globale, e' per lega.
   */
  amministratore: string | null;
  squadre: SquadraSalvata[];
  formazioni: FormazioneSalvata[];
  scambi: ScambioSalvato[];
};

export const VERSIONE_STATO = 2;

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
  elenca(): Promise<{ id: string; nome: string }[]>;
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
    async elenca() {
      return [...leghe.values()]
        .map((s) => ({ id: s.id, nome: s.nome }))
        .sort((a, b) => a.nome.localeCompare(b.nome));
    },
  };
}

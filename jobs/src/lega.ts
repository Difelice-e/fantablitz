/**
 * Dallo stato salvato alla lega giocabile, e ritorno.
 *
 * E' il pezzo che tiene insieme l'archivio (`archivio.ts`), il mondo simulato
 * (`/engine`) e le regole di lega (`/fanta`). Sta qui e non in `/web` perche'
 * non ha niente a che vedere con le schermate: il sito lo usa per disegnare,
 * il job serale per far girare le giornate, e sono la stessa cosa.
 *
 * ## Perche' si ricalcola tutto invece di leggerlo
 *
 * `vistaStagione` rigioca ogni volta tutte le giornate fin qui. Sembra uno
 * spreco ed e' invece la stessa scelta della regola 6 vista da vicino: il
 * risultato di una giornata e' una funzione pura del seme e delle formazioni
 * salvate, quindi non esiste una classifica "da aggiornare" che possa andare
 * fuori sincrono con i risultati. Costa qualche decimo di secondo per una
 * stagione intera, e il sito la tiene in memoria fra una richiesta e l'altra.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { caricaMondo, indicizza, type MondoIndicizzato } from '../../engine/src/mondo.ts';
import {
  validaParametriMotore, validaParametriVoto,
  type ParametriMotore, type ParametriVoto,
} from '../../engine/src/configurazione.ts';
import { regoleClassic, type ConfigurazioneClassic } from '../../fanta/src/classic.ts';
import { regoleMantra, type ConfigurazioneMantra } from '../../fanta/src/mantra.ts';
import { validaConfigurazioneLega, type ConfigurazioneLega } from '../../fanta/src/fantavoto.ts';
import { miglioreDisposizione } from '../../fanta/src/schieramento.ts';
import type { RegoleSchieramento } from '../../fanta/src/regole.ts';
import type { Formazione, Modalita, Schierabile } from '../../fanta/src/tipi.ts';
import { eseguiCiclo, type EsitoCiclo, type Lega, type SquadraFanta } from './ciclo.ts';
import type { FormazioneSalvata, StatoLega, SquadraSalvata } from './archivio.ts';
import { VERSIONE_STATO } from './archivio.ts';
import type { RiferimentiEsterni, SquadraImportata } from './importa.ts';
import { validaConfigurazioneScambi, type ConfigurazioneScambi } from './valutazione.ts';

/* ------------------------------------------------------------------ */
/* Il contesto: tutto quello che non cambia da una lega all'altra       */
/* ------------------------------------------------------------------ */

export type ContestoMondo = {
  mondo: MondoIndicizzato;
  riferimenti: RiferimentiEsterni;
  motore: ParametriMotore;
  voto: ParametriVoto;
  /** Bonus, malus, modificatori e soglie gol. */
  punteggio: ConfigurazioneLega;
  regole: Record<Modalita, RegoleSchieramento>;
  /** Valutazione bot e regole anti-exploit degli scambi (SPEC 6.5 e 7.1). */
  scambi: ConfigurazioneScambi;
};

const json = async (percorso: string): Promise<unknown> =>
  JSON.parse(await readFile(percorso, 'utf8'));

/**
 * Legge il seed e i quattro file di configurazione.
 *
 * Tutto quello che sta qui e' uguale per ogni lega e non cambia mai durante
 * l'esecuzione: si carica una volta sola e si tiene.
 */
export async function caricaContesto(radice: string): Promise<ContestoMondo> {
  const [mondo, riferimenti, motore, voto, punteggio, classic, mantra, scambi] = await Promise.all([
    json(join(radice, 'seed', 'out', 'mondo.json')),
    json(join(radice, 'seed', 'out', 'riferimenti-esterni.json')),
    json(join(radice, 'engine', 'config', 'motore.json')),
    json(join(radice, 'engine', 'config', 'voto.json')),
    json(join(radice, 'fanta', 'config', 'lega.json')),
    json(join(radice, 'fanta', 'config', 'classic.json')),
    json(join(radice, 'fanta', 'config', 'mantra.json')),
    json(join(radice, 'fanta', 'config', 'scambi.json')),
  ]);

  return {
    mondo: indicizza(caricaMondo(mondo)),
    riferimenti: riferimenti as RiferimentiEsterni,
    motore: validaParametriMotore(motore as ParametriMotore),
    voto: validaParametriVoto(voto as ParametriVoto),
    punteggio: validaConfigurazioneLega(punteggio as ConfigurazioneLega),
    regole: {
      classic: regoleClassic(classic as ConfigurazioneClassic),
      mantra: regoleMantra(mantra as ConfigurazioneMantra),
    },
    scambi: validaConfigurazioneScambi(scambi as ConfigurazioneScambi),
  };
}

/* ------------------------------------------------------------------ */
/* Formazioni: fra la mappa del dominio e le coppie del JSON           */
/* ------------------------------------------------------------------ */

export function formazioneDaSalvata(f: FormazioneSalvata): Formazione {
  return { modulo: f.modulo, titolari: new Map(f.titolari), panchina: [...f.panchina] };
}

export function salvataDaFormazione(
  squadraId: string,
  giornata: number,
  f: Formazione,
): FormazioneSalvata {
  return {
    squadraId,
    giornata,
    modulo: f.modulo,
    titolari: [...f.titolari.entries()],
    panchina: [...f.panchina],
  };
}

/**
 * La formazione con cui una squadra si presenta a una giornata.
 *
 * Se per quella giornata non ne ha salvata una si prende **l'ultima salvata
 * prima**, che e' quello che si aspetta chiunque: chi non tocca niente scende
 * in campo come l'ultima volta, non con una formazione a caso.
 */
export function formazionePerGiornata(
  stato: StatoLega,
  squadraId: string,
  giornata: number,
): Formazione | null {
  let migliore: FormazioneSalvata | null = null;
  for (const f of stato.formazioni) {
    if (f.squadraId !== squadraId || f.giornata > giornata) continue;
    if (migliore === null || f.giornata > migliore.giornata) migliore = f;
  }
  return migliore === null ? null : formazioneDaSalvata(migliore);
}

/* ------------------------------------------------------------------ */
/* Dallo stato alla lega                                               */
/* ------------------------------------------------------------------ */

/** La rosa di una squadra, nella forma ristretta che il livello fanta accetta. */
export function rosaDi(squadra: SquadraSalvata, c: ContestoMondo): Schierabile[] {
  const rosa: Schierabile[] = [];
  for (const g of squadra.giocatori) {
    const nel = c.mondo.giocatorePerId.get(g.giocatoreId);
    if (nel) rosa.push(nel);
  }
  return rosa;
}

export function legaDaStato(stato: StatoLega, c: ContestoMondo): Lega {
  const regole = c.regole[stato.modalita];

  const squadre: SquadraFanta[] = stato.squadre.map((s) => {
    const rosa = rosaDi(s, c);
    // Formazione di partenza per chi non ne ha mai salvata una: la migliore che
    // la rosa esprime. Meglio di una a caso, e meglio di un errore.
    const salvata = formazionePerGiornata(stato, s.id, stato.giornateGiocate + 1);
    const formazione = salvata ?? formazioneAutomatica(rosa, regole);
    return { id: s.id, nome: s.nome, rosa, formazione };
  });

  return { squadre, regole, configurazione: c.punteggio };
}

/** La migliore formazione che una rosa esprime, per chi non ne ha scelta una. */
export function formazioneAutomatica(
  rosa: readonly Schierabile[],
  regole: RegoleSchieramento,
): Formazione {
  const scelta = miglioreDisposizione(rosa, regole);
  if (!scelta) {
    // Una rosa che non copre nemmeno un modulo non dovrebbe passare l'import.
    return { modulo: regole.moduli[0]!.nome, titolari: new Map(), panchina: rosa.map((g) => g.id) };
  }
  const titolari = new Set(scelta.titolari.values());
  return {
    modulo: scelta.modulo.nome,
    titolari: scelta.titolari,
    panchina: rosa.filter((g) => !titolari.has(g.id)).map((g) => g.id),
  };
}

/* ------------------------------------------------------------------ */
/* La stagione come si vede oggi                                       */
/* ------------------------------------------------------------------ */

/**
 * Rigioca le giornate fin qui e restituisce classifica, risultati e mondo.
 *
 * Si ferma a `giornateGiocate`: le giornate successive esistono nel calendario
 * ma non sono ancora state giocate, e mostrarle in anticipo significherebbe far
 * vedere a tutti i voti prima che le formazioni siano chiuse.
 */
export function vistaStagione(stato: StatoLega, c: ContestoMondo): EsitoCiclo {
  const lega = legaDaStato(stato, c);
  return eseguiCiclo(c.mondo, c.motore, c.voto, lega, {
    seme: stato.seme,
    da: 1,
    quante: Math.max(0, stato.giornateGiocate),
    formazioneDi: (squadraId, giornata) => formazionePerGiornata(stato, squadraId, giornata),
  });
}

/* ------------------------------------------------------------------ */
/* Creazione di una lega da un import                                  */
/* ------------------------------------------------------------------ */

export function statoDaImport(
  dati: {
    id: string;
    nome: string;
    seme: string;
    modalita: Modalita;
    budget: number;
    /** Chi crea la lega ne e' l'amministratore (regola: vedi SPEC.md §9). */
    amministratore: string | null;
  },
  squadre: readonly SquadraImportata[],
): StatoLega {
  return {
    versione: VERSIONE_STATO,
    id: dati.id,
    nome: dati.nome,
    seme: dati.seme,
    modalita: dati.modalita,
    budget: dati.budget,
    giornateGiocate: 0,
    amministratore: dati.amministratore,
    squadre: squadre.map((s) => ({
      // Il nome della squadra e' anche il suo identificativo: viene dall'export
      // di Fantalab, e li' e' gia' unico.
      id: s.nome,
      nome: s.nome,
      proprietario: null,
      giocatori: s.giocatori.map((g) => ({ giocatoreId: g.giocatoreId, prezzo: g.prezzo })),
    })),
    formazioni: [],
    scambi: [],
    cronache: [],
    editoriali: [],
  };
}

/**
 * Il ciclo di gioco: il job serale (SPEC 9, roadmap 4).
 *
 * Mette in fila le tre cose che succedono ogni sera:
 *
 *   1. il mondo simulato gioca una o piu' giornate       (`/engine`)
 *   2. ogni squadra fanta schiera, adatta e prende voti  (`/fanta`)
 *   3. gli scontri diretti si risolvono e la classifica si aggiorna
 *
 * **Il ciclo e' idempotente.** Eseguirlo due volte sulla stessa giornata non
 * deve duplicare niente. Qui l'idempotenza non e' ottenuta con una guardia che
 * controlla se la giornata e' gia' stata fatta — quella verrebbe aggirata al
 * primo bug — ma per costruzione: il risultato di una giornata e' una funzione
 * pura dello stato iniziale e del numero di giornata, quindi rigiocarla produce
 * esattamente lo stesso esito. Scriverlo due volte sovrascrive con gli stessi
 * valori.
 *
 * E' anche il motivo per cui il motore semina il generatore su
 * (lega, stagione, giornata, partita) invece di far scorrere uno stato casuale.
 */

import type { Giocatore, MondoIndicizzato } from '../../engine/src/mondo.ts';
import type { ParametriMotore, ParametriVoto } from '../../engine/src/configurazione.ts';
import type { PrestazioneGiocatore } from '../../engine/src/stagione.ts';
import { simulaStagione, type StagioneSimulata } from '../../engine/src/stagione.ts';
import type { RegoleSchieramento } from '../../fanta/src/regole.ts';
import type { Formazione, Schierabile } from '../../fanta/src/tipi.ts';
import { strategiaBasic, type StrategiaSostituzione } from '../../fanta/src/sostituzione.ts';
import {
  EVENTI_VUOTI, punteggioSquadra,
  type ConfigurazioneLega, type EventiFanta, type PrestazioneFanta, type PunteggioSquadra,
} from '../../fanta/src/fantavoto.ts';
import { generaCalendarioFanta, type CalendarioFanta } from '../../fanta/src/calendarioFanta.ts';
import { calcolaClassifica, risolviGiornata, type RigaClassificaFanta, type RisultatoScontro } from '../../fanta/src/classifica.ts';

/* ------------------------------------------------------------------ */

export type SquadraFanta = {
  id: string;
  nome: string;
  /** I giocatori in rosa, con i ruoli: e' quanto serve per schierare. */
  rosa: Schierabile[];
  /** L'ultima formazione salvata. E' persistente: resta finche' non si cambia. */
  formazione: Formazione;
};

export type Lega = {
  squadre: SquadraFanta[];
  regole: RegoleSchieramento;
  configurazione: ConfigurazioneLega;
  strategia?: StrategiaSostituzione;
};

export type GiornataFanta = {
  numero: number;
  scontri: RisultatoScontro[];
  /** Cosa ha fatto ogni squadra: formazione finale, cambi, punteggio. */
  squadre: EsitoSquadra[];
};

export type EsitoSquadra = {
  squadraId: string;
  formazione: Formazione;
  /** Chi e' entrato al posto di chi, e perche'. */
  cambi: { esce: string; entra: string; motivo: 'senzaVoto' | 'indisponibile' }[];
  adattati: string[];
  slotScoperti: string[];
  punteggio: PunteggioSquadra;
};

export type EsitoCiclo = {
  calendario: CalendarioFanta;
  giornate: GiornataFanta[];
  classifica: RigaClassificaFanta[];
  /** La stagione del mondo simulato su cui si e' giocato. */
  mondo: StagioneSimulata;
};

/* ------------------------------------------------------------------ */

/** Gli eventi fanta di un giocatore, dalla sua prestazione nel mondo. */
export function eventiDaPrestazione(p: PrestazioneGiocatore): EventiFanta {
  return {
    ...EVENTI_VUOTI,
    // Traduzione uno a uno: e' l'unico punto in cui il mondo simulato passa
    // il confine della regola 7. Il motore conta i fatti, la lega decide
    // quanto valgono, e qui non si decide niente.
    gol: p.gol,
    rigoriSegnati: p.rigoriSegnati,
    rigoriSbagliati: p.rigoriSbagliati,
    autogol: p.autogol,
    assist: p.assist,
    ammonizioni: p.ammonito ? 1 : 0,
    espulso: p.espulso,
    rigoriParati: p.statistiche.rigoriParati ?? 0,
    golSubiti: p.statistiche.golSubiti ?? 0,
  };
}

/* ------------------------------------------------------------------ */

/**
 * Una giornata di lega.
 *
 * Il passaggio meno ovvio e' la sostituzione. Nel fantacalcio non si sostituisce
 * solo chi e' infortunato o squalificato: si sostituisce anche chi **non ha
 * preso voto**, perche' non ha giocato abbastanza. I due casi si trattano allo
 * stesso modo e con lo stesso algoritmo della milestone 2, passando come
 * indisponibili tutti quelli che non portano un voto.
 */
export function giocaGiornata(
  numero: number,
  lega: Lega,
  prestazioniDelMondo: ReadonlyMap<string, PrestazioneGiocatore>,
  scontri: CalendarioFanta['giornate'][number],
): GiornataFanta {
  const strategia = lega.strategia ?? strategiaBasic;
  const esiti: EsitoSquadra[] = [];
  const fantapunti = new Map<string, number>();

  for (const squadra of lega.squadre) {
    // Chi non compare fra le prestazioni non ha proprio giocato; chi compare
    // con voto nullo e' sceso in campo troppo poco. In entrambi i casi non
    // porta punteggio, ed e' esattamente la condizione che fa scattare la
    // sostituzione.
    const senzaVoto = new Set(
      squadra.rosa
        .filter((g) => (prestazioniDelMondo.get(g.id)?.voto ?? null) === null)
        .map((g) => g.id),
    );

    const adattamento = strategia.adatta({
      formazione: squadra.formazione,
      rosa: squadra.rosa,
      indisponibili: senzaVoto,
      regole: lega.regole,
    });

    const perId = new Map(squadra.rosa.map((g) => [g.id, g]));
    const adattati = new Set(adattamento.adattati);

    const prestazioni: PrestazioneFanta[] = [];
    for (const id of adattamento.formazione.titolari.values()) {
      const giocatore = perId.get(id);
      if (!giocatore) continue;
      const nelMondo = prestazioniDelMondo.get(id);
      prestazioni.push({
        giocatore,
        voto: nelMondo?.voto ?? null,
        eventi: nelMondo ? eventiDaPrestazione(nelMondo) : EVENTI_VUOTI,
        adattato: adattati.has(id),
      });
    }

    const punteggio = punteggioSquadra(prestazioni, lega.configurazione);
    fantapunti.set(squadra.id, punteggio.fantapunti);

    esiti.push({
      squadraId: squadra.id,
      formazione: adattamento.formazione,
      cambi: adattamento.cambi.map((c) => ({
        esce: c.esce,
        entra: c.entra,
        motivo: senzaVoto.has(c.esce) ? 'senzaVoto' : 'indisponibile',
      })),
      adattati: adattamento.adattati,
      slotScoperti: adattamento.slotScoperti,
      punteggio,
    });
  }

  return {
    numero,
    scontri: risolviGiornata(scontri, fantapunti, lega.configurazione),
    squadre: esiti,
  };
}

/* ------------------------------------------------------------------ */

export type OpzioniCiclo = {
  /** Seme della lega: decide il mondo simulato e il calendario. */
  seme: string;
  /** Da quale giornata partire, inclusa. Default 1. */
  da?: number;
  /** Quante giornate giocare. Default: tutte quelle che restano. */
  quante?: number;
  /**
   * La formazione che una squadra aveva salvato per una certa giornata.
   *
   * Serve al sito, dove ognuno cambia modulo quando vuole: la giornata 12 va
   * giocata con quello che era salvato alla giornata 12, non con l’ultimo
   * scelto. Restituendo `null` si ricade sulla formazione persistente della
   * squadra, che e’ il caso della riga di comando.
   *
   * E’ anche quello che tiene in piedi l’idempotenza ora che le formazioni
   * cambiano nel tempo: l’esito della giornata N resta funzione del solo
   * stato salvato per la giornata N.
   */
  formazioneDi?: (squadraId: string, giornata: number) => Formazione | null;
};

/**
 * Esegue il ciclo su una o piu' giornate.
 *
 * Restituisce l'esito e non scrive niente: chi chiama decide cosa salvare. La
 * classifica e' calcolata **da capo** sui risultati, mai per accumulo
 * incrementale, e non e' un dettaglio: una classifica accumulata si sporca al
 * primo doppio salvataggio, mentre una ricalcolata e' sempre la somma esatta
 * di quello che e' successo.
 */
export function eseguiCiclo(
  mondo: MondoIndicizzato,
  motore: ParametriMotore,
  voto: ParametriVoto,
  lega: Lega,
  opzioni: OpzioniCiclo,
): EsitoCiclo {
  const stagione = simulaStagione(mondo, motore, voto, { seme: opzioni.seme });

  const calendario = generaCalendarioFanta({
    squadre: lega.squadre.map((s) => s.id),
    giornate: stagione.calendario.giornate.length,
  });

  const da = opzioni.da ?? 1;
  const fino = Math.min(
    calendario.giornate.length,
    da + (opzioni.quante ?? calendario.giornate.length) - 1,
  );

  const giornate: GiornataFanta[] = [];
  for (let n = da; n <= fino; n++) {
    // Le giornate della lega sono allineate a quelle del mondo simulato: la
    // giornata 12 della lega si gioca sui voti della giornata 12 del campionato.
    const prestazioni = new Map<string, PrestazioneGiocatore>();
    for (const partita of stagione.partite) {
      if (partita.giornata !== n) continue;
      for (const p of partita.prestazioni) prestazioni.set(p.giocatoreId, p);
    }

    const diQuestaGiornata: Lega = opzioni.formazioneDi
      ? {
          ...lega,
          squadre: lega.squadre.map((s) => {
            const salvata = opzioni.formazioneDi!(s.id, n);
            if (!salvata) return s;
            // La rosa usata per l'adattamento deve essere quella di allora, non
            // quella attuale: uno scambio fatto dopo questa giornata non puo'
            // cambiare chi era disponibile in panchina per sostituire. Si
            // ricostruisce dai soli id della formazione salvata, cercandoli nel
            // mondo (dati puri, indipendenti da chi possiede oggi il giocatore).
            const idRosaStorica = [...salvata.titolari.values(), ...salvata.panchina];
            const rosaStorica = idRosaStorica
              .map((id) => mondo.giocatorePerId.get(id))
              .filter((g): g is Giocatore => g !== undefined);
            return { ...s, formazione: salvata, rosa: rosaStorica.length > 0 ? rosaStorica : s.rosa };
          }),
        }
      : lega;

    giornate.push(giocaGiornata(n, diQuestaGiornata, prestazioni, calendario.giornate[n - 1]!));
  }

  return {
    calendario,
    giornate,
    classifica: calcolaClassifica(
      lega.squadre.map((s) => s.id),
      giornate.flatMap((g) => g.scontri),
    ),
    mondo: stagione,
  };
}

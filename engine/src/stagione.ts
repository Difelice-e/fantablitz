/**
 * Simulazione di una stagione intera.
 *
 * Mette in fila calendario, schieramenti, partite, voti e stati. Non tocca
 * nulla che appartenga alla lega fanta: produce il mondo simulato e basta.
 *
 * Ogni partita riceve un generatore seminato su (seme, stagione, giornata,
 * indice della partita). Non c'e' uno stato casuale condiviso che scorre da una
 * partita all'altra: rigiocare la giornata 12 da' lo stesso risultato
 * indipendentemente da cosa e' successo prima, che e' la premessa perche' il
 * job serale possa essere idempotente (regola 6).
 */

import type { MondoIndicizzato } from './mondo.ts';
import type { ParametriMotore, ParametriVoto } from './configurazione.ts';
import { generatore, seme } from './casuale.ts';
import { generaCalendario, type Calendario, type Giornata } from './calendario.ts';
import { schiera } from './allenatore.ts';
import { simulaPartita, type Evento, type MotorePartita, type Statistiche } from './partita.ts';
import { avanzaGiornata, registraRisultato, statiIniziali, type Stati } from './stati.ts';
import { calcolaVoto, type Esito } from './voto.ts';

export type RigaClassifica = {
  clubId: string;
  punti: number;
  giocate: number;
  vinte: number;
  pareggiate: number;
  perse: number;
  golFatti: number;
  golSubiti: number;
};

export type PrestazioneGiocatore = {
  giocatoreId: string;
  clubId: string;
  minuti: number;
  voto: number | null;
  gol: number;
  assist: number;
  ammonito: boolean;
  espulso: boolean;
  statistiche: Statistiche;
};

export type PartitaGiocata = {
  giornata: number;
  casaId: string;
  ospiteId: string;
  golCasa: number;
  golOspite: number;
  eventi: Evento[];
  prestazioni: PrestazioneGiocatore[];
};

export type StagioneSimulata = {
  calendario: Calendario;
  partite: PartitaGiocata[];
  classifica: RigaClassifica[];
  stati: Stati;
};

export type OpzioniStagione = {
  seme: string;
  motore?: MotorePartita;
  calendario?: Calendario;
  giornateInfrasettimanali?: number;
  turniDiCoppa?: number;
};

function classificaVuota(mondo: MondoIndicizzato): Map<string, RigaClassifica> {
  return new Map(
    mondo.club.map((c) => [
      c.id,
      {
        clubId: c.id,
        punti: 0, giocate: 0, vinte: 0, pareggiate: 0, perse: 0,
        golFatti: 0, golSubiti: 0,
      },
    ]),
  );
}

function esitoDi(propri: number, altrui: number): Esito {
  if (propri > altrui) return 'vittoria';
  return propri === altrui ? 'pareggio' : 'sconfitta';
}

export function simulaStagione(
  mondo: MondoIndicizzato,
  motoreParametri: ParametriMotore,
  votoParametri: ParametriVoto,
  opzioni: OpzioniStagione,
): StagioneSimulata {
  const motore = opzioni.motore ?? simulaPartita;
  const calendario =
    opzioni.calendario ??
    generaCalendario(mondo, {
      seme: opzioni.seme,
      giornateInfrasettimanali: opzioni.giornateInfrasettimanali,
      turniDiCoppa: opzioni.turniDiCoppa,
    });

  const stati = statiIniziali(mondo, motoreParametri, generatore(seme(opzioni.seme, 'stati')));
  const classifica = classificaVuota(mondo);
  const partite: PartitaGiocata[] = [];

  for (const giornata of calendario.giornate) {
    const minutiDiGiornata = new Map<string, number>();

    giornata.partite.forEach((incontro, indice) => {
      const rng = generatore(
        seme(opzioni.seme, mondo.stagione, 'giornata', giornata.numero, 'partita', indice),
      );

      const casa = schiera(incontro.casaId, mondo, stati, motoreParametri, rng);
      const ospite = schiera(incontro.ospiteId, mondo, stati, motoreParametri, rng);
      const esito = motore({ casa, ospite, parametri: motoreParametri, rng });

      /* --- classifica ---------------------------------------------- */

      const golCasa = esito.casa.gol;
      const golOspite = esito.ospite.gol;
      for (const [propri, altrui, clubId] of [
        [golCasa, golOspite, incontro.casaId],
        [golOspite, golCasa, incontro.ospiteId],
      ] as const) {
        const riga = classifica.get(clubId)!;
        riga.giocate++;
        riga.golFatti += propri;
        riga.golSubiti += altrui;
        if (propri > altrui) { riga.vinte++; riga.punti += 3; }
        else if (propri === altrui) { riga.pareggiate++; riga.punti += 1; }
        else riga.perse++;
        registraRisultato(stati.club.get(clubId)!, propri, altrui, motoreParametri);
      }

      /* --- prestazioni e voti --------------------------------------- */

      const prestazioni: PrestazioneGiocatore[] = [];

      for (const [lato, propri, altrui] of [
        [esito.casa, golCasa, golOspite],
        [esito.ospite, golOspite, golCasa],
      ] as const) {
        const schieramento = lato === esito.casa ? casa : ospite;
        const tuttiConvocati = [...schieramento.titolari, ...schieramento.panchina];

        for (const [id, statistiche] of lato.statistiche) {
          const giocatore = tuttiConvocati.find((g) => g.id === id);
          if (!giocatore) continue;

          const gol = esito.eventi.filter(
            (e) => e.giocatoreId === id && (e.tipo === 'gol' || e.tipo === 'rigoreSegnato'),
          ).length;
          const assist = esito.eventi.filter((e) => e.giocatoreId === id && e.tipo === 'assist').length;

          const voto = calcolaVoto(
            {
              giocatore,
              statistiche,
              esito: esitoDi(propri, altrui),
              gol,
              assist,
              autogol: 0,
              rigoriSegnati: 0,
              rigoriSbagliati: 0,
              rigoriParati: statistiche.rigoriParati ?? 0,
              ammonito: lato.ammoniti.has(id),
              espulso: lato.espulsi.has(id),
            },
            votoParametri,
          );

          prestazioni.push({
            giocatoreId: id,
            clubId: lato.clubId,
            minuti: statistiche.minuti,
            voto,
            gol,
            assist,
            ammonito: lato.ammoniti.has(id),
            espulso: lato.espulsi.has(id),
            statistiche,
          });

          minutiDiGiornata.set(id, (minutiDiGiornata.get(id) ?? 0) + statistiche.minuti);
        }

        /* --- disciplina che si riflette sulle prossime giornate ------ */

        const d = motoreParametri.disciplina;
        for (const id of lato.ammoniti) {
          const stato = stati.giocatori.get(id)!;
          stato.ammonizioni++;
          if (stato.ammonizioni >= d.ammonizioniPerSqualifica) {
            stato.ammonizioni = 0;
            stato.squalifica = Math.max(stato.squalifica, 1);
          }
        }
        for (const id of lato.espulsi) {
          const stato = stati.giocatori.get(id)!;
          stato.squalifica = Math.max(
            stato.squalifica,
            rng.intero(d.giornateSqualificaEspulsione.minima, d.giornateSqualificaEspulsione.massima),
          );
        }
        for (const [id, durata] of lato.infortuni) {
          const stato = stati.giocatori.get(id)!;
          stato.infortunio = Math.max(stato.infortunio, durata);
        }
      }

      partite.push({
        giornata: giornata.numero,
        casaId: incontro.casaId,
        ospiteId: incontro.ospiteId,
        golCasa,
        golOspite,
        eventi: esito.eventi,
        prestazioni,
      });
    });

    avanzaGiornata(
      mondo,
      stati,
      minutiDiGiornata,
      { infrasettimanale: giornata.infrasettimanale, turnoDiCoppa: giornata.turnoDiCoppa },
      motoreParametri,
      generatore(seme(opzioni.seme, 'avanzamento', giornata.numero)),
    );
  }

  const ordinata = [...classifica.values()].sort(
    (a, b) =>
      b.punti - a.punti ||
      b.golFatti - b.golSubiti - (a.golFatti - a.golSubiti) ||
      b.golFatti - a.golFatti ||
      a.clubId.localeCompare(b.clubId),
  );

  return { calendario, partite, classifica: ordinata, stati };
}

/** Comodita' per i test e per la calibrazione: solo la giornata indicata. */
export function giornataDi(calendario: Calendario, numero: number): Giornata {
  const g = calendario.giornate.find((x) => x.numero === numero);
  if (!g) throw new Error(`Giornata ${numero} inesistente`);
  return g;
}

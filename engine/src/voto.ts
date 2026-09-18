/**
 * Voto statistico (SPEC 5.6).
 *
 *   voto_grezzo = 6.0 + C_prestazione + C_decisiva + C_risultato
 *   voto        = arrotonda_a_0.5( clamp(voto_grezzo, 3.0, 10.0) )
 *
 * Il voto appartiene al **mondo simulato**: e' lo stesso per tutte le leghe che
 * girano su quel mondo. I bonus e i malus sono un'altra cosa e vivono altrove
 * (regola 7). Le azioni decisive entrano qui solo in forma attenuata, per non
 * pagarle due volte: il gol vale 3 punti al fantavoto, qui vale mezzo punto.
 *
 * La standardizzazione usa media e deviazione **fisse**, prese dalla
 * configurazione e non ricalcolate a ogni giornata. E' una scelta esplicita
 * della specifica: il voto deve misurare una prestazione in assoluto, non
 * rispetto agli altri di quel turno. Altrimenti in una giornata storta il
 * migliore dei mediocri prenderebbe 7.
 */

import type { Giocatore } from './mondo.ts';
import type { NomeStatistica, ParametriVoto } from './configurazione.ts';
import type { Statistiche } from './partita.ts';
import { gruppoDi, type GruppoRuolo } from './ruoli.ts';

export type Esito = 'vittoria' | 'pareggio' | 'sconfitta';

export type ContestoVoto = {
  giocatore: Giocatore;
  statistiche: Statistiche;
  esito: Esito;
  gol: number;
  assist: number;
  autogol: number;
  rigoriSegnati: number;
  rigoriSbagliati: number;
  rigoriParati: number;
  ammonito: boolean;
  espulso: boolean;
};

const limita = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

/** Arrotonda a mezzo punto, come le pagelle. */
export function arrotondaAMezzoPunto(v: number): number {
  return Math.round(v * 2) / 2;
}

/* ------------------------------------------------------------------ */

/**
 * Indice di ruolo grezzo: somma pesata delle statistiche del gruppo.
 *
 * I gol subiti fanno eccezione e vengono attenuati dai tiri affrontati:
 * prenderne tre su dodici tiri non e' come prenderne tre su quattro, e senza
 * questa correzione il portiere di una squadra piccola non prenderebbe mai piu'
 * di 5.
 */
export function indiceDiRuolo(
  gruppo: GruppoRuolo,
  statistiche: Statistiche,
  p: ParametriVoto,
): number {
  const pesi = p.pesi[gruppo];
  let indice = 0;

  for (const [nome, peso] of Object.entries(pesi) as [NomeStatistica, number][]) {
    let valore = statistiche[nome] ?? 0;

    if (nome === 'golSubiti' && valore > 0) {
      const a = p.attenuazioneGolSubiti;
      const carico = Math.max(1, statistiche.tiriAffrontati) / a.tiriDiRiferimento;
      valore = valore / carico ** a.esponente;
    }

    indice += peso * valore;
  }
  return indice;
}

/* ------------------------------------------------------------------ */

function contributoDecisivo(contesto: ContestoVoto, gruppo: GruppoRuolo, p: ParametriVoto): number {
  const d = p.decisiva;

  const perGol: Record<GruppoRuolo, number> = {
    por: d.golPortiere,
    centrale: d.golCentrale,
    laterale: d.golLaterale,
    mediano: d.golMediano,
    offensivo: d.golOffensivo,
    punta: d.golPunta,
  };

  return (
    (contesto.gol + contesto.rigoriSegnati) * perGol[gruppo] +
    contesto.assist * d.assist +
    contesto.rigoriParati * d.rigoreParato +
    contesto.rigoriSbagliati * d.rigoreSbagliato +
    contesto.autogol * d.autogol +
    (contesto.statistiche.erroriDaGol ?? 0) * d.erroreDaGol +
    (contesto.statistiche.rigoriConcessi ?? 0) * d.rigoreConcesso +
    (contesto.espulso ? d.espulsione : 0) +
    (contesto.ammonito ? d.ammonizione : 0)
  );
}

/**
 * Il voto, oppure `null` per il senza voto.
 *
 * Sotto la soglia minima di minuti non si giudica. Fra la soglia minima e
 * quella del giudizio pieno, `C_prestazione` viene attenuato in proporzione: su
 * pochi palloni non si puo' dire granche', ma un gol resta un gol e quindi
 * `C_decisiva` non viene toccato.
 */
export function calcolaVoto(contesto: ContestoVoto, p: ParametriVoto): number | null {
  const gruppo = gruppoDi(contesto.giocatore);
  const minuti = contesto.statistiche.minuti;

  const sogliaMinima = gruppo === 'por' ? p.minuti.sogliaPortiere : p.minuti.sogliaSenzaVoto;
  if (minuti < sogliaMinima) return null;

  const standard = p.standardizzazione[gruppo];
  const indice = indiceDiRuolo(gruppo, contesto.statistiche, p);
  // L'indice cresce coi minuti: si riporta a novanta prima di standardizzare,
  // altrimenti chi entra al 70' avrebbe sempre una prestazione "scarsa".
  const indicePieno = minuti > 0 ? (indice * 90) / minuti : 0;
  const z = (indicePieno - standard.media) / standard.deviazione;

  let prestazione = limita(
    p.prestazione.coefficiente * z,
    -p.prestazione.limite,
    p.prestazione.limite,
  );

  if (minuti < p.minuti.sogliaGiudizioPieno) {
    const quota =
      (minuti - p.minuti.sogliaSenzaVoto) /
      Math.max(1, p.minuti.sogliaGiudizioPieno - p.minuti.sogliaSenzaVoto);
    prestazione *= limita(quota, 0, 1);
  }

  const risultato =
    contesto.esito === 'vittoria'
      ? p.risultato.vittoria
      : contesto.esito === 'pareggio'
        ? p.risultato.pareggio
        : p.risultato.sconfitta;

  const grezzo = p.base + prestazione + contributoDecisivo(contesto, gruppo, p) + risultato;
  return arrotondaAMezzoPunto(limita(grezzo, p.minimo, p.massimo));
}

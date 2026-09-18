/**
 * Derivazione dei rating dal listone.
 *
 * Il listone non contiene rating: contiene prezzi. La catena e' questa.
 *
 *   FVM M + Qt.A M  ->  segnale (logaritmico)
 *   segnale         ->  qualita' 0-1, normalizzata dentro il ruolo classico
 *   qualita'        ->  overall 30-99, nella fascia prevista per il ruolo
 *   overall + RM    ->  quattro rating di area e quattro propensioni
 *
 * Due scelte meritano una spiegazione.
 *
 * 1. Si passa ai logaritmi perche' FVM M e' violentemente storto: mediana 14,
 *    massimo 450. In scala lineare il novanta per cento del listone si
 *    schiaccerebbe nel primo decimo della scala.
 *
 * 2. La normalizzazione avviene dentro il ruolo classico, non sull'intero
 *    listone. Meta' dei portieri ha FVM M = 1, perche' il mercato non paga le
 *    riserve: normalizzando su tutti, ogni portiere di scorta finirebbe al
 *    livello del peggior giocatore del campionato. Dentro il proprio ruolo,
 *    invece, la scala si riapre e la gerarchia fra portieri torna leggibile.
 *
 * La qualita' mescola due letture dello stesso segnale: la posizione in
 * classifica (rango) e la distanza in valore (magnitudine). Il solo rango
 * appiattirebbe la distanza fra il migliore e il secondo; la sola magnitudine
 * ammasserebbe tutti in fondo. `mixRango` decide la proporzione.
 */

import type { RigaListone } from './listone.ts';
import type { Aree, Parametri, Propensioni } from './configurazione.ts';
import { NOMI_AREE, NOMI_PROPENSIONI } from './configurazione.ts';
import type { RuoloMantra } from './ruoli.ts';
import { generatore, seme, type Generatore } from './casuale.ts';

export type Derivato = {
  qualita: number;
  overall: number;
  aree: Aree;
  propensioni: Propensioni;
  eta: number;
  etaPicco: number;
  potenziale: number;
};

const limita = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));
const arrotonda = (v: number, decimali: number): number => {
  const f = 10 ** decimali;
  // Il +Number.EPSILON evita che 1.005 diventi 1.00 per colpa del binario.
  return Math.round((v + Number.EPSILON) * f) / f;
};

/* ------------------------------------------------------------------ */
/* Qualita'                                                            */
/* ------------------------------------------------------------------ */

/** Combinazione logaritmica dei due segnali di mercato. */
export function segnale(riga: RigaListone, p: Parametri): number {
  const { pesoValoreMercatoMantra, pesoQuotazioneAstaMantra } = p.rating;
  return (
    pesoValoreMercatoMantra * Math.log1p(Math.max(0, riga.valoreMercatoMantra)) +
    pesoQuotazioneAstaMantra * Math.log1p(Math.max(0, riga.quotazioneAstaMantra))
  );
}

/**
 * Percentile di ogni valore dentro il proprio insieme, con rango medio sui
 * pari merito: i trentadue portieri a FVM M = 1 ricevono tutti lo stesso
 * numero, e quindi lo stesso rating. E' voluto: sono intercambiabili davvero.
 */
function percentili(valori: number[]): number[] {
  const n = valori.length;
  if (n === 1) return [0.5];

  const ordine = valori.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const risultato = new Array<number>(n);

  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && ordine[j + 1]!.v === ordine[i]!.v) j++;
    const rangoMedio = (i + j) / 2;
    for (let k = i; k <= j; k++) risultato[ordine[k]!.i] = rangoMedio / (n - 1);
    i = j + 1;
  }
  return risultato;
}

/**
 * Qualita' 0-1 di ogni giocatore, calcolata separatamente dentro ogni ruolo
 * classico. Restituisce una mappa indicizzata sull'identificativo esterno.
 */
export function qualitaPerGiocatore(
  giocatori: readonly RigaListone[],
  p: Parametri,
): Map<number, number> {
  const perRuolo = new Map<string, RigaListone[]>();
  for (const g of giocatori) {
    const gruppo = perRuolo.get(g.ruoloClassico);
    if (gruppo) gruppo.push(g);
    else perRuolo.set(g.ruoloClassico, [g]);
  }

  const qualita = new Map<number, number>();
  for (const gruppo of perRuolo.values()) {
    const segnali = gruppo.map((g) => segnale(g, p));
    const minimo = Math.min(...segnali);
    const massimo = Math.max(...segnali);
    const estensione = massimo - minimo;
    const rango = percentili(segnali);

    gruppo.forEach((g, i) => {
      // Se tutto il ruolo ha lo stesso segnale la magnitudine non dice nulla:
      // si ripiega su meta' scala invece di dividere per zero.
      const magnitudine = estensione > 0 ? (segnali[i]! - minimo) / estensione : 0.5;
      qualita.set(g.idEsterno, p.rating.mixRango * rango[i]! + (1 - p.rating.mixRango) * magnitudine);
    });
  }
  return qualita;
}

/* ------------------------------------------------------------------ */
/* Rating                                                              */
/* ------------------------------------------------------------------ */

export function overallDaQualita(qualita: number, riga: RigaListone, p: Parametri): number {
  const fascia = p.rating.fasciaPerRuoloClassico[riga.ruoloClassico];
  return limita(fascia.base + fascia.ampiezza * qualita, p.rating.minimo, p.rating.massimo);
}

/**
 * Media dei profili dei ruoli dichiarati. Il primo ruolo del listone e' quello
 * principale e pesa di piu': un `W;T` e' un'ala che sa fare il trequartista,
 * non mezzo trequartista.
 */
function profiloMedio<C extends string>(
  ruoli: readonly RuoloMantra[],
  p: Parametri,
  scegli: (r: RuoloMantra) => Record<C, number>,
  campi: readonly C[],
): Record<C, number> {
  const risultato = {} as Record<C, number>;
  let pesoTotale = 0;
  for (const campo of campi) risultato[campo] = 0;

  ruoli.forEach((ruolo, i) => {
    const peso = i === 0 ? p.rating.pesoRuoloPrincipale : p.rating.pesoRuoliSecondari;
    const profilo = scegli(ruolo);
    for (const campo of campi) risultato[campo] += peso * profilo[campo];
    pesoTotale += peso;
  });

  for (const campo of campi) risultato[campo] /= pesoTotale;
  return risultato;
}

/**
 * Distribuisce la qualita' complessiva sulle quattro aree.
 *
 * `area = livelloNeutro + (overall - livelloNeutro) * peso`: il livello neutro
 * e' il giocatore medio di Serie A. Un attaccante fortissimo non diventa un
 * pessimo difensore, resta un difensore nella media. Se invece moltiplicassimo
 * l'overall per il peso, i migliori attaccanti risulterebbero i peggiori
 * difensori del campionato, che non e' quello che vogliamo dire.
 */
export function areeDaOverall(overall: number, ruoli: readonly RuoloMantra[], p: Parametri): Aree {
  const pesi = profiloMedio(ruoli, p, (r) => p.profiliRuolo[r].aree, NOMI_AREE);
  const neutro = p.rating.livelloNeutro;
  const aree = {} as Aree;
  for (const area of NOMI_AREE) {
    aree[area] = arrotonda(
      limita(neutro + (overall - neutro) * pesi[area], p.rating.minimo, p.rating.massimo),
      1,
    );
  }
  return aree;
}

/** Propensioni di ruolo, corrette per qualita' e con un pizzico di rumore. */
export function propensioniDaRuoli(
  qualita: number,
  ruoli: readonly RuoloMantra[],
  p: Parametri,
  rng: Generatore,
): Propensioni {
  const base = profiloMedio(ruoli, p, (r) => p.profiliRuolo[r].propensioni, NOMI_PROPENSIONI);
  const influenza: Record<keyof Propensioni, number> = {
    gol: p.propensioni.influenzaQualitaGol,
    assist: p.propensioni.influenzaQualitaAssist,
    cartellino: p.propensioni.influenzaQualitaCartellino,
    infortunio: p.propensioni.influenzaQualitaInfortunio,
  };

  const propensioni = {} as Propensioni;
  for (const nome of NOMI_PROPENSIONI) {
    const fattore = 1 + influenza[nome] * (qualita - 0.5) * 2;
    const rumore = 1 + p.propensioni.rumore * (rng.reale() * 2 - 1);
    propensioni[nome] = arrotonda(limita(base[nome] * fattore * rumore, 0, 1), 3);
  }
  return propensioni;
}

/* ------------------------------------------------------------------ */
/* Anagrafica                                                          */
/* ------------------------------------------------------------------ */

/**
 * Eta', eta' del picco e potenziale: nel listone non ci sono, quindi si
 * generano. I giocatori migliori vengono attirati verso l'eta' del picco,
 * perche' nella realta' i piu' quotati sono quasi sempre nel pieno della
 * carriera; giovani promesse e comprimari anziani restano sulle code.
 */
export function anagraficaDaQualita(
  qualita: number,
  ruoli: readonly RuoloMantra[],
  p: Parametri,
  rng: Generatore,
): { eta: number; etaPicco: number } {
  const a = p.anagrafica;
  const portiere = ruoli[0] === 'Por';
  const piccoAtteso = portiere ? a.etaPiccoPortieri : a.etaPiccoMedia;

  const centro = a.etaMedia + a.attrazioneVersoIlPicco * (qualita - 0.5) * 2;
  // La forbice si stringe salendo di qualita': ai vertici del listone i
  // trentottenni non esistono, mentre in fondo convivono ragazzi di primavera e
  // mestieranti a fine carriera.
  const deviazione = a.deviazioneEta * (1 - a.riduzioneDeviazionePerQualita * qualita);
  const eta = Math.round(limita(rng.normale(centro, deviazione), a.etaMinima, a.etaMassima));
  const etaPicco = Math.round(
    limita(rng.normale(piccoAtteso, a.deviazioneEtaPicco), a.etaMinima + 3, a.etaMassima),
  );
  return { eta, etaPicco };
}

/**
 * Il potenziale e' l'overall piu' un margine di crescita che si chiude man mano
 * che ci si avvicina al picco. Chi il picco lo ha passato non cresce piu':
 * potenziale uguale a overall.
 */
export function potenzialeDaOverall(
  overall: number,
  eta: number,
  etaPicco: number,
  p: Parametri,
  rng: Generatore,
): number {
  const a = p.anagrafica;
  if (eta >= etaPicco) return arrotonda(overall, 1);

  const quotaResidua = (etaPicco - eta) / Math.max(1, etaPicco - a.etaMinima);
  const margine =
    a.crescitaMassima *
    quotaResidua ** a.curvaCrescita *
    (1 - a.quotaCrescitaCasuale + a.quotaCrescitaCasuale * rng.reale());

  return arrotonda(limita(overall + margine, overall, p.rating.massimo), 1);
}

/* ------------------------------------------------------------------ */

/** Mette in fila tutti i passaggi per un singolo giocatore. */
export function derivaGiocatore(
  riga: RigaListone,
  qualita: number,
  p: Parametri,
  semeGlobale: string,
): Derivato {
  // Un generatore per giocatore, seminato sul suo identificativo: l'eta' di
  // Svilar non cambia perche' e' arrivato un nuovo attaccante nel listone.
  const rng = generatore(seme(semeGlobale, riga.idEsterno));

  // Il rumore ammette che il segnale non ha la precisione del decimo di punto, e
  // soprattutto rompe i pari merito: trentadue portieri di riserva hanno tutti
  // FVM M = 1, e senza questo scarto uscirebbero identici fino all'ultima cifra,
  // lasciando l'allenatore automatico senza alcun criterio per sceglierne uno.
  // Portandolo a zero si torna a un seed rigidamente determinato dal listone.
  const overall = arrotonda(
    limita(
      overallDaQualita(qualita, riga, p) + rng.normale(0, p.rating.rumore),
      p.rating.minimo,
      p.rating.massimo,
    ),
    1,
  );
  const { eta, etaPicco } = anagraficaDaQualita(qualita, riga.ruoliMantra, p, rng);

  return {
    qualita: arrotonda(qualita, 4),
    overall,
    aree: areeDaOverall(overall, riga.ruoliMantra, p),
    propensioni: propensioniDaRuoli(qualita, riga.ruoliMantra, p, rng),
    eta,
    etaPicco,
    potenziale: potenzialeDaOverall(overall, eta, etaPicco, p, rng),
  };
}

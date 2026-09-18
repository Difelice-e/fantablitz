/** Tipi della configurazione del motore. I valori vivono nei JSON di `config/`. */

import type { GruppoRuolo } from './ruoli.ts';
import { GRUPPI_RUOLO } from './ruoli.ts';

/** Nomi delle statistiche generate per partita e usate dall'indice di ruolo. */
export const NOMI_STATISTICHE = [
  'tiri', 'tiriInPorta', 'occasioniCreate', 'passaggiChiave',
  'passaggiTentati', 'passaggiRiusciti', 'crossTentati', 'crossRiusciti',
  'dribblingRiusciti', 'dribblingSubiti', 'duelliVinti', 'duelliAereiVinti',
  'contrasti', 'intercetti', 'respinte', 'palleRecuperate', 'pallePerse',
  'falliCommessi', 'fuorigioco', 'errori', 'erroriDaGol', 'rigoriConcessi',
  'grandiOccasioniFallite', 'spondeRiuscite',
  'parate', 'parateDecisive', 'usciteRiuscite', 'usciteSbagliate',
  'rinviPrecisi', 'tiriAffrontati', 'golSubiti', 'rigoriParati',
] as const;
export type NomeStatistica = (typeof NOMI_STATISTICHE)[number];

/** Le medie per novanta minuti di un gruppo di ruolo. */
export type MedieGruppo = Partial<Record<NomeStatistica, number>> & {
  quotaPassaggiRiusciti?: number;
  quotaCrossRiusciti?: number;
};

export type Modulo = { difensori: number; centrocampisti: number; attaccanti: number };

export type ParametriMotore = {
  versione: number;
  stati: {
    banda: number;
    condizione: {
      iniziale: number;
      costoPer90Minuti: number;
      recuperoPerGiornata: number;
      penalitaInfrasettimanale: number;
      costoImpegnoEuropeo: number;
      quotaRosaImpegnataInEuropa: number;
      minima: number;
      influenzaEta: number;
      etaRiferimento: number;
    };
    forma: { ritornoAllaMedia: number; volatilita: number; massima: number };
    morale: {
      memoria: number;
      perVittoria: number;
      perPareggio: number;
      perSconfitta: number;
      bonusGoleadaSubita: number;
      sogliaGoleada: number;
      quotaIndividuale: number;
    };
  };
  forze: {
    attacco: { pesoPunte: number; pesoCentrocampo: number; pesoDifesa: number };
    difesa: { pesoDifensori: number; pesoPortiere: number; pesoCentrocampo: number };
    golAttesiBase: number;
    rapportoDiEquilibrio: number;
    esponenteForza: number;
    fattoreCampo: number;
    golAttesiMinimi: number;
    golAttesiMassimi: number;
  };
  minuti: {
    sostituzioniMinime: number;
    sostituzioniMassime: number;
    minutoPrimaSostituzione: number;
    minutoUltimaSostituzione: number;
  };
  disciplina: {
    ammonizioneBase: number;
    secondaAmmonizione: number;
    espulsioneDiretta: number;
    infortunioBase: number;
    infortunioPerCondizioneBassa: number;
    durataInfortunio: { minima: number; massima: number; media: number };
    ammonizioniPerSqualifica: number;
    giornateSqualificaEspulsione: { minima: number; massima: number };
    rigoriPerPartita: number;
    quotaRigoriSegnati: number;
    quotaRigoriNonSegnatiParati: number;
  };
  attribuzione: {
    esponenteRating: number;
    quotaGolConAssist: number;
    quotaAutogol: number;
    /** Chi si fa l’autogol e chi concede il rigore, per gruppo di ruolo. */
    pesiAutogol: Record<GruppoRuolo, number>;
    pesiRigoreConcesso: Record<GruppoRuolo, number>;
  };
  statistiche: { influenzaRating: number } & Record<GruppoRuolo, MedieGruppo>;
  allenatore: {
    moduli: Modulo[];
    pesoCondizioneNellaScelta: number;
    sogliaCondizionePerRiposo: number;
    rumoreGerarchia: number;
  };
};

export type ParametriVoto = {
  versione: number;
  base: number;
  minimo: number;
  massimo: number;
  prestazione: { coefficiente: number; limite: number };
  standardizzazione: Record<GruppoRuolo, { media: number; deviazione: number }>;
  pesi: Record<GruppoRuolo, Partial<Record<NomeStatistica, number>>>;
  attenuazioneGolSubiti: { tiriDiRiferimento: number; esponente: number };
  decisiva: {
    golPunta: number;
    golOffensivo: number;
    golMediano: number;
    golLaterale: number;
    golCentrale: number;
    golPortiere: number;
    assist: number;
    rigoreParato: number;
    rigoreSbagliato: number;
    autogol: number;
    erroreDaGol: number;
    rigoreConcesso: number;
    espulsione: number;
    ammonizione: number;
  };
  risultato: { vittoria: number; pareggio: number; sconfitta: number };
  minuti: { sogliaSenzaVoto: number; sogliaGiudizioPieno: number; sogliaPortiere: number };
  obiettiviCalibrazione: {
    mediaVoti: number;
    deviazioneMinima: number;
    deviazioneMassima: number;
    quotaVotiAltiMin: number;
    quotaVotiAltiMax: number;
    sogliaVotoAlto: number;
    quotaVotiBassiMin: number;
    quotaVotiBassiMax: number;
    sogliaVotoBasso: number;
  };
};

/* ------------------------------------------------------------------ */

function esigi(condizione: boolean, messaggio: string): void {
  if (!condizione) throw new Error(`Configurazione del motore non valida: ${messaggio}`);
}

export function validaParametriMotore(p: ParametriMotore): ParametriMotore {
  esigi(p.versione === 2, `versione ${p.versione} non supportata`);
  esigi(p.stati.banda > 0 && p.stati.banda < 1, 'stati.banda deve stare fra 0 e 1');
  esigi(p.forze.golAttesiBase > 0, 'forze.golAttesiBase deve essere positivo');
  esigi(
    p.forze.golAttesiMinimi < p.forze.golAttesiMassimi,
    'forze: il minimo dei gol attesi deve stare sotto il massimo',
  );
  esigi(p.forze.fattoreCampo >= 1, 'forze.fattoreCampo non puo’ essere minore di 1');
  esigi(p.allenatore.moduli.length > 0, 'allenatore: serve almeno un modulo');
  for (const m of p.allenatore.moduli) {
    esigi(
      m.difensori + m.centrocampisti + m.attaccanti === 10,
      `modulo ${m.difensori}-${m.centrocampisti}-${m.attaccanti}: i dieci di movimento non tornano`,
    );
  }
  esigi(
    p.minuti.sostituzioniMinime <= p.minuti.sostituzioniMassime,
    'minuti: sostituzioni minime sopra le massime',
  );
  for (const gruppo of GRUPPI_RUOLO) {
    esigi(p.statistiche[gruppo] != null, `statistiche: manca il gruppo "${gruppo}"`);
    esigi(
      p.attribuzione.pesiAutogol[gruppo] != null,
      `attribuzione.pesiAutogol: manca il gruppo "${gruppo}"`,
    );
    esigi(
      p.attribuzione.pesiRigoreConcesso[gruppo] != null,
      `attribuzione.pesiRigoreConcesso: manca il gruppo "${gruppo}"`,
    );
  }
  for (const [nome, valore] of [
    ['attribuzione.quotaGolConAssist', p.attribuzione.quotaGolConAssist],
    ['attribuzione.quotaAutogol', p.attribuzione.quotaAutogol],
    ['disciplina.quotaRigoriSegnati', p.disciplina.quotaRigoriSegnati],
    ['disciplina.quotaRigoriNonSegnatiParati', p.disciplina.quotaRigoriNonSegnatiParati],
  ] as const) {
    esigi(valore >= 0 && valore <= 1, `${nome} deve stare fra 0 e 1`);
  }
  esigi(p.disciplina.rigoriPerPartita >= 0, 'disciplina.rigoriPerPartita non puo’ essere negativo');
  return p;
}

export function validaParametriVoto(p: ParametriVoto): ParametriVoto {
  esigi(p.versione === 1, `versione ${p.versione} non supportata`);
  esigi(p.minimo < p.massimo, 'voto: minimo sopra il massimo');
  esigi(p.prestazione.limite > 0, 'voto: il limite di C_prestazione deve essere positivo');
  for (const gruppo of GRUPPI_RUOLO) {
    esigi(p.pesi[gruppo] != null, `voto: mancano i pesi del gruppo "${gruppo}"`);
    const s = p.standardizzazione[gruppo];
    esigi(s != null, `voto: manca la standardizzazione del gruppo "${gruppo}"`);
    esigi(s.deviazione > 0, `voto: deviazione non positiva per "${gruppo}"`);
  }
  esigi(
    p.minuti.sogliaSenzaVoto <= p.minuti.sogliaGiudizioPieno,
    'voto: la soglia del senza voto deve stare sotto quella del giudizio pieno',
  );
  return p;
}

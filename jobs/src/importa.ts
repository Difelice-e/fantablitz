/**
 * Importazione delle rose da Fantalab (SPEC 6.1).
 *
 * **L'import e' atomico**: o passa tutto, o non passa niente. Questa funzione
 * non restituisce mai un risultato parziale, e non scrive da nessuna parte: si
 * limita a validare e a produrre l'esito. Chi la chiama scrive solo se l'esito
 * e' riuscito, e a quel punto sa che non ci sono sorprese a meta' strada.
 *
 * La chiave del join e' il `Fantacalcio_Id`, che c'e' in entrambi i formati di
 * export. Il listone interno e' lo stesso di Fantacalcio.it, quindi
 * l'abbinamento e' esatto e non serve nessun confronto per somiglianza sui
 * nomi: i nomi restano un dato di visualizzazione, e infatti quando non
 * corrispondono si produce un avviso, non un errore.
 */

import type { RegoleSchieramento } from '../../fanta/src/regole.ts';
import type { Modalita, RuoloClassico, RuoloMantra, Schierabile } from '../../fanta/src/tipi.ts';
import { coperturaModuli, type CoperturaModulo } from '../../fanta/src/schieramento.ts';
import { leggiExport, ruoliDaCampo, type FormatoExport, type RigaRosa } from './fantalab.ts';

/* ------------------------------------------------------------------ */
/* Ingressi                                                            */
/* ------------------------------------------------------------------ */

/** Il sottoinsieme di `riferimenti-esterni.json` che serve all'import. */
export type RiferimentiEsterni = {
  giocatori: {
    giocatoreId: string;
    idEsterno: number;
    nomeFonte: string;
    squadraFonte: string;
    ruoloFonte: string;
    ruoliMantraFonte: string;
    quotazioneAsta: number;
    quotazioneAstaMantra: number;
  }[];
  club: { clubId: string; sigla: string; nomeFonte: string }[];
  ceduti: number[];
};

/** Il sottoinsieme di `mondo.json` che serve: i ruoli, per validare le rose. */
export type GiocatoreDelMondo = Schierabile & { clubId: string };

export type Contesto = {
  mondo: readonly GiocatoreDelMondo[];
  riferimenti: RiferimentiEsterni;
  regole: RegoleSchieramento;
  /** Crediti a disposizione di ogni squadra (SPEC 4: 500 di default). */
  budget: number;
  /** Quante squadre deve avere la lega. Se assente, non si controlla. */
  squadreAttese?: number;
};

/* ------------------------------------------------------------------ */
/* Uscite                                                              */
/* ------------------------------------------------------------------ */

export type Errore = {
  tipo:
    | 'formato' | 'idSconosciuto' | 'idCeduto' | 'idDuplicato'
    | 'prezzo' | 'budget' | 'composizione' | 'lega';
  messaggio: string;
  riga?: number;
  /** Cosa deve fare l'amministratore per sbloccare l'import. */
  rimedio?: string;
};

export type Avviso = {
  tipo: 'discrepanza' | 'formato';
  messaggio: string;
  riga?: number;
};

export type GiocatoreImportato = {
  giocatoreId: string;
  idEsterno: number;
  prezzo: number;
};

export type SquadraImportata = {
  nome: string;
  giocatori: GiocatoreImportato[];
  spesa: number;
  creditiResidui: number;
  copertura: CoperturaModulo[];
};

export type Esito =
  | { riuscito: true; formato: FormatoExport; squadre: SquadraImportata[]; avvisi: Avviso[] }
  | { riuscito: false; formato: FormatoExport; errori: Errore[]; avvisi: Avviso[] };

/* ------------------------------------------------------------------ */

const stessiRuoli = (a: readonly string[], b: readonly string[]): boolean => {
  if (a.length !== b.length) return false;
  const x = [...a].sort();
  const y = [...b].sort();
  return x.every((v, i) => v === y[i]);
};

/* ------------------------------------------------------------------ */

export function importaRose(contenuto: string, contesto: Contesto): Esito {
  const errori: Errore[] = [];
  const avvisi: Avviso[] = [];

  const lettura = leggiExport(contenuto);
  for (const e of lettura.errori) {
    errori.push({ tipo: 'formato', messaggio: e.messaggio, riga: e.riga });
  }
  if (errori.length > 0) {
    return { riuscito: false, formato: lettura.formato, errori, avvisi };
  }
  if (lettura.righe.length === 0) {
    errori.push({ tipo: 'formato', messaggio: 'Il file non contiene nessuna riga di rosa.' });
    return { riuscito: false, formato: lettura.formato, errori, avvisi };
  }

  /* --- riconciliazione col listone --------------------------------- */

  const perIdEsterno = new Map(contesto.riferimenti.giocatori.map((g) => [g.idEsterno, g]));
  const ceduti = new Set(contesto.riferimenti.ceduti);
  const siglaPerClub = new Map(contesto.riferimenti.club.map((c) => [c.clubId, c.sigla]));
  const giocatorePerId = new Map(contesto.mondo.map((g) => [g.id, g]));

  const visti = new Map<number, RigaRosa>();

  for (const riga of lettura.righe) {
    // Nessun id duplicato nell'intero file, non solo dentro una squadra: lo
    // stesso giocatore in due rose sarebbe un'asta da rifare.
    const gia = visti.get(riga.idEsterno);
    if (gia) {
      errori.push({
        tipo: 'idDuplicato',
        riga: riga.riga,
        messaggio:
          `L’id ${riga.idEsterno} compare due volte: riga ${gia.riga} ("${gia.squadra}") ` +
          `e riga ${riga.riga} ("${riga.squadra}").`,
        rimedio: 'Correggere l’export: un giocatore puo’ stare in una sola rosa.',
      });
      continue;
    }
    visti.set(riga.idEsterno, riga);

    if (riga.prezzo < 1) {
      errori.push({
        tipo: 'prezzo',
        riga: riga.riga,
        messaggio: `Prezzo ${riga.prezzo} per l’id ${riga.idEsterno}: il minimo e’ 1 credito.`,
      });
    }

    const riferimento = perIdEsterno.get(riga.idEsterno);
    if (!riferimento) {
      // E' l'unico disallineamento previsto dalla specifica: un id nella rosa
      // che il listone non conosce, perche' il listone e' piu' recente. Va
      // segnalato all'amministratore e blocca l'import finche' non e' risolto.
      const eeCeduto = ceduti.has(riga.idEsterno);
      errori.push({
        tipo: eeCeduto ? 'idCeduto' : 'idSconosciuto',
        riga: riga.riga,
        messaggio: eeCeduto
          ? `L’id ${riga.idEsterno}${riga.nome ? ` ("${riga.nome}")` : ''} risulta fra i ` +
            'giocatori ceduti: non fa piu’ parte del listone.'
          : `L’id ${riga.idEsterno}${riga.nome ? ` ("${riga.nome}")` : ''} non esiste nel listone.`,
        rimedio: eeCeduto
          ? 'Il giocatore ha lasciato la Serie A dopo l’asta: va rimosso dalla rosa oppure ' +
            'sostituito, e l’export rigenerato.'
          : 'Probabile listone piu’ recente dell’export. Rigenerare l’export da Fantalab, ' +
            'oppure aggiornare il seed con il listone usato all’asta.',
      });
      continue;
    }

    /* --- campi ridondanti: avvisi, non errori --------------------- */

    const interno = giocatorePerId.get(riferimento.giocatoreId);

    if (riga.nome !== undefined && riga.nome !== riferimento.nomeFonte) {
      avvisi.push({
        tipo: 'discrepanza',
        riga: riga.riga,
        messaggio:
          `id ${riga.idEsterno}: nome "${riga.nome}" nell’export, ` +
          `"${riferimento.nomeFonte}" nel listone.`,
      });
    }

    if (riga.ruoloClassico !== undefined && riga.ruoloClassico !== riferimento.ruoloFonte) {
      avvisi.push({
        tipo: 'discrepanza',
        riga: riga.riga,
        messaggio:
          `id ${riga.idEsterno} ("${riferimento.nomeFonte}"): ruolo "${riga.ruoloClassico}" ` +
          `nell’export, "${riferimento.ruoloFonte}" nel listone.`,
      });
    }

    if (riga.ruoliMantra !== undefined) {
      const daExport = ruoliDaCampo(riga.ruoliMantra);
      const daListone = ruoliDaCampo(riferimento.ruoliMantraFonte);
      // Si confrontano **insiemi**, mai sequenze: Fantalab riordina i ruoli in
      // ordine canonico mentre il listone mette per primo il principale, e su
      // sedici righe su duecentocinquanta i due ordini differiscono pur
      // descrivendo gli stessi ruoli. Confrontare le sequenze produrrebbe
      // sedici avvisi falsi a ogni import.
      if (!stessiRuoli(daExport, daListone)) {
        avvisi.push({
          tipo: 'discrepanza',
          riga: riga.riga,
          messaggio:
            `id ${riga.idEsterno} ("${riferimento.nomeFonte}"): ruoli Mantra ` +
            `"${daExport.join(',')}" nell’export, "${daListone.join(',')}" nel listone.`,
        });
      }
    }

    if (riga.siglaClub !== undefined && interno) {
      const attesa = siglaPerClub.get(interno.clubId);
      if (attesa !== undefined && riga.siglaClub !== attesa) {
        avvisi.push({
          tipo: 'discrepanza',
          riga: riga.riga,
          messaggio:
            `id ${riga.idEsterno} ("${riferimento.nomeFonte}"): club "${riga.siglaClub}" ` +
            `nell’export, "${attesa}" nel listone.`,
        });
      }
    }

    const quotazioneAttesa =
      contesto.regole.modalita === 'mantra'
        ? riferimento.quotazioneAstaMantra
        : riferimento.quotazioneAsta;
    const quotazioneNelFile =
      contesto.regole.modalita === 'mantra' ? riga.quotazioneMantra : riga.quotazione;
    if (quotazioneNelFile !== undefined && quotazioneNelFile !== quotazioneAttesa) {
      avvisi.push({
        tipo: 'discrepanza',
        riga: riga.riga,
        messaggio:
          `id ${riga.idEsterno} ("${riferimento.nomeFonte}"): quotazione ${quotazioneNelFile} ` +
          `nell’export, ${quotazioneAttesa} nel listone.`,
      });
    }
  }

  /* --- raggruppamento per squadra ---------------------------------- */

  const perSquadra = new Map<string, RigaRosa[]>();
  for (const riga of lettura.righe) {
    const gruppo = perSquadra.get(riga.squadra);
    if (gruppo) gruppo.push(riga);
    else perSquadra.set(riga.squadra, [riga]);
  }

  if (contesto.squadreAttese !== undefined && perSquadra.size !== contesto.squadreAttese) {
    errori.push({
      tipo: 'lega',
      messaggio:
        `L’export contiene ${perSquadra.size} squadre, la lega ne prevede ` +
        `${contesto.squadreAttese}: ${[...perSquadra.keys()].join(', ')}.`,
    });
  }

  const squadre: SquadraImportata[] = [];

  for (const [nome, righe] of perSquadra) {
    const spesa = righe.reduce((a, r) => a + r.prezzo, 0);
    if (spesa > contesto.budget) {
      errori.push({
        tipo: 'budget',
        messaggio:
          `"${nome}" ha speso ${spesa} crediti, il budget e’ ${contesto.budget}.`,
        rimedio: 'Verificare il budget configurato per la lega, o i prezzi nell’export.',
      });
    }

    const rosa: Schierabile[] = [];
    for (const r of righe) {
      const riferimento = perIdEsterno.get(r.idEsterno);
      if (!riferimento) continue; // gia' segnalato come errore bloccante
      const interno = giocatorePerId.get(riferimento.giocatoreId);
      if (interno) rosa.push(interno);
    }

    // La composizione della rosa dipende dalla modalita': in classic e' esatta
    // (3-8-8-6), in Mantra e' un minimo. La domanda la fanno le regole, non
    // questo file: cosi' l'importatore e' uno solo per entrambe.
    for (const problema of contesto.regole.validaRosa(rosa)) {
      errori.push({ tipo: 'composizione', messaggio: `"${nome}": ${problema.messaggio}` });
    }

    squadre.push({
      nome,
      giocatori: righe
        .map((r) => {
          const riferimento = perIdEsterno.get(r.idEsterno);
          return riferimento
            ? { giocatoreId: riferimento.giocatoreId, idEsterno: r.idEsterno, prezzo: r.prezzo }
            : null;
        })
        .filter((x): x is GiocatoreImportato => x !== null),
      spesa,
      creditiResidui: contesto.budget - spesa,
      // SPEC 6.1: la copertura dei moduli va mostrata subito dopo l'import.
      copertura: coperturaModuli(rosa, contesto.regole),
    });
  }

  if (errori.length > 0) {
    return { riuscito: false, formato: lettura.formato, errori, avvisi };
  }

  return { riuscito: true, formato: lettura.formato, squadre, avvisi };
}

/* ------------------------------------------------------------------ */

/** Costruisce il contesto a partire dai due file del seed gia' deserializzati. */
export function contestoDaSeed(
  mondo: { giocatori: { id: string; clubId: string; ruoloClassico: string; ruoliMantra: string[] }[] },
  riferimenti: RiferimentiEsterni,
  regole: RegoleSchieramento,
  opzioni: { budget: number; squadreAttese?: number; modalita?: Modalita },
): Contesto {
  return {
    mondo: mondo.giocatori.map((g) => ({
      id: g.id,
      clubId: g.clubId,
      ruoloClassico: g.ruoloClassico as RuoloClassico,
      ruoliMantra: g.ruoliMantra as RuoloMantra[],
    })),
    riferimenti,
    regole,
    budget: opzioni.budget,
    ...(opzioni.squadreAttese !== undefined ? { squadreAttese: opzioni.squadreAttese } : {}),
  };
}

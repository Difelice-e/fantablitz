/**
 * Regole di schieramento della modalita' Mantra.
 *
 * Il modello e' la trascrizione del materiale ufficiale: gli schemi dei moduli,
 * la tabella delle sostituzioni e la tabella dei ruoli con le linee di gioco.
 * Niente e' dedotto, perche' non c'e' piu' bisogno di dedurre.
 *
 * **La tabella delle sostituzioni e' la regola.** La riga e' il ruolo della
 * casella da coprire, la colonna il ruolo di chi la copre, e la cella dice se
 * si puo' e a che prezzo. Il verso conta: un difensore puo' coprire una punta
 * con un malus, una punta non puo' coprire un difensore. Ne segue che all'asta
 * conviene valutare un giocatore nel suo ruolo piu' arretrato, perche' e' quello
 * che gli apre piu' caselle.
 *
 * Tre simboli della tabella dipendono dallo schema, non solo dai due ruoli:
 * valgono `OK` quando la casella elenca i due ruoli **in alternativa** (come
 * `E/W` o `M/C`), e altrimenti ripiegano su un malus o su un divieto. E' la
 * ragione per cui `valuta` riceve anche il modulo: senza, meta' della tabella
 * non sarebbe esprimibile.
 *
 * Attenzione a non confondere la **linea** di gioco con lo **stampo**. La linea
 * raggruppa i ruoli sul campo (difesa, centrocampo, trequarti, attacco); lo
 * stampo divide i cinque difensivi dai cinque offensivi di ogni schema. Nel
 * centrocampo convivono entrambi: E e M sono difensivi, C e' offensivo.
 */

import type {
  EsitoSlot, Modulo, Problema, RuoloClassico, RuoloMantra, Schierabile, Slot,
} from './tipi.ts';
import { NON_AMMESSO, PERFETTO, RUOLI_MANTRA } from './tipi.ts';
import type { RegoleSchieramento } from './regole.ts';

export const LINEE = ['porta', 'difesa', 'centrocampo', 'trequarti', 'attacco'] as const;
export type Linea = (typeof LINEE)[number];

export type Stampo = 'difensivo' | 'offensivo';

/** I simboli della tabella delle sostituzioni, nell'alfabeto del regolamento. */
export type Simbolo = 'OK' | '-1' | 'NO' | '*' | '**' | '***';

export type ConfigurazioneMantra = {
  versione: number;
  codici: Record<string, string>;
  costi: { adattamento: number };
  ruoli: Record<string, { nome?: string; linea: Linea; stampo: Stampo }>;
  legenda: Record<string, unknown>;
  matrice: Record<string, Record<string, Simbolo> | unknown>;
  moduli: Record<string, string[] | unknown>;
  rosa: { minimo: number; minimoPortieri: number };
};

/** Uno slot Mantra porta i ruoli che lo occupano senza malus. */
type SlotMantra = Slot & { nativi: RuoloMantra[]; codiciNativi: string[] };

const REPARTO_DI_LINEA: Record<Linea, RuoloClassico> = {
  porta: 'P', difesa: 'D', centrocampo: 'C', trequarti: 'C', attacco: 'A',
};

/** Nel 4-1-4-1 il simbolo *** vieta invece di ammettere col malus. */
const MODULI_CON_DIVIETO_TRIPLO = new Set(['4-1-4-1']);

function esigi(condizione: boolean, messaggio: string): void {
  if (!condizione) throw new Error(`Configurazione Mantra non valida: ${messaggio}`);
}

const voceReale = (chiave: string): boolean => !chiave.startsWith('_');

/* ------------------------------------------------------------------ */

export function validaConfigurazioneMantra(c: ConfigurazioneMantra): ConfigurazioneMantra {
  esigi(c.versione === 4, `versione ${c.versione} non supportata`);
  esigi(c.costi.adattamento > 0, 'il costo di un adattamento deve essere positivo');

  const codici = Object.keys(c.codici).filter(voceReale);
  esigi(codici.length === 12, `attesi dodici codici di ruolo, trovati ${codici.length}`);

  const noti = new Set<string>(RUOLI_MANTRA);
  for (const codice of codici) {
    esigi(noti.has(c.codici[codice]!), `codice "${codice}": ruolo "${c.codici[codice]}" sconosciuto`);
    const d = c.ruoli[codice];
    esigi(d != null, `manca la definizione del ruolo "${codice}"`);
    esigi(
      (LINEE as readonly string[]).includes(d!.linea),
      `ruolo "${codice}": linea "${d!.linea}" sconosciuta`,
    );
    esigi(
      d!.stampo === 'difensivo' || d!.stampo === 'offensivo',
      `ruolo "${codice}": stampo "${d!.stampo}" sconosciuto`,
    );
  }
  esigi(
    new Set(codici.map((k) => c.codici[k])).size === 12,
    'due codici puntano allo stesso ruolo del listone',
  );

  /* --- matrice: dev'essere completa ------------------------------- */

  const simboli = new Set<string>(['OK', '-1', 'NO', '*', '**', '***']);
  for (const riga of codici) {
    const voce = c.matrice[riga] as Record<string, Simbolo> | undefined;
    esigi(voce != null, `matrice: manca la riga "${riga}"`);
    for (const colonna of codici) {
      const cella = voce![colonna];
      esigi(cella != null, `matrice: manca la cella ${riga}/${colonna}`);
      esigi(simboli.has(cella!), `matrice ${riga}/${colonna}: simbolo "${cella}" sconosciuto`);
    }
    // La diagonale e' il giocatore al proprio posto: deve costare zero.
    esigi(voce![riga] === 'OK', `matrice ${riga}/${riga}: un ruolo nel proprio posto deve dare OK`);
  }

  /* --- moduli ------------------------------------------------------ */

  const nomiModuli = Object.keys(c.moduli).filter(voceReale);
  esigi(nomiModuli.length > 0, 'serve almeno un modulo');

  for (const nome of nomiModuli) {
    const caselle = c.moduli[nome] as string[];
    esigi(Array.isArray(caselle), `modulo ${nome}: le caselle non sono un elenco`);
    esigi(caselle.length === 11, `modulo ${nome}: ${caselle.length} caselle invece di undici`);

    let portieri = 0;
    let difensiviPuri = 0;
    let offensiviPuri = 0;
    let misti = 0;

    for (const casella of caselle) {
      const parti = casella.split('/');
      for (const p of parti) esigi(c.ruoli[p] != null, `modulo ${nome}: ruolo "${p}" sconosciuto`);

      const stampi = new Set(parti.map((p) => c.ruoli[p]!.stampo));
      const linee = new Set(parti.map((p) => c.ruoli[p]!.linea));

      if (linee.has('porta')) {
        esigi(parti.length === 1, `modulo ${nome}: la porta non ammette ruoli alternativi`);
        portieri++;
      } else if (stampi.size > 1) misti++;
      else if (stampi.has('difensivo')) difensiviPuri++;
      else offensiviPuri++;
    }

    esigi(portieri === 1, `modulo ${nome}: ${portieri} portieri`);
    // Ogni schema impiega cinque uomini di movimento di stampo difensivo e
    // cinque di stampo offensivo. Le caselle con ruoli di stampo diverso in
    // alternativa, come M/C, lasciano la scelta al fantallenatore: il vincolo
    // deve restare raggiungibile, non essere gia' deciso.
    esigi(
      difensiviPuri <= 5 && difensiviPuri + misti >= 5,
      `modulo ${nome}: ${difensiviPuri} caselle di stampo difensivo e ${misti} miste, ` +
        'impossibile arrivare ai cinque difensivi previsti',
    );
    esigi(
      offensiviPuri <= 5 && offensiviPuri + misti >= 5,
      `modulo ${nome}: ${offensiviPuri} caselle di stampo offensivo e ${misti} miste, ` +
        'impossibile arrivare ai cinque offensivi previsti',
    );
  }

  esigi(c.rosa.minimo >= 11, 'la rosa minima non puo’ essere sotto gli undici');
  esigi(c.rosa.minimoPortieri >= 1, 'serve almeno un portiere');

  return c;
}

/* ------------------------------------------------------------------ */

export function regoleMantra(configurazione: ConfigurazioneMantra): RegoleSchieramento {
  const c = validaConfigurazioneMantra(configurazione);

  const aRuolo = (codice: string): RuoloMantra => c.codici[codice] as RuoloMantra;
  const aCodice = new Map<RuoloMantra, string>(
    Object.keys(c.codici).filter(voceReale).map((k) => [aRuolo(k), k]),
  );

  const moduli: Modulo[] = Object.keys(c.moduli)
    .filter(voceReale)
    .map((nome) => {
      const caselle = c.moduli[nome] as string[];
      // Gli identificativi numerano le caselle uguali: DC1, DC2, DC3. Devono
      // restare stabili, perche' la formazione e' persistente.
      const conteggio = new Map<string, number>();
      const slot: SlotMantra[] = caselle.map((casella) => {
        const n = (conteggio.get(casella) ?? 0) + 1;
        conteggio.set(casella, n);
        const quante = caselle.filter((x) => x === casella).length;
        const codiciNativi = casella.split('/');
        return {
          id: (quante > 1 ? `${casella}${n}` : casella).replace(/\//g, ''),
          reparto: REPARTO_DI_LINEA[c.ruoli[codiciNativi[0]!]!.linea],
          nativi: codiciNativi.map(aRuolo),
          codiciNativi,
        };
      });
      return { nome, slot };
    });

  const perNome = new Map(moduli.map((m) => [m.nome, m]));

  /**
   * Risolve una cella della tabella per una casella concreta di un modulo.
   *
   * I tre simboli con l'asterisco valgono `OK` quando i due ruoli compaiono
   * **in alternativa** nella casella: e' il caso in cui il giocatore e' al suo
   * posto, e infatti quel caso e' gia' stato deciso prima di arrivare qui.
   * Quindi qui si applica sempre il ripiego.
   */
  function risolvi(simbolo: Simbolo, nomeModulo: string): EsitoSlot {
    switch (simbolo) {
      case 'OK':
        return PERFETTO;
      case '-1':
        return { ammesso: true, costo: c.costi.adattamento };
      case 'NO':
        return NON_AMMESSO;
      case '*':
        // OK solo in alternativa, altrimenti niente da fare.
        return NON_AMMESSO;
      case '**':
        return { ammesso: true, costo: c.costi.adattamento };
      case '***':
        // Come sopra, ma nel 4-1-4-1 il regolamento lo vieta del tutto.
        return MODULI_CON_DIVIETO_TRIPLO.has(nomeModulo)
          ? NON_AMMESSO
          : { ammesso: true, costo: c.costi.adattamento };
    }
  }

  return {
    modalita: 'mantra',
    moduli,
    modulo: (nome) => perNome.get(nome),

    valuta(giocatore: Schierabile, slot: Slot, modulo: Modulo): EsitoSlot {
      const { nativi, codiciNativi } = slot as SlotMantra;
      if (!nativi) return NON_AMMESSO;

      let migliore = Number.POSITIVE_INFINITY;

      for (const ruolo of giocatore.ruoliMantra) {
        // Il giocatore e' al suo posto: la casella elenca il suo ruolo, da sola
        // o in alternativa a un altro. Nessun malus, ed e' la scorciatoia che
        // rende inutile il ramo "in alternativa" dei simboli con l'asterisco.
        if (nativi.includes(ruolo)) return PERFETTO;

        const colonna = aCodice.get(ruolo);
        if (!colonna) continue;

        // Una casella con ruoli alternativi offre piu' righe della tabella:
        // vale la piu' generosa, perche' basta poter coprire uno dei due.
        for (const riga of codiciNativi) {
          const simbolo = (c.matrice[riga] as Record<string, Simbolo>)[colonna];
          if (!simbolo) continue;
          const esito = risolvi(simbolo, modulo.nome);
          if (esito.ammesso) migliore = Math.min(migliore, esito.costo);
        }
      }

      return Number.isFinite(migliore) ? { ammesso: true, costo: migliore } : NON_AMMESSO;
    },

    validaRosa(rosa: readonly Schierabile[]): Problema[] {
      const problemi: Problema[] = [];

      const visti = new Set<string>();
      for (const g of rosa) {
        if (visti.has(g.id)) {
          problemi.push({ tipo: 'rosa', messaggio: `Il giocatore ${g.id} compare due volte in rosa.` });
        }
        visti.add(g.id);
      }

      if (rosa.length < c.rosa.minimo) {
        problemi.push({
          tipo: 'rosa',
          messaggio: `La rosa ha ${rosa.length} giocatori, il minimo e’ ${c.rosa.minimo}.`,
        });
      }

      const portieri = rosa.filter((g) => g.ruoliMantra.includes('Por')).length;
      if (portieri < c.rosa.minimoPortieri) {
        problemi.push({
          tipo: 'rosa',
          messaggio: `La rosa ha ${portieri} portieri, il minimo e’ ${c.rosa.minimoPortieri}.`,
        });
      }

      return problemi;
    },
  };
}

/* ------------------------------------------------------------------ */

/** Lo stampo di un ruolo: difensivo o offensivo. */
export function stampoDi(c: ConfigurazioneMantra, ruolo: RuoloMantra): Stampo {
  const codice = Object.keys(c.codici).filter(voceReale).find((k) => c.codici[k] === ruolo)!;
  return c.ruoli[codice]!.stampo;
}

/** La linea di gioco di un ruolo. */
export function lineaDi(c: ConfigurazioneMantra, ruolo: RuoloMantra): Linea {
  const codice = Object.keys(c.codici).filter(voceReale).find((k) => c.codici[k] === ruolo)!;
  return c.ruoli[codice]!.linea;
}

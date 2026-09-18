/**
 * Regole di schieramento della modalita' Mantra.
 *
 * La differenza rispetto a classic e' tutta qui: la matrice di compatibilita'
 * non e' diagonale. Una casella accetta il proprio ruolo senza costo, alcuni
 * ruoli vicini con un adattamento, altri con un adattamento aggravato, e il
 * regolamento prevede eccezioni che dipendono dal **modulo** e non solo dalla
 * casella. E' la ragione per cui `valuta` riceve anche il modulo.
 *
 * ATTENZIONE. La matrice vive in `config/mantra.json` ed e' una ricostruzione,
 * non una trascrizione del regolamento ufficiale: va verificata prima che la
 * lega parta. Il meccanismo invece e' completo e testato, e cambiare la matrice
 * non richiede di toccare questo file.
 */

import type {
  EsitoSlot, Modulo, Problema, RuoloClassico, RuoloMantra, Schierabile, Slot,
} from './tipi.ts';
import { NON_AMMESSO, PERFETTO, RUOLI_MANTRA } from './tipi.ts';
import type { RegoleSchieramento } from './regole.ts';

export type TipoSlot = {
  reparto: RuoloClassico;
  stampo: 'difensivo' | 'offensivo';
  ruoli: RuoloMantra[];
  adattati?: RuoloMantra[];
  aggravati?: RuoloMantra[];
};

export type ConfigurazioneMantra = {
  versione: number;
  costi: { adattamento: number; aggravato: number };
  tipiSlot: Record<string, TipoSlot>;
  moduli: { nome: string; slot: string[] }[];
  eccezioni: { modulo: string; tipoSlot: string; vietati?: RuoloMantra[] }[];
  rosa: { minimo: number; minimoPortieri: number };
};

/** Uno slot Mantra porta con se' il tipo, che decide chi puo' occuparlo. */
type SlotMantra = Slot & { tipo: string };

function esigi(condizione: boolean, messaggio: string): void {
  if (!condizione) throw new Error(`Configurazione Mantra non valida: ${messaggio}`);
}

export function validaConfigurazioneMantra(c: ConfigurazioneMantra): ConfigurazioneMantra {
  esigi(c.versione === 1, `versione ${c.versione} non supportata`);
  esigi(c.costi.adattamento > 0, 'il costo di un adattamento deve essere positivo');
  esigi(
    c.costi.aggravato > c.costi.adattamento,
    'un adattamento aggravato deve costare piu’ di uno normale',
  );

  const ruoliNoti = new Set<string>(RUOLI_MANTRA);
  for (const [nome, tipo] of Object.entries(c.tipiSlot)) {
    if (nome.startsWith('_')) continue;
    for (const elenco of [tipo.ruoli, tipo.adattati ?? [], tipo.aggravati ?? []]) {
      for (const r of elenco) {
        esigi(ruoliNoti.has(r), `casella "${nome}": ruolo Mantra sconosciuto "${r}"`);
      }
    }
    esigi(tipo.ruoli.length > 0, `casella "${nome}": nessun ruolo titolare`);
    // Un ruolo non puo' essere insieme perfetto e adattato: sarebbe ambiguo.
    const perfetti = new Set(tipo.ruoli);
    for (const r of [...(tipo.adattati ?? []), ...(tipo.aggravati ?? [])]) {
      esigi(!perfetti.has(r), `casella "${nome}": "${r}" e’ sia titolare sia adattato`);
    }
  }

  esigi(c.moduli.length > 0, 'serve almeno un modulo');
  const nomi = new Set<string>();
  for (const m of c.moduli) {
    esigi(!nomi.has(m.nome), `modulo duplicato: ${m.nome}`);
    nomi.add(m.nome);
    esigi(m.slot.length === 11, `modulo ${m.nome}: ${m.slot.length} caselle invece di undici`);

    let portieri = 0;
    let difensivi = 0;
    let offensivi = 0;
    for (const tipo of m.slot) {
      const definizione = c.tipiSlot[tipo];
      esigi(definizione != null, `modulo ${m.nome}: casella "${tipo}" non definita`);
      if (definizione!.reparto === 'P') portieri++;
      else if (definizione!.stampo === 'difensivo') difensivi++;
      else offensivi++;
    }

    esigi(portieri === 1, `modulo ${m.nome}: ${portieri} portieri`);
    // SPEC 6.2: ogni modulo prevede cinque caselle di stampo difensivo e cinque
    // offensive. E' un invariante strutturale, non un dettaglio estetico: se
    // salta, il modulo non e' un modulo Mantra.
    esigi(
      difensivi === 5 && offensivi === 5,
      `modulo ${m.nome}: ${difensivi} caselle difensive e ${offensivi} offensive, attese cinque e cinque`,
    );
  }

  for (const e of c.eccezioni) {
    esigi(nomi.has(e.modulo), `eccezione su un modulo inesistente: ${e.modulo}`);
    esigi(c.tipiSlot[e.tipoSlot] != null, `eccezione su una casella inesistente: ${e.tipoSlot}`);
  }

  esigi(c.rosa.minimo >= 11, 'la rosa minima non puo’ essere sotto gli undici');
  esigi(c.rosa.minimoPortieri >= 1, 'serve almeno un portiere');

  return c;
}

export function regoleMantra(configurazione: ConfigurazioneMantra): RegoleSchieramento {
  const c = validaConfigurazioneMantra(configurazione);

  const moduli: Modulo[] = c.moduli.map((m) => {
    // Gli identificativi numerano le caselle dello stesso tipo: DC1, DC2, DC3.
    // Devono essere stabili, perche' la formazione e' persistente.
    const conteggio = new Map<string, number>();
    const slot: SlotMantra[] = m.slot.map((tipo) => {
      const n = (conteggio.get(tipo) ?? 0) + 1;
      conteggio.set(tipo, n);
      const quanti = m.slot.filter((x) => x === tipo).length;
      return {
        id: quanti > 1 ? `${tipo}${n}` : tipo,
        reparto: c.tipiSlot[tipo]!.reparto,
        tipo,
      };
    });
    return { nome: m.nome, slot };
  });

  const perNome = new Map(moduli.map((m) => [m.nome, m]));

  /** Ruoli vietati da un'eccezione, per coppia modulo/tipo di casella. */
  const vietatiPerEccezione = new Map<string, Set<RuoloMantra>>();
  for (const e of c.eccezioni) {
    const chiave = `${e.modulo}|${e.tipoSlot}`;
    const insieme = vietatiPerEccezione.get(chiave) ?? new Set<RuoloMantra>();
    for (const r of e.vietati ?? []) insieme.add(r);
    vietatiPerEccezione.set(chiave, insieme);
  }

  return {
    modalita: 'mantra',
    moduli,
    modulo: (nome) => perNome.get(nome),

    valuta(giocatore: Schierabile, slot: Slot, modulo: Modulo): EsitoSlot {
      const tipo = (slot as SlotMantra).tipo;
      const definizione = c.tipiSlot[tipo];
      if (!definizione) return NON_AMMESSO;

      const vietati = vietatiPerEccezione.get(`${modulo.nome}|${tipo}`);

      // Si cerca il costo piu' basso fra tutti i ruoli del giocatore: un
      // giocatore con due ruoli entra col migliore dei due, non col primo.
      let migliore = Number.POSITIVE_INFINITY;
      for (const ruolo of giocatore.ruoliMantra) {
        if (vietati?.has(ruolo)) continue;
        if (definizione.ruoli.includes(ruolo)) return PERFETTO;
        if (definizione.adattati?.includes(ruolo)) migliore = Math.min(migliore, c.costi.adattamento);
        else if (definizione.aggravati?.includes(ruolo)) migliore = Math.min(migliore, c.costi.aggravato);
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

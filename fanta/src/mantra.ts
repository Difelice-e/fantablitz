/**
 * Regole di schieramento della modalita' Mantra.
 *
 * Il modello segue il regolamento ufficiale di Fantacalcio.it, che poggia su
 * due classificazioni **diverse** dello stesso ruolo. Confonderle e' l'errore
 * facile, e per un po' ci siamo cascati anche noi.
 *
 * **Lo stampo** divide i ruoli in difensivi (Dd, Ds, Dc, B, E, M) e offensivi
 * (C, T, W, A, Pc), e serve a un solo scopo: ogni modulo deve schierare cinque
 * uomini di movimento di stampo difensivo e cinque di stampo offensivo. E' il
 * vincolo che tiene tutti i moduli equivalenti fra loro, e vale la pena notare
 * che E e M sono difensivi mentre C e' offensivo, pur essendo tutti e tre
 * centrocampisti.
 *
 * **La linea** di gioco e' un'altra cosa: porta, difesa, centrocampo,
 * trequarti, attacco. Decide chi puo' adattarsi a quale casella, e la regola e'
 * direzionale: si puo' giocare nella propria linea o in una **piu' avanzata**,
 * mai in una piu' arretrata. Un difensore puo' fare la punta con un malus, una
 * punta non puo' fare il difensore nemmeno con un malus. E' la ragione per cui
 * all'asta conviene valutare un giocatore nel suo ruolo piu' arretrato.
 *
 * Questa regola sostituisce gli elenchi di ruoli adattati scritti a mano: sono
 * una conseguenza, non un dato da mantenere.
 */

import type {
  EsitoSlot, Modulo, Problema, RuoloClassico, RuoloMantra, Schierabile, Slot,
} from './tipi.ts';
import { NON_AMMESSO, PERFETTO, RUOLI_MANTRA } from './tipi.ts';
import type { RegoleSchieramento } from './regole.ts';

/** Le quattro linee di gioco, piu' la porta. L'ordine e' quello del campo. */
export const LINEE = ['porta', 'difesa', 'centrocampo', 'trequarti', 'attacco'] as const;
export type Linea = (typeof LINEE)[number];

const ORDINE_LINEA: Record<Linea, number> = {
  porta: 0, difesa: 1, centrocampo: 2, trequarti: 3, attacco: 4,
};

export type Stampo = 'difensivo' | 'offensivo';

export type DefinizioneRuolo = { linea: Linea; stampo: Stampo };

export type ConfigurazioneMantra = {
  versione: number;
  costi: { adattamento: number; aggravato: number };
  ruoli: Record<string, DefinizioneRuolo>;
  tipiSlot: Record<string, RuoloMantra[] | unknown>;
  moduli: { nome: string; slot: string[] }[];
  aggravati: { tipoSlot: string; ruoli: RuoloMantra[] }[];
  eccezioni: { modulo: string; tipoSlot: string; vietati?: RuoloMantra[] }[];
  rosa: { minimo: number; minimoPortieri: number };
};

type SlotMantra = Slot & { tipo: string };

/** Il reparto che l'interfaccia mostra, ricavato dalla linea. */
const REPARTO_DI_LINEA: Record<Linea, RuoloClassico> = {
  porta: 'P', difesa: 'D', centrocampo: 'C', trequarti: 'C', attacco: 'A',
};

function esigi(condizione: boolean, messaggio: string): void {
  if (!condizione) throw new Error(`Configurazione Mantra non valida: ${messaggio}`);
}

/** Gli elenchi di ruoli di una casella, saltando le chiavi di commento. */
function ruoliDelTipo(config: ConfigurazioneMantra, tipo: string): RuoloMantra[] | null {
  const voce = config.tipiSlot[tipo];
  return Array.isArray(voce) ? (voce as RuoloMantra[]) : null;
}

export function validaConfigurazioneMantra(c: ConfigurazioneMantra): ConfigurazioneMantra {
  esigi(c.versione === 2, `versione ${c.versione} non supportata`);
  esigi(c.costi.adattamento > 0, 'il costo di un adattamento deve essere positivo');
  esigi(
    c.costi.aggravato >= c.costi.adattamento,
    'un adattamento aggravato non puo’ costare meno di uno normale',
  );

  for (const ruolo of RUOLI_MANTRA) {
    const d = c.ruoli[ruolo];
    esigi(d != null, `manca la definizione del ruolo "${ruolo}"`);
    esigi(
      (LINEE as readonly string[]).includes(d!.linea),
      `ruolo "${ruolo}": linea "${d!.linea}" sconosciuta`,
    );
    esigi(
      d!.stampo === 'difensivo' || d!.stampo === 'offensivo',
      `ruolo "${ruolo}": stampo "${d!.stampo}" sconosciuto`,
    );
  }

  for (const tipo of Object.keys(c.tipiSlot)) {
    if (tipo.startsWith('_')) continue;
    const ruoli = ruoliDelTipo(c, tipo);
    esigi(ruoli != null && ruoli.length > 0, `casella "${tipo}": nessun ruolo titolare`);
    for (const r of ruoli!) {
      esigi(c.ruoli[r] != null, `casella "${tipo}": ruolo sconosciuto "${r}"`);
    }
    // Due ruoli alternativi nella stessa casella devono stare sulla stessa
    // linea e avere lo stesso stampo, altrimenti il conto dei cinque e cinque
    // dipenderebbe da chi ci gioca, che non avrebbe senso.
    const primo = c.ruoli[ruoli![0]!]!;
    for (const r of ruoli!) {
      esigi(
        c.ruoli[r]!.linea === primo.linea && c.ruoli[r]!.stampo === primo.stampo,
        `casella "${tipo}": i ruoli alternativi non condividono linea e stampo`,
      );
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
      const ruoli = ruoliDelTipo(c, tipo);
      esigi(ruoli != null, `modulo ${m.nome}: casella "${tipo}" non definita`);
      const d = c.ruoli[ruoli![0]!]!;
      if (d.linea === 'porta') portieri++;
      else if (d.stampo === 'difensivo') difensivi++;
      else offensivi++;
    }

    esigi(portieri === 1, `modulo ${m.nome}: ${portieri} portieri`);
    // Il vincolo che tiene equilibrati fra loro tutti i moduli del gioco: ogni
    // schema schiera cinque uomini di movimento di stampo difensivo e cinque di
    // stampo offensivo. Se salta, il modulo non e' un modulo Mantra.
    esigi(
      difensivi === 5 && offensivi === 5,
      `modulo ${m.nome}: ${difensivi} uomini di stampo difensivo e ${offensivi} di stampo ` +
        'offensivo, attesi cinque e cinque',
    );
  }

  for (const e of c.eccezioni) {
    esigi(nomi.has(e.modulo), `eccezione su un modulo inesistente: ${e.modulo}`);
    esigi(ruoliDelTipo(c, e.tipoSlot) != null, `eccezione su una casella inesistente: ${e.tipoSlot}`);
  }
  for (const a of c.aggravati) {
    esigi(
      ruoliDelTipo(c, a.tipoSlot) != null,
      `aggravio su una casella inesistente: ${a.tipoSlot}`,
    );
  }

  esigi(c.rosa.minimo >= 11, 'la rosa minima non puo’ essere sotto gli undici');
  esigi(c.rosa.minimoPortieri >= 1, 'serve almeno un portiere');

  return c;
}

export function regoleMantra(configurazione: ConfigurazioneMantra): RegoleSchieramento {
  const c = validaConfigurazioneMantra(configurazione);

  const linea = (ruolo: RuoloMantra): Linea => c.ruoli[ruolo]!.linea;
  const ruoliDi = (tipo: string): RuoloMantra[] => ruoliDelTipo(c, tipo)!;

  const moduli: Modulo[] = c.moduli.map((m) => {
    // Gli identificativi numerano le caselle dello stesso tipo: DC1, DC2, DC3.
    // Devono restare stabili, perche' la formazione e' persistente.
    const conteggio = new Map<string, number>();
    const slot: SlotMantra[] = m.slot.map((tipo) => {
      const n = (conteggio.get(tipo) ?? 0) + 1;
      conteggio.set(tipo, n);
      const quanti = m.slot.filter((x) => x === tipo).length;
      return {
        id: quanti > 1 ? `${tipo}${n}` : tipo,
        reparto: REPARTO_DI_LINEA[linea(ruoliDi(tipo)[0]!)],
        tipo,
      };
    });
    return { nome: m.nome, slot };
  });

  const perNome = new Map(moduli.map((m) => [m.nome, m]));

  const vietatiPerEccezione = new Map<string, Set<RuoloMantra>>();
  for (const e of c.eccezioni) {
    const chiave = `${e.modulo}|${e.tipoSlot}`;
    const insieme = vietatiPerEccezione.get(chiave) ?? new Set<RuoloMantra>();
    for (const r of e.vietati ?? []) insieme.add(r);
    vietatiPerEccezione.set(chiave, insieme);
  }

  const aggravatiPerSlot = new Map<string, Set<RuoloMantra>>();
  for (const a of c.aggravati) {
    const insieme = aggravatiPerSlot.get(a.tipoSlot) ?? new Set<RuoloMantra>();
    for (const r of a.ruoli ?? []) insieme.add(r);
    aggravatiPerSlot.set(a.tipoSlot, insieme);
  }

  return {
    modalita: 'mantra',
    moduli,
    modulo: (nome) => perNome.get(nome),

    valuta(giocatore: Schierabile, slot: Slot, modulo: Modulo): EsitoSlot {
      const tipo = (slot as SlotMantra).tipo;
      const nativi = ruoliDelTipo(c, tipo);
      if (!nativi) return NON_AMMESSO;

      const lineaSlot = linea(nativi[0]!);
      const vietati = vietatiPerEccezione.get(`${modulo.nome}|${tipo}`);
      const aggravati = aggravatiPerSlot.get(tipo);

      // Si cerca il costo piu' basso fra tutti i ruoli del giocatore: chi ne ha
      // due entra col migliore, non col primo dichiarato.
      let migliore = Number.POSITIVE_INFINITY;

      for (const ruolo of giocatore.ruoliMantra) {
        if (vietati?.has(ruolo)) continue;

        // Il portiere non esce dalla porta e nessuno ci entra al posto suo.
        // Senza questa riga la regola delle linee lo lascerebbe giocare
        // ovunque, perche' la porta e' la linea piu' arretrata di tutte.
        const eePortiere = linea(ruolo) === 'porta';
        if (eePortiere !== (lineaSlot === 'porta')) continue;

        if (nativi.includes(ruolo)) return PERFETTO;

        // Adattamento: si gioca nella propria linea o in una piu' avanzata,
        // mai in una piu' arretrata.
        if (ORDINE_LINEA[linea(ruolo)] <= ORDINE_LINEA[lineaSlot]) {
          const costo = aggravati?.has(ruolo) ? c.costi.aggravato : c.costi.adattamento;
          migliore = Math.min(migliore, costo);
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

/** Lo stampo di un ruolo, per chi deve contare i cinque e cinque. */
export function stampoDi(c: ConfigurazioneMantra, ruolo: RuoloMantra): Stampo {
  return c.ruoli[ruolo]!.stampo;
}

/** La linea di un ruolo, per chi deve ragionare sugli adattamenti. */
export function lineaDi(c: ConfigurazioneMantra, ruolo: RuoloMantra): Linea {
  return c.ruoli[ruolo]!.linea;
}

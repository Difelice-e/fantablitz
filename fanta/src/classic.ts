/**
 * Regole di schieramento della modalita' classic.
 *
 * E' il caso semplice, ed e' voluto che sia il primo a esistere: la matrice di
 * compatibilita' e' diagonale — un giocatore occupa le caselle del proprio
 * ruolo e basta — e il malus di adattamento non esiste. Se l'interfaccia regge
 * qui, reggera' anche per Mantra; se non reggesse, ce ne accorgiamo adesso che
 * costa poco cambiarla.
 *
 * Tutto quello che c'e' da sapere sta in `config/classic.json`: i sette moduli
 * e la composizione esatta della rosa.
 */

import type {
  EsitoSlot, Modulo, Problema, RuoloClassico, Schierabile, Slot,
} from './tipi.ts';
import { RUOLI_CLASSICI, NON_AMMESSO, PERFETTO } from './tipi.ts';
import { slotDaQuote, type RegoleSchieramento } from './regole.ts';

export type ConfigurazioneClassic = {
  versione: number;
  moduli: { nome: string; D: number; C: number; A: number }[];
  rosa: { composizioneEsatta: Record<RuoloClassico, number> };
};

function esigi(condizione: boolean, messaggio: string): void {
  if (!condizione) throw new Error(`Configurazione classic non valida: ${messaggio}`);
}

export function validaConfigurazioneClassic(c: ConfigurazioneClassic): ConfigurazioneClassic {
  esigi(c.versione === 1, `versione ${c.versione} non supportata`);
  esigi(c.moduli.length > 0, 'serve almeno un modulo');

  const nomi = new Set<string>();
  for (const m of c.moduli) {
    esigi(!nomi.has(m.nome), `modulo duplicato: ${m.nome}`);
    nomi.add(m.nome);
    esigi(
      m.D + m.C + m.A === 10,
      `modulo ${m.nome}: ${m.D + m.C + m.A} uomini di movimento invece di dieci`,
    );
    esigi(m.D >= 3 && m.D <= 5, `modulo ${m.nome}: ${m.D} difensori, fuori dal consentito`);
    esigi(m.A >= 1, `modulo ${m.nome}: serve almeno un attaccante`);
  }

  for (const ruolo of RUOLI_CLASSICI) {
    esigi(
      Number.isInteger(c.rosa.composizioneEsatta[ruolo]) && c.rosa.composizioneEsatta[ruolo] > 0,
      `composizione della rosa: quota mancante o non valida per "${ruolo}"`,
    );
  }

  // Ogni modulo deve essere schierabile con la rosa prevista, altrimenti si
  // offrirebbe all'utente uno schema che non potra' mai usare.
  const rosa = c.rosa.composizioneEsatta;
  for (const m of c.moduli) {
    esigi(rosa.P >= 1, 'la rosa deve prevedere almeno un portiere');
    esigi(rosa.D >= m.D, `modulo ${m.nome}: servono ${m.D} difensori, la rosa ne prevede ${rosa.D}`);
    esigi(rosa.C >= m.C, `modulo ${m.nome}: servono ${m.C} centrocampisti, la rosa ne prevede ${rosa.C}`);
    esigi(rosa.A >= m.A, `modulo ${m.nome}: servono ${m.A} attaccanti, la rosa ne prevede ${rosa.A}`);
  }

  return c;
}

export function regoleClassic(configurazione: ConfigurazioneClassic): RegoleSchieramento {
  const c = validaConfigurazioneClassic(configurazione);

  const moduli: Modulo[] = c.moduli.map((m) => ({
    nome: m.nome,
    slot: slotDaQuote({ D: m.D, C: m.C, A: m.A }),
  }));
  const perNome = new Map(moduli.map((m) => [m.nome, m]));

  return {
    modalita: 'classic',
    moduli,
    modulo: (nome) => perNome.get(nome),

    /**
     * In classic o si e' del ruolo o non si gioca: niente adattamenti, quindi
     * il costo e' sempre zero oppure l'accoppiamento e' vietato.
     */
    valuta(giocatore: Schierabile, slot: Slot): EsitoSlot {
      return giocatore.ruoloClassico === slot.reparto ? PERFETTO : NON_AMMESSO;
    },

    validaRosa(rosa: readonly Schierabile[]): Problema[] {
      const problemi: Problema[] = [];
      const attesa = c.rosa.composizioneEsatta;
      const totaleAtteso = RUOLI_CLASSICI.reduce((a, r) => a + attesa[r], 0);

      const visti = new Set<string>();
      for (const g of rosa) {
        if (visti.has(g.id)) {
          problemi.push({ tipo: 'rosa', messaggio: `Il giocatore ${g.id} compare due volte in rosa.` });
        }
        visti.add(g.id);
      }

      if (rosa.length !== totaleAtteso) {
        problemi.push({
          tipo: 'rosa',
          messaggio:
            `La rosa ha ${rosa.length} giocatori invece di ${totaleAtteso}. ` +
            'In classic la composizione e’ esatta, non un minimo.',
        });
      }

      for (const ruolo of RUOLI_CLASSICI) {
        const quanti = rosa.filter((g) => g.ruoloClassico === ruolo).length;
        if (quanti !== attesa[ruolo]) {
          problemi.push({
            tipo: 'rosa',
            messaggio: `Ruolo ${ruolo}: ${quanti} giocatori invece dei ${attesa[ruolo]} previsti.`,
          });
        }
      }

      return problemi;
    },
  };
}

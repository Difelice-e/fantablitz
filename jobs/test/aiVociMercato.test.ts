/** Test del generatore di voci di mercato (SPEC 8). */

import { ok, strictEqual } from 'node:assert/strict';
import { describe, it } from 'node:test';
import { generaVociMercato, type DatiVociMercato } from '../src/ai/vociMercato.ts';
import type { ProviderAI } from '../src/ai/provider.ts';

function providerFinto(risposte: (string | Error)[]): ProviderAI {
  let chiamate = 0;
  return {
    async genera() {
      const risposta = risposte[chiamate] ?? risposte.at(-1)!;
      chiamate++;
      if (risposta instanceof Error) throw risposta;
      return risposta;
    },
  };
}

const DATI: DatiVociMercato = {
  stagione: 2,
  trasferimenti: [
    { giocatore: 'Rossi', daClub: 'Alfa', aClub: 'Beta' },
    { giocatore: 'Bianchi', daClub: 'Gamma', aClub: 'Delta' },
  ],
};

describe('generaVociMercato', () => {
  it('senza provider usa il template, e cita i trasferimenti', async () => {
    const esito = await generaVociMercato(DATI, null);
    strictEqual(esito.fonte, 'template');
    ok(esito.testo.includes('Rossi'));
    ok(esito.testo.includes('Bianchi'));
  });

  it('senza trasferimenti il template dice che il mercato e’ silenzioso', async () => {
    const esito = await generaVociMercato({ stagione: 3, trasferimenti: [] }, null);
    strictEqual(esito.fonte, 'template');
    ok(esito.testo.includes('silenzioso'));
  });

  it('usa il provider quando risponde con del testo', async () => {
    const provider = providerFinto(['Movimenti in vista per la nuova stagione.']);
    const esito = await generaVociMercato(DATI, provider);
    strictEqual(esito.fonte, 'ai');
  });

  it('cade sul template se il provider fallisce', async () => {
    const provider = providerFinto([new Error('Groq non risponde')]);
    const esito = await generaVociMercato(DATI, provider);
    strictEqual(esito.fonte, 'template');
  });
});

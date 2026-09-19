/** Test del generatore di messaggi di chat (SPEC 7.2, 8). */

import { ok, strictEqual } from 'node:assert/strict';
import { describe, it } from 'node:test';
import { generaMessaggioChat, type DatiMessaggioChat } from '../src/ai/chat.ts';
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

const DATI: DatiMessaggioChat = {
  squadra: 'Gli Invincibili',
  carattere: 'smargiasso',
  tic: 'dice sempre "vedrete"',
  evento: 'sconfittaPesante',
  dettaglio: 'ha perso 40.0 a 90.5 contro Vecchia Guardia',
};

describe('generaMessaggioChat', () => {
  it('senza provider usa il template, e cita la squadra e il dettaglio', async () => {
    const esito = await generaMessaggioChat(DATI, null);
    strictEqual(esito.fonte, 'template');
    ok(esito.testo.includes('Gli Invincibili'));
    ok(esito.testo.includes(DATI.dettaglio));
  });

  it('un template diverso per ogni evento', async () => {
    const eventi: DatiMessaggioChat['evento'][] = ['sconfittaPesante', 'scambioRifiutato', 'colpoDiMercato'];
    const testi = await Promise.all(eventi.map((evento) => generaMessaggioChat({ ...DATI, evento }, null)));
    const distinti = new Set(testi.map((t) => t.testo));
    strictEqual(distinti.size, eventi.length, 'i tre eventi non devono produrre lo stesso testo');
  });

  it('usa il provider quando risponde con del testo', async () => {
    const provider = providerFinto(['Vedrete, la prossima è mia!']);
    const esito = await generaMessaggioChat(DATI, provider);
    strictEqual(esito.fonte, 'ai');
    strictEqual(esito.testo, 'Vedrete, la prossima è mia!');
  });

  it('cade sul template se il provider fallisce', async () => {
    const provider = providerFinto([new Error('Groq non risponde')]);
    const esito = await generaMessaggioChat(DATI, provider);
    strictEqual(esito.fonte, 'template');
  });

  it('cade sul template se il provider risponde vuoto', async () => {
    const provider = providerFinto(['   ']);
    const esito = await generaMessaggioChat(DATI, provider);
    strictEqual(esito.fonte, 'template');
  });
});

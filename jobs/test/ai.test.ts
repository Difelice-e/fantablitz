/**
 * Test dello strato AI (SPEC 8): provider, cronaca, editoriale.
 *
 * Niente chiamate di rete vere: un `ProviderAI` finto basta a esercitare la
 * logica di validazione, ritentativo e fallback, che e' quello che conta
 * davvero (il testo che arriva da Groq per davvero non e' deterministico, e
 * un test che lo confrontasse a un valore fisso si romperebbe da solo).
 */

import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cronacaValida, generaCronaca, marcatori, type DatiCronaca } from '../src/ai/cronaca.ts';
import { generaEditoriale, type DatiEditoriale } from '../src/ai/editoriale.ts';
import { providerGroq, type ProviderAI } from '../src/ai/provider.ts';

/* ------------------------------------------------------------------ */

function providerFinto(risposte: (string | Error)[]): ProviderAI & { chiamate: number } {
  const stato = { chiamate: 0 };
  return {
    get chiamate() { return stato.chiamate; },
    async genera() {
      const risposta = risposte[stato.chiamate] ?? risposte.at(-1)!;
      stato.chiamate++;
      if (risposta instanceof Error) throw risposta;
      return risposta;
    },
  };
}

const PARTITA: DatiCronaca = {
  casa: 'Alfa', ospite: 'Beta', golCasa: 2, golOspite: 1,
  eventi: [
    { minuto: 12, tipo: 'gol', giocatore: 'Mario Rossi', squadra: 'Alfa' },
    { minuto: 40, tipo: 'ammonizione', giocatore: 'Luigi Bianchi', squadra: 'Beta' },
    { minuto: 55, tipo: 'rigoreSegnato', giocatore: 'Mario Rossi', squadra: 'Alfa' },
    { minuto: 80, tipo: 'gol', giocatore: 'Paolo Verdi', squadra: 'Beta' },
  ],
};

describe('marcatori e cronacaValida', () => {
  it('elenca chi ha segnato, rigori e autogol compresi', () => {
    deepStrictEqual(marcatori(PARTITA), ['Mario Rossi', 'Mario Rossi', 'Paolo Verdi']);
  });

  it('accetta un testo col risultato esatto e tutti i marcatori', () => {
    ok(cronacaValida('Ad Alfa basta un 2-1 su Beta grazie a Mario Rossi e Paolo Verdi.', PARTITA));
  });

  it('rifiuta un risultato sbagliato', () => {
    ok(!cronacaValida('Finisce 3-1 per Alfa, a segno Mario Rossi e Paolo Verdi.', PARTITA));
  });

  it('rifiuta un testo che dimentica un marcatore', () => {
    ok(!cronacaValida('Alfa vince 2-1 su Beta grazie a Mario Rossi.', PARTITA));
  });
});

describe('generaCronaca', () => {
  it('senza provider usa subito il template', async () => {
    const esito = await generaCronaca(PARTITA, null);
    strictEqual(esito.fonte, 'template');
    ok(cronacaValida(esito.testo, PARTITA), 'anche il template deve passare la propria validazione');
  });

  it('usa il testo del provider quando e’ valido al primo colpo', async () => {
    const provider = providerFinto(['Alfa 2-1 Beta: doppietta di Mario Rossi, gol di Paolo Verdi.']);
    const esito = await generaCronaca(PARTITA, provider);
    strictEqual(esito.fonte, 'ai');
    strictEqual(provider.chiamate, 1);
  });

  it('ritenta una volta se il primo testo non e’ valido', async () => {
    const provider = providerFinto([
      'Finisce 9-9, che partita pazza.', // risultato sbagliato
      'Alfa 2-1 Beta: a segno Mario Rossi e Paolo Verdi.',
    ]);
    const esito = await generaCronaca(PARTITA, provider);
    strictEqual(esito.fonte, 'ai');
    strictEqual(provider.chiamate, 2);
  });

  it('dopo due tentativi non validi cade sul template', async () => {
    const provider = providerFinto(['testo senza risultato', 'ancora senza risultato']);
    const esito = await generaCronaca(PARTITA, provider);
    strictEqual(esito.fonte, 'template');
    strictEqual(provider.chiamate, 2);
  });

  it('se il provider lancia un errore, ritenta e poi cade sul template', async () => {
    const provider = providerFinto([new Error('Groq non risponde'), new Error('ancora giu’')]);
    const esito = await generaCronaca(PARTITA, provider);
    strictEqual(esito.fonte, 'template');
  });
});

/* ------------------------------------------------------------------ */

const GIORNATA: DatiEditoriale = {
  giornata: 3,
  classifica: [{ squadra: 'Alfa', punti: 6 }, { squadra: 'Beta', punti: 3 }],
  risultati: [{ casa: 'Alfa', ospite: 'Beta', fantapuntiCasa: 70, fantapuntiOspite: 60 }],
  migliore: { squadra: 'Alfa', fantapunti: 70 },
  peggiore: { squadra: 'Beta', fantapunti: 60 },
};

describe('generaEditoriale', () => {
  it('senza provider usa il template, e cita chi ha fatto meglio e peggio', async () => {
    const esito = await generaEditoriale(GIORNATA, null);
    strictEqual(esito.fonte, 'template');
    ok(esito.testo.includes('Alfa'));
    ok(esito.testo.includes('Beta'));
  });

  it('usa il provider quando risponde con del testo', async () => {
    const provider = providerFinto(['Che giornata per Alfa, mentre Beta resta a guardare.']);
    const esito = await generaEditoriale(GIORNATA, provider);
    strictEqual(esito.fonte, 'ai');
  });

  it('cade sul template se il provider fallisce', async () => {
    const provider = providerFinto([new Error('Groq non risponde')]);
    const esito = await generaEditoriale(GIORNATA, provider);
    strictEqual(esito.fonte, 'template');
  });
});

/* ------------------------------------------------------------------ */

describe('providerGroq', () => {
  it('manda il messaggio giusto e legge la risposta', async () => {
    const originale = globalThis.fetch;
    let corpoInviato: any = null;
    let intestazioni: Record<string, string> | undefined;
    globalThis.fetch = (async (url: string, opzioni: RequestInit) => {
      corpoInviato = JSON.parse(opzioni.body as string);
      intestazioni = opzioni.headers as Record<string, string>;
      return new Response(JSON.stringify({ choices: [{ message: { content: '  Ciao  ' } }] }), { status: 200 });
    }) as typeof fetch;

    try {
      const provider = providerGroq('chiave-di-prova', 'un-modello');
      const testo = await provider.genera([{ ruolo: 'system', testo: 'istruzioni' }]);
      strictEqual(testo, 'Ciao', 'il testo va ripulito dagli spazi');
      strictEqual(corpoInviato.model, 'un-modello');
      strictEqual(corpoInviato.messages[0].role, 'system');
      ok(intestazioni?.authorization?.includes('chiave-di-prova'));
    } finally {
      globalThis.fetch = originale;
    }
  });

  it('un errore HTTP diventa un errore leggibile', async () => {
    const originale = globalThis.fetch;
    globalThis.fetch = (async () => new Response('accesso negato', { status: 401 })) as typeof fetch;
    try {
      const provider = providerGroq('chiave-sbagliata', 'un-modello');
      await provider.genera([{ ruolo: 'user', testo: 'ciao' }]).then(
        () => { throw new Error('doveva fallire'); },
        (errore) => ok(String(errore).includes('401')),
      );
    } finally {
      globalThis.fetch = originale;
    }
  });
});

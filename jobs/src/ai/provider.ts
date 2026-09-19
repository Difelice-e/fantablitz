/**
 * Il provider AI (SPEC 8, regola architetturale 4): un contratto, non
 * un'implementazione unica. L'accesso al modello passa da qui, cosi' cambiare
 * provider — o non averne nessuno, in locale — e' una riga di configurazione,
 * mai una riscrittura dei generatori.
 */

export type MessaggioAI = { ruolo: 'system' | 'user'; testo: string };

export type ProviderAI = {
  genera(messaggi: readonly MessaggioAI[]): Promise<string>;
};

/**
 * Groq, piano gratuito (SPEC 8). L'endpoint e' compatibile con l'API di
 * OpenAI, quindi non serve una libreria in piu': `fetch` basta.
 */
export function providerGroq(chiave: string, modello: string): ProviderAI {
  return {
    async genera(messaggi) {
      const risposta = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${chiave}`,
        },
        body: JSON.stringify({
          model: modello,
          messages: messaggi.map((m) => ({ role: m.ruolo, content: m.testo })),
          temperature: 0.7,
          // Un pezzo di 4-6 frasi in italiano non ha bisogno di piu' di
          // questo: tenerlo basso aiuta anche il budget di token al minuto
          // del piano gratuito, che e' il limite stretto (vedi narrativa.ts).
          max_tokens: 350,
        }),
      });

      if (!risposta.ok) {
        throw new Error(`Groq ha risposto ${risposta.status}: ${(await risposta.text()).slice(0, 300)}`);
      }

      const dati = (await risposta.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const testo = dati.choices?.[0]?.message?.content?.trim();
      if (!testo) throw new Error('Groq non ha restituito testo');
      return testo;
    },
  };
}

const MODELLO_PREDEFINITO = 'openai/gpt-oss-20b';

/**
 * Il provider giusto secondo l'ambiente: senza chiave, `null`. E' lo stesso
 * pattern di `archivioDallAmbiente` — senza Groq configurato tutto continua a
 * funzionare, solo col fallback da template (SPEC 8: "se il provider e'
 * irraggiungibile, la giornata si gioca lo stesso").
 */
export function providerDallAmbiente(ambiente: Record<string, string | undefined>): ProviderAI | null {
  const chiave = ambiente['GROQ_API_KEY'];
  if (!chiave) return null;
  return providerGroq(chiave, ambiente['GROQ_MODEL'] || MODELLO_PREDEFINITO);
}

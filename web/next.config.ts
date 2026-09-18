import type { NextConfig } from 'next';

// Un solo `.env`, nella radice del progetto. Next.js legge solo il proprio, ma
// il sito e i job devono vedere le stesse variabili: due file finirebbero per
// divergere, e il bug si manifesterebbe solo in produzione.
try {
  process.loadEnvFile(new URL('../.env', import.meta.url).pathname);
} catch {
  // In produzione le variabili arrivano dall'ambiente e il file non esiste.
}

/**
 * Configurazione minima. Non c'e' nessun plugin e nessun trasformatore in piu':
 * `/engine` e `/fanta` sono TypeScript puro e Next li compila come compila il
 * resto dell'app.
 */
const config: NextConfig = {
  typedRoutes: true,

  // Il mondo simulato si legge a runtime con un percorso calcolato, e il
  // tracciamento automatico dei file non riesce a seguirlo: senza questa riga
  // il pacchetto pubblicato non conterrebbe il seed, e il sito online
  // risponderebbe "file non trovato" a ogni pagina mentre in locale funziona
  // tutto. E' il classico errore che si scopre solo dopo il primo deploy.
  outputFileTracingRoot: new URL('..', import.meta.url).pathname,
  outputFileTracingIncludes: {
    '/**': [
      '../seed/out/mondo.json',
      '../seed/out/riferimenti-esterni.json',
      '../engine/config/*.json',
      '../fanta/config/*.json',
    ],
  },
};

export default config;

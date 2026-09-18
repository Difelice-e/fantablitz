import type { NextConfig } from 'next';

/**
 * Configurazione minima. Non c'e' nessun plugin e nessun trasformatore in piu':
 * `/engine` e `/fanta` sono TypeScript puro e Next li compila come compila il
 * resto dell'app.
 */
const config: NextConfig = {
  typedRoutes: true,
};

export default config;

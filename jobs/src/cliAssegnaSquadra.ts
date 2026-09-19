/**
 * Assegna una squadra a una mail: e' l'invito (regola 8).
 *
 * Le policy RLS confrontano la mail di chi si e' autenticato con
 * `squadre.proprietario`: senza questo comando quella colonna resta `null`
 * ovunque, e chi fa login non vede niente, nemmeno la propria squadra.
 *
 *   npm run assegna-squadra -- lega-degli-amici la-mia-squadra tizio@esempio.it
 *
 * "-" al posto della mail toglie l'assegnazione: la squadra torna un bot,
 * gestita dall'adattamento automatico e da nessuno a mano.
 *
 * Legge lo stesso .env del sito (un solo file per tutto, come da
 * .env.example): con Supabase configurato scrive li', altrimenti sul file
 * locale.
 */

import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { archivioSuFile } from './archivio.ts';
import { archivioDallAmbiente } from './archivioSupabase.ts';

const RADICE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

try {
  process.loadEnvFile(join(RADICE, '.env'));
} catch {
  // In CI, o senza .env, si lavora con quello che c'e' gia' nell'ambiente.
}

async function principale(): Promise<number> {
  const [legaId, squadraId, mailGrezza] = process.argv.slice(2);
  if (!legaId || !squadraId || !mailGrezza) {
    console.error('Uso: npm run assegna-squadra -- <legaId> <squadraId> <mail|->');
    return 1;
  }

  const archivio = archivioDallAmbiente(process.env, archivioSuFile(join(RADICE, 'dati', 'leghe')));

  const stato = await archivio.leggi(legaId);
  if (!stato) {
    console.error(`Lega sconosciuta: ${legaId}`);
    return 1;
  }

  const squadra = stato.squadre.find((s) => s.id === squadraId);
  if (!squadra) {
    console.error(
      `Squadra sconosciuta: ${squadraId}. In questa lega ci sono: ` +
        stato.squadre.map((s) => s.id).join(', '),
    );
    return 1;
  }

  const mail = mailGrezza === '-' ? null : mailGrezza;
  await archivio.scrivi({
    ...stato,
    squadre: stato.squadre.map((s) => (s.id === squadraId ? { ...s, proprietario: mail } : s)),
  });

  console.log(
    mail ? `${squadra.nome} assegnata a ${mail}.` : `${squadra.nome} torna un bot: nessun proprietario.`,
  );
  return 0;
}

principale().then(
  (codice) => { process.exitCode = codice; },
  (errore: unknown) => {
    console.error(`\nErrore: ${errore instanceof Error ? errore.message : String(errore)}`);
    process.exitCode = 1;
  },
);

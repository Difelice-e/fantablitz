/**
 * Il job serale: gioca la prossima giornata e salva.
 *
 *   npm run gioca -- lega-degli-amici
 *   npm run gioca -- lega-degli-amici --quante 3
 *
 * E' idempotente per costruzione, come chiede la regola 6, ma per una ragione
 * che vale la pena dire: l'unica cosa che questo comando scrive e'
 * `giornateGiocate`. I risultati non si salvano, si ricalcolano dal seme e
 * dalle formazioni, quindi non c'e' niente che possa essere scritto due volte.
 */

import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { providerDallAmbiente } from './ai/provider.ts';
import { archivioSuFile } from './archivio.ts';
import { caricaContesto, vistaStagione } from './lega.ts';
import { generaNarrativaGiornate } from './narrativa.ts';

const RADICE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

try {
  process.loadEnvFile(join(RADICE, '.env'));
} catch {
  // In CI, o senza .env, si lavora con quello che c'e' gia' nell'ambiente.
}

async function principale(): Promise<number> {
  const argv = process.argv.slice(2);
  let legaId = '';
  let quante = 1;
  let cartella = join(RADICE, 'dati', 'leghe');

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--quante') quante = Number(argv[++i]);
    else if (a === '--archivio') cartella = resolve(argv[++i] ?? '');
    else if (a.startsWith('--')) throw new Error(`Opzione sconosciuta: ${a}`);
    else legaId = a;
  }

  const archivio = archivioSuFile(cartella);

  if (legaId === '') {
    const leghe = await archivio.elenca();
    if (leghe.length === 0) {
      console.error('Nessuna lega in archivio. Creane una con "npm run crea-lega".');
      return 1;
    }
    console.error('Serve l’id della lega. Ce ne sono:');
    for (const l of leghe) console.error(`  ${l.id}  (${l.nome})`);
    return 1;
  }

  const stato = await archivio.leggi(legaId);
  if (!stato) {
    console.error(`Lega "${legaId}" non trovata in ${cartella}.`);
    return 1;
  }

  const contesto = await caricaContesto(RADICE);
  const totale = vistaStagione({ ...stato, giornateGiocate: 0 }, contesto).calendario.giornate.length;

  const da = stato.giornateGiocate + 1;
  const fino = Math.min(totale, stato.giornateGiocate + quante);
  if (da > totale) {
    console.log(`La stagione e’ finita: ${totale} giornate su ${totale}.`);
    return 0;
  }

  const aggiornato = { ...stato, giornateGiocate: fino };
  const vista = vistaStagione(aggiornato, contesto);
  await archivio.scrivi(aggiornato);

  const provider = providerDallAmbiente(process.env);
  await generaNarrativaGiornate(archivio, aggiornato, contesto, vista, provider, da, fino);

  for (const giornata of vista.giornate.filter((g) => g.numero >= da)) {
    console.log(`\nGIORNATA ${giornata.numero}`);
    for (const s of giornata.scontri) {
      console.log(
        `  ${s.casaId.padEnd(18)} ${s.golCasa}-${s.golOspite} ${s.ospiteId.padEnd(18)}` +
          `   (${s.fantapuntiCasa.toFixed(1)} - ${s.fantapuntiOspite.toFixed(1)})`,
      );
    }
  }

  console.log('\nCLASSIFICA');
  vista.classifica.forEach((r, i) => {
    console.log(
      `  ${String(i + 1).padStart(2)}. ${r.squadraId.padEnd(20)} ${String(r.punti).padStart(3)} pt` +
        `   ${r.golFatti}-${r.golSubiti}   ${r.fantapunti.toFixed(1)} fantapunti`,
    );
  });
  console.log(`\nGiocate ${fino} giornate su ${totale}.`);
  return 0;
}

principale().then(
  (codice) => { process.exitCode = codice; },
  (errore: unknown) => {
    console.error(`\nErrore: ${errore instanceof Error ? errore.message : String(errore)}`);
    process.exitCode = 1;
  },
);

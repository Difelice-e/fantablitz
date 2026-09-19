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
import { generaChatGiornate } from './chat.ts';
import { chiudiStagioniAttraversate } from './fineStagione.ts';
import { caricaContesto, vistaStagione } from './lega.ts';
import { generaNarrativaGiornate } from './narrativa.ts';
import { proponiScambiSpontanei } from './scambiSpontanei.ts';
import { giornatePerStagione, posizioneStagione } from './stagioni.ts';

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
  // Le stagioni si susseguono senza fine (SPEC 5.8): non c'e' piu' un
  // "totale" di giornate oltre cui fermarsi, solo la prossima stagione.
  const gps = giornatePerStagione(contesto.mondo);

  const da = stato.giornateGiocate + 1;
  const fino = stato.giornateGiocate + quante;

  const aggiornato = { ...stato, giornateGiocate: fino };
  await archivio.scrivi(aggiornato);

  const provider = providerDallAmbiente(process.env);
  await chiudiStagioniAttraversate(archivio, aggiornato, contesto, provider, da, fino);

  // Rilegge: chiudere una stagione puo' aver scritto l'albo d'oro e le voci
  // di mercato, e vista/narrativa/scambi/chat devono vederli aggiornati.
  const dopoChiusura = (await archivio.leggi(aggiornato.id))!;
  const vista = vistaStagione(dopoChiusura, contesto);

  await generaNarrativaGiornate(archivio, dopoChiusura, contesto, vista, provider, da, fino);
  await proponiScambiSpontanei(archivio, dopoChiusura, contesto, vista.mondo, contesto.scambi, da, fino);

  // Rilegge di nuovo: gli scambi spontanei possono aver cambiato `stato.scambi`,
  // e la chat deve vederli per reagire agli scambi appena conclusi.
  const conScambiFreschi = (await archivio.leggi(aggiornato.id))!;
  await generaChatGiornate(archivio, conScambiFreschi, contesto, vista, provider, da, fino);

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

  const posizione = posizioneStagione(fino, gps);
  console.log(
    `\nGiocate ${fino} giornate in totale: stagione ${posizione.stagione}, ` +
      `giornata ${posizione.giornataStagionale} di ${gps}.`,
  );
  if (dopoChiusura.alboDoro.length > 0) {
    console.log('\nALBO D’ORO');
    for (const v of dopoChiusura.alboDoro) {
      console.log(`  Stagione ${v.stagione}: ${v.campioneSquadraId} (${v.puntiCampione} pt)`);
    }
  }
  return 0;
}

principale().then(
  (codice) => { process.exitCode = codice; },
  (errore: unknown) => {
    console.error(`\nErrore: ${errore instanceof Error ? errore.message : String(errore)}`);
    process.exitCode = 1;
  },
);

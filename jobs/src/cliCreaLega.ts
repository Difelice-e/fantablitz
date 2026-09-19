/**
 * Crea una lega da un export di Fantalab e la salva nell'archivio.
 *
 *   npm run crea-lega -- fixtures/rose.csv --nome "Lega degli amici"
 *   npm run crea-lega -- rose.csv --modalita mantra --seme lega-2026
 *
 * E' il passo che oggi sostituisce l'asta nativa (fase 2): l'asta si fa su
 * Fantalab, si esporta, e da qui in poi la lega vive qui.
 */

import { resolve, dirname, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Modalita } from '../../fanta/src/tipi.ts';
import { archivioSuFile } from './archivio.ts';
import { caricaContesto, statoDaImport, vistaStagione } from './lega.ts';
import { contestoDaSeed, importaRose } from './importa.ts';

const RADICE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

type Opzioni = {
  file: string;
  id: string;
  nome: string;
  seme: string;
  modalita: Modalita;
  budget: number;
  archivio: string;
  amministratore: string | null;
};

/** Un id stabile e leggibile a partire dal nome. */
function identificativo(nome: string): string {
  const pulito = nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return pulito.length > 0 ? pulito : 'lega';
}

function leggiArgomenti(argv: string[]): Opzioni {
  const o: Opzioni = {
    file: '',
    id: '',
    nome: 'Lega',
    seme: '',
    modalita: 'classic',
    budget: 500,
    archivio: join(RADICE, 'dati', 'leghe'),
    amministratore: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const valore = (): string => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`L’opzione ${a} richiede un valore`);
      return v;
    };
    switch (a) {
      case '--nome': o.nome = valore(); break;
      case '--id': o.id = valore(); break;
      case '--seme': o.seme = valore(); break;
      case '--budget': o.budget = Number(valore()); break;
      case '--archivio': o.archivio = resolve(valore()); break;
      case '--amministratore': o.amministratore = valore(); break;
      case '--modalita': {
        const m = valore();
        if (m !== 'classic' && m !== 'mantra') throw new Error(`Modalita’ sconosciuta: ${m}`);
        o.modalita = m;
        break;
      }
      default:
        if (a.startsWith('--')) throw new Error(`Opzione sconosciuta: ${a}`);
        o.file = resolve(a);
    }
  }

  if (o.file === '') {
    throw new Error('Serve il file delle rose.\n  npm run crea-lega -- fixtures/rose.csv');
  }
  if (o.id === '') o.id = identificativo(o.nome);
  // Il seme decide il campionato: se non lo si sceglie, lo decide il nome, cosi'
  // ricreare la stessa lega da' lo stesso mondo.
  if (o.seme === '') o.seme = o.id;
  return o;
}

async function principale(): Promise<number> {
  const o = leggiArgomenti(process.argv.slice(2));
  const contesto = await caricaContesto(RADICE);
  const regole = contesto.regole[o.modalita];

  const importato = importaRose(
    await readFile(o.file, 'utf8'),
    contestoDaSeed(contesto.mondo, contesto.riferimenti, regole, { budget: o.budget }),
  );

  if (!importato.riuscito) {
    console.error('Le rose non si importano, la lega non si crea:\n');
    for (const e of importato.errori) console.error(`  [${e.tipo}] ${e.messaggio}`);
    return 1;
  }
  for (const a of importato.avvisi) console.warn(`  avviso: ${a.messaggio}`);

  const stato = statoDaImport(o, importato.squadre);
  const archivio = archivioSuFile(o.archivio);

  if (await archivio.leggi(stato.id)) {
    console.error(
      `Esiste gia’ una lega con id "${stato.id}" in ${o.archivio}.\n` +
        'Scegline un altro con --id, oppure cancella il file se vuoi ricominciare.',
    );
    return 1;
  }

  await archivio.scrivi(stato);

  // Una verifica che vale la pena fare subito: se la lega non riesce nemmeno a
  // schierare, meglio saperlo ora che alla prima giornata.
  const vista = vistaStagione(stato, contesto);

  console.log(`Lega "${stato.nome}" creata in ${join(o.archivio, `${stato.id}.json`)}`);
  console.log(`  modalita   ${stato.modalita}`);
  console.log(`  seme       ${stato.seme}`);
  console.log(`  squadre    ${stato.squadre.length}`);
  console.log(`  giornate   ${vista.calendario.giornate.length} in calendario, 0 giocate`);
  console.log('\nSquadre:');
  for (const s of importato.squadre) {
    console.log(`  ${s.nome.padEnd(20)} ${s.giocatori.length} giocatori, ${s.spesa} crediti spesi`);
  }
  console.log('\nOra si puo’ avviare il sito con "npm run dev".');
  return 0;
}

principale().then(
  (codice) => { process.exitCode = codice; },
  (errore: unknown) => {
    console.error(`\nErrore: ${errore instanceof Error ? errore.message : String(errore)}`);
    process.exitCode = 1;
  },
);

/**
 * Importazione delle rose da riga di comando.
 *
 *   npm run importa -- fixtures/rose.csv
 *   npm run importa -- fixtures/rose.csv --modalita mantra
 *   npm run importa -- rose.csv --scrivi out/rose.json
 *
 * Non scrive niente se l'import non riesce: l'atomicita' comincia da qui.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { regoleClassic, type ConfigurazioneClassic } from '../../fanta/src/classic.ts';
import { regoleMantra, type ConfigurazioneMantra } from '../../fanta/src/mantra.ts';
import type { Modalita } from '../../fanta/src/tipi.ts';
import { contestoDaSeed, importaRose, type RiferimentiEsterni } from './importa.ts';

const RADICE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

type Opzioni = {
  file: string;
  modalita: Modalita;
  budget: number;
  squadre: number | null;
  seed: string;
  scrivi: string | null;
};

function leggiArgomenti(argv: string[]): Opzioni {
  const o: Opzioni = {
    file: '',
    modalita: 'classic',
    budget: 500,
    squadre: null,
    seed: join(RADICE, 'seed', 'out'),
    scrivi: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const valore = (): string => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`L’opzione ${a} richiede un valore`);
      return v;
    };
    switch (a) {
      case '--modalita': {
        const m = valore();
        if (m !== 'classic' && m !== 'mantra') throw new Error(`Modalita’ sconosciuta: ${m}`);
        o.modalita = m;
        break;
      }
      case '--budget': o.budget = Number(valore()); break;
      case '--squadre': o.squadre = Number(valore()); break;
      case '--seed': o.seed = resolve(valore()); break;
      case '--scrivi': o.scrivi = resolve(valore()); break;
      default:
        if (a.startsWith('--')) throw new Error(`Opzione sconosciuta: ${a}`);
        if (o.file !== '') throw new Error('Indicare un solo file da importare');
        o.file = resolve(a);
    }
  }

  if (o.file === '') {
    throw new Error(
      'Serve il file da importare.\n' +
        '  npm run importa -- fixtures/rose.csv [--modalita mantra] [--budget 500]',
    );
  }
  if (!Number.isFinite(o.budget) || o.budget <= 0) throw new Error('--budget vuole un numero positivo');
  return o;
}

const json = async (percorso: string): Promise<any> => JSON.parse(await readFile(percorso, 'utf8'));

/* ------------------------------------------------------------------ */

async function principale(): Promise<number> {
  const opzioni = leggiArgomenti(process.argv.slice(2));

  const mondo = await json(join(opzioni.seed, 'mondo.json'));
  const riferimenti = (await json(join(opzioni.seed, 'riferimenti-esterni.json'))) as RiferimentiEsterni;

  const regole =
    opzioni.modalita === 'mantra'
      ? regoleMantra((await json(join(RADICE, 'fanta', 'config', 'mantra.json'))) as ConfigurazioneMantra)
      : regoleClassic((await json(join(RADICE, 'fanta', 'config', 'classic.json'))) as ConfigurazioneClassic);

  const contenuto = await readFile(opzioni.file, 'utf8');
  const esito = importaRose(
    contenuto,
    contestoDaSeed(mondo, riferimenti, regole, {
      budget: opzioni.budget,
      ...(opzioni.squadre !== null ? { squadreAttese: opzioni.squadre } : {}),
    }),
  );

  console.log(`File      ${opzioni.file}`);
  console.log(`Formato   ${esito.formato === 'completo' ? 'export completo' : 'export minimale'}`);
  console.log(`Modalita  ${opzioni.modalita}, budget ${opzioni.budget}`);
  console.log('');

  /* --- fallimento --------------------------------------------------- */

  if (!esito.riuscito) {
    console.error(`IMPORT NON ESEGUITO — ${esito.errori.length} problemi da risolvere.\n`);
    for (const e of esito.errori) {
      console.error(`  [${e.tipo}]${e.riga !== undefined ? ` riga ${e.riga}` : ''}: ${e.messaggio}`);
      if (e.rimedio) console.error(`      ${e.rimedio}`);
    }
    if (esito.avvisi.length > 0) {
      console.error(`\n  ${esito.avvisi.length} avvisi, che non bloccano ma vale la pena guardare:`);
      for (const a of esito.avvisi.slice(0, 10)) {
        console.error(`    riga ${a.riga}: ${a.messaggio}`);
      }
      if (esito.avvisi.length > 10) console.error(`    ... e altri ${esito.avvisi.length - 10}`);
    }
    console.error('\nNessuna rosa e’ stata importata: l’import e’ atomico.');
    return 1;
  }

  /* --- riuscito ----------------------------------------------------- */

  console.log(`IMPORT RIUSCITO — ${esito.squadre.length} squadre, ` +
    `${esito.squadre.reduce((a, s) => a + s.giocatori.length, 0)} giocatori.\n`);

  console.log('| squadra | giocatori | spesa | residui | moduli perfetti | adattati | non coperti |');
  console.log('|---|---:|---:|---:|---:|---:|---:|');
  for (const s of esito.squadre) {
    const per = (livello: string) => s.copertura.filter((c) => c.livello === livello).length;
    console.log(
      `| ${s.nome} | ${s.giocatori.length} | ${s.spesa} | ${s.creditiResidui} | ` +
        `${per('perfetta')} | ${per('adattata')} | ${per('impossibile')} |`,
    );
  }

  const parziali = esito.squadre.filter((s) => s.copertura.some((c) => c.livello !== 'perfetta'));
  if (parziali.length > 0) {
    console.log('\nCopertura parziale, modulo per modulo:');
    for (const s of parziali) {
      const dettaglio = s.copertura
        .filter((c) => c.livello !== 'perfetta')
        .map((c) => `${c.modulo} ${c.livello === 'adattata' ? `(${c.adattamenti} adattati)` : 'no'}`)
        .join(', ');
      console.log(`  ${s.nome}: ${dettaglio}`);
    }
  }

  if (esito.avvisi.length > 0) {
    console.log(`\n${esito.avvisi.length} avvisi:`);
    for (const a of esito.avvisi) console.log(`  riga ${a.riga}: ${a.messaggio}`);
  }

  if (opzioni.scrivi) {
    await mkdir(dirname(opzioni.scrivi), { recursive: true });
    await writeFile(opzioni.scrivi, `${JSON.stringify(esito.squadre, null, 2)}\n`);
    console.log(`\nRose scritte in ${opzioni.scrivi}`);
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

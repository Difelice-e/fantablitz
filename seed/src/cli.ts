/**
 * Milestone 0: converte il listone .xlsx nel seed del mondo simulato.
 *
 *   node --experimental-strip-types src/cli.ts [opzioni]
 *   npm run seed -- [opzioni]
 *
 * Opzioni
 *   --listone <file>     listone di partenza (default: il .xlsx in questa cartella)
 *   --config <cartella>  cartella di configurazione (default: ./config)
 *   --out <cartella>     dove scrivere il seed (default: ./out)
 *   --stagione <2026-27> etichetta della stagione (default: dedotta dal nome del file)
 *   --anonimizza         sostituisce i nomi reali con nomi inventati
 *   --controlla          non scrive nulla, verifica che il seed su disco sia aggiornato
 */

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leggiListone } from './listone.ts';
import { leggiConfigurazione } from './configurazione.ts';
import { costruisciSeed, impronta } from './costruisci.ts';
import { scriviRapporto } from './rapporto.ts';

const RADICE = resolve(dirname(fileURLToPath(import.meta.url)), '..');

type Opzioni = {
  listone: string | null;
  config: string;
  out: string;
  stagione: string | null;
  anonimizza: boolean;
  controlla: boolean;
};

function leggiArgomenti(argv: string[]): Opzioni {
  const opzioni: Opzioni = {
    listone: null,
    config: join(RADICE, 'config'),
    out: join(RADICE, 'out'),
    stagione: null,
    anonimizza: false,
    controlla: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const argomento = argv[i]!;
    const valore = (): string => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`L’opzione ${argomento} richiede un valore`);
      return v;
    };
    switch (argomento) {
      case '--listone': opzioni.listone = resolve(valore()); break;
      case '--config': opzioni.config = resolve(valore()); break;
      case '--out': opzioni.out = resolve(valore()); break;
      case '--stagione': opzioni.stagione = valore(); break;
      case '--anonimizza': opzioni.anonimizza = true; break;
      case '--controlla': opzioni.controlla = true; break;
      default: throw new Error(`Opzione sconosciuta: ${argomento}`);
    }
  }
  return opzioni;
}

/** Trova l'unico listone presente nella cartella `seed/`, se non e' indicato. */
async function trovaListone(): Promise<string> {
  const candidati = (await readdir(RADICE))
    .filter((f) => f.toLowerCase().startsWith('quotazioni') && f.toLowerCase().endsWith('.xlsx'))
    .sort();
  if (candidati.length === 0) {
    throw new Error(
      `Nessun listone trovato in ${RADICE}. Copia li’ il file ` +
        '"Quotazioni_Fantacalcio_Stagione_AAAA_AA.xlsx" oppure indicalo con --listone.',
    );
  }
  if (candidati.length > 1) {
    throw new Error(
      `Piu’ listoni presenti in ${RADICE} (${candidati.join(', ')}): ` +
        'indica quale usare con --listone.',
    );
  }
  return join(RADICE, candidati[0]!);
}

/** "..._Stagione_2026_27.xlsx" diventa "2026-27". */
function stagioneDaNomeFile(percorso: string): string {
  const trovato = /(\d{4})[_-](\d{2,4})/.exec(percorso);
  if (!trovato) {
    throw new Error(
      `Impossibile dedurre la stagione dal nome "${percorso}": indicala con --stagione.`,
    );
  }
  return `${trovato[1]}-${trovato[2]!.slice(-2)}`;
}

/** JSON stabile: stessa configurazione, stesso file, byte per byte. */
function serializza(valore: unknown): string {
  return `${JSON.stringify(valore, null, 2)}\n`;
}

async function principale(): Promise<number> {
  const opzioni = leggiArgomenti(process.argv.slice(2));
  const percorsoListone = opzioni.listone ?? (await trovaListone());
  const stagione = opzioni.stagione ?? stagioneDaNomeFile(percorsoListone);

  const contenuto = await readFile(percorsoListone);
  const listone = leggiListone(contenuto);
  const configurazione = await leggiConfigurazione(opzioni.config);

  const { mondo, riferimenti, avvisi } = costruisciSeed(listone, configurazione, {
    stagione,
    improntaListone: impronta(contenuto),
    anonimizza: opzioni.anonimizza,
  });

  const file: [string, string][] = [
    ['mondo.json', serializza(mondo)],
    ['riferimenti-esterni.json', serializza(riferimenti)],
    ['RAPPORTO.md', `${scriviRapporto(mondo, avvisi)}`],
  ];

  if (opzioni.controlla) {
    const differenti: string[] = [];
    for (const [nome, atteso] of file) {
      const trovato = await readFile(join(opzioni.out, nome), 'utf8').catch(() => null);
      if (trovato !== atteso) differenti.push(nome);
    }
    if (differenti.length > 0) {
      console.error(
        `Il seed su disco non corrisponde a quello che genererebbe la configurazione ` +
          `attuale: ${differenti.join(', ')}.\nRigenera con "npm run seed".`,
      );
      return 1;
    }
    console.log('Seed aggiornato: nessuna differenza.');
    return 0;
  }

  await mkdir(opzioni.out, { recursive: true });
  for (const [nome, contenutoFile] of file) await writeFile(join(opzioni.out, nome), contenutoFile);

  /* --- riepilogo a schermo ------------------------------------------ */

  console.log(`Listone   ${percorsoListone}`);
  console.log(`Stagione  ${stagione}`);
  console.log(
    `Letti     ${listone.giocatori.length} giocatori, ${mondo.club.length} club, ` +
      `${listone.ceduti.length} ceduti esclusi dal listone`,
  );
  if (opzioni.anonimizza) console.log('Nomi      sostituiti con nomi di fantasia');
  console.log(`Scritti   ${file.map(([n]) => n).join(', ')} in ${opzioni.out}`);

  if (avvisi.length > 0) {
    console.log(`\n${avvisi.length} avvisi:`);
    for (const a of avvisi) console.log(`  [${a.tipo}] ${a.messaggio}`);
  }
  console.log('\nApri out/RAPPORTO.md per controllare il risultato a occhio.');
  return 0;
}

principale().then(
  (codice) => { process.exitCode = codice; },
  (errore: unknown) => {
    console.error(`\nErrore: ${errore instanceof Error ? errore.message : String(errore)}`);
    process.exitCode = 1;
  },
);

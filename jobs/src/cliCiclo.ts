/**
 * Esecuzione del ciclo da riga di comando.
 *
 *   npm run ciclo -- fixtures/rose.csv
 *   npm run ciclo -- fixtures/rose.csv --giornate 5
 *   npm run ciclo -- fixtures/rose.csv --modalita mantra --seme lega-degli-amici
 *
 * Serve a vedere una stagione di lega giocata per intero prima che esista una
 * sola schermata, come chiede `CLAUDE.md`.
 */

import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { caricaMondo, indicizza } from '../../engine/src/mondo.ts';
import {
  validaParametriMotore, validaParametriVoto,
  type ParametriMotore, type ParametriVoto,
} from '../../engine/src/configurazione.ts';
import { regoleClassic, type ConfigurazioneClassic } from '../../fanta/src/classic.ts';
import { regoleMantra, type ConfigurazioneMantra } from '../../fanta/src/mantra.ts';
import { validaConfigurazioneLega, type ConfigurazioneLega } from '../../fanta/src/fantavoto.ts';
import { miglioreDisposizione } from '../../fanta/src/schieramento.ts';
import type { Modalita, Schierabile } from '../../fanta/src/tipi.ts';
import { eseguiCiclo, type Lega, type SquadraFanta } from './ciclo.ts';
import { contestoDaSeed, importaRose, type RiferimentiEsterni } from './importa.ts';

const RADICE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const json = async (p: string): Promise<any> => JSON.parse(await readFile(p, 'utf8'));

type Opzioni = {
  file: string;
  modalita: Modalita;
  seme: string;
  giornate: number | null;
  budget: number;
};

function leggiArgomenti(argv: string[]): Opzioni {
  const o: Opzioni = { file: '', modalita: 'classic', seme: 'lega', giornate: null, budget: 500 };
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
      case '--seme': o.seme = valore(); break;
      case '--giornate': o.giornate = Number(valore()); break;
      case '--budget': o.budget = Number(valore()); break;
      default:
        if (a.startsWith('--')) throw new Error(`Opzione sconosciuta: ${a}`);
        o.file = resolve(a);
    }
  }
  if (o.file === '') {
    throw new Error('Serve il file delle rose.\n  npm run ciclo -- fixtures/rose.csv');
  }
  return o;
}

async function principale(): Promise<number> {
  const o = leggiArgomenti(process.argv.slice(2));

  const mondo = indicizza(caricaMondo(await json(join(RADICE, 'seed', 'out', 'mondo.json'))));
  const riferimenti = (await json(
    join(RADICE, 'seed', 'out', 'riferimenti-esterni.json'),
  )) as RiferimentiEsterni;
  const motore = validaParametriMotore(
    (await json(join(RADICE, 'engine', 'config', 'motore.json'))) as ParametriMotore,
  );
  const voto = validaParametriVoto(
    (await json(join(RADICE, 'engine', 'config', 'voto.json'))) as ParametriVoto,
  );
  const configurazione = validaConfigurazioneLega(
    (await json(join(RADICE, 'fanta', 'config', 'lega.json'))) as ConfigurazioneLega,
  );
  const regole =
    o.modalita === 'mantra'
      ? regoleMantra((await json(join(RADICE, 'fanta', 'config', 'mantra.json'))) as ConfigurazioneMantra)
      : regoleClassic((await json(join(RADICE, 'fanta', 'config', 'classic.json'))) as ConfigurazioneClassic);

  /* --- rose ---------------------------------------------------------- */

  const importato = importaRose(
    await readFile(o.file, 'utf8'),
    contestoDaSeed(mondo, riferimenti, regole, { budget: o.budget }),
  );
  if (!importato.riuscito) {
    console.error('Le rose non si importano, il ciclo non parte:\n');
    for (const e of importato.errori) console.error(`  [${e.tipo}] ${e.messaggio}`);
    return 1;
  }

  const perId = new Map(mondo.giocatori.map((g) => [g.id, g as Schierabile]));
  const squadre: SquadraFanta[] = importato.squadre.map((s) => {
    const rosa = s.giocatori.map((g) => perId.get(g.giocatoreId)!).filter(Boolean);
    // Formazione di partenza: la migliore che la rosa esprime. Da qui in poi e'
    // persistente, e il ciclo la adatta da solo.
    const scelta = miglioreDisposizione(rosa, regole)!;
    const titolari = new Set(scelta.titolari.values());
    return {
      id: s.nome,
      nome: s.nome,
      rosa,
      formazione: {
        modulo: scelta.modulo.nome,
        titolari: scelta.titolari,
        panchina: rosa.filter((g) => !titolari.has(g.id)).map((g) => g.id),
      },
    };
  });

  const lega: Lega = { squadre, regole, configurazione };

  // Gli identificativi interni sono opachi apposta, ma un rapporto che dice
  // "g55408c521f -> g309bf1574d" non lo legge nessuno.
  const nomePerId = new Map(mondo.giocatori.map((g) => [g.id, g.nome]));
  const nome = (id: string): string => nomePerId.get(id) ?? id;

  /* --- ciclo --------------------------------------------------------- */

  const inizio = Date.now();
  const esito = eseguiCiclo(mondo, motore, voto, lega, {
    seme: o.seme,
    ...(o.giornate !== null ? { quante: o.giornate } : {}),
  });
  const secondi = (Date.now() - inizio) / 1000;

  console.log(`Lega      ${o.seme}, modalita ${o.modalita}`);
  console.log(`Giocate   ${esito.giornate.length} giornate in ${secondi.toFixed(1)}s\n`);

  console.log('CLASSIFICA');
  console.log('|  # | squadra | pt | G | V | N | P | GF | GS | fantapunti | media |');
  console.log('|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  esito.classifica.forEach((r, i) => {
    const media = r.giocate > 0 ? r.fantapunti / r.giocate : 0;
    console.log(
      `| ${i + 1} | ${r.squadraId} | ${r.punti} | ${r.giocate} | ${r.vinte} | ` +
        `${r.pareggiate} | ${r.perse} | ${r.golFatti} | ${r.golSubiti} | ` +
        `${r.fantapunti.toFixed(1)} | ${media.toFixed(1)} |`,
    );
  });

  /* --- una giornata a campione --------------------------------------- */

  const ultima = esito.giornate[esito.giornate.length - 1];
  if (ultima) {
    console.log(`\nGIORNATA ${ultima.numero}`);
    for (const s of ultima.scontri) {
      console.log(
        `  ${s.casaId} ${s.golCasa}-${s.golOspite} ${s.ospiteId}` +
          `   (${s.fantapuntiCasa.toFixed(1)} - ${s.fantapuntiOspite.toFixed(1)})`,
      );
    }

    const conCambi = ultima.squadre.filter((s) => s.cambi.length > 0);
    if (conCambi.length > 0) {
      console.log('\n  Sostituzioni automatiche:');
      for (const s of conCambi) {
        const elenco = s.cambi.map((c) => `${nome(c.esce)} -> ${nome(c.entra)}`).join(', ');
        console.log(`    ${s.squadraId}: ${elenco}`);
      }
    }

    const scoperti = ultima.squadre.filter((s) => s.punteggio.senzaVoto.length > 0);
    if (scoperti.length > 0) {
      console.log('\n  Titolari rimasti senza voto, che valgono zero:');
      for (const s of scoperti) {
        console.log(`    ${s.squadraId}: ${s.punteggio.senzaVoto.map(nome).join(', ')}`);
      }
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

/**
 * Script di calibrazione.
 *
 * Simula centinaia di stagioni e riporta le metriche che decidono se il
 * campionato e' credibile: media gol a partita, distribuzione dei voti,
 * infortuni, cartellini e minuti per squadra.
 *
 * Non e' un lusso. Un campionato sbilanciato scoperto dopo tre settimane di
 * gioco costa molto piu' di un giorno di taratura, e una volta che la lega e'
 * partita i numeri non si possono piu' cambiare senza falsare la stagione.
 *
 *   npm run calibra                      # 30 stagioni
 *   npm run calibra -- --stagioni 300    # piu' precisione, piu' tempo
 *   npm run calibra -- --standardizzazione
 *       stampa media e deviazione dell'indice di ruolo da incollare in
 *       config/voto.json. Da rifare ogni volta che cambiano i pesi.
 */

import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { caricaMondo, indicizza, type MondoIndicizzato } from './mondo.ts';
import {
  validaParametriMotore,
  validaParametriVoto,
  type ParametriMotore,
  type ParametriVoto,
} from './configurazione.ts';
import { simulaStagione, type StagioneSimulata } from './stagione.ts';
import { indiceDiRuolo } from './voto.ts';
import { gruppoDi, GRUPPI_RUOLO, type GruppoRuolo } from './ruoli.ts';

const RADICE = resolve(dirname(fileURLToPath(import.meta.url)), '..');

type Opzioni = {
  stagioni: number;
  seme: string;
  mondo: string;
  standardizzazione: boolean;
};

function leggiArgomenti(argv: string[]): Opzioni {
  const o: Opzioni = {
    stagioni: 30,
    seme: 'calibrazione',
    mondo: join(RADICE, '..', 'seed', 'out', 'mondo.json'),
    standardizzazione: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const valore = (): string => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`L’opzione ${a} richiede un valore`);
      return v;
    };
    switch (a) {
      case '--stagioni': o.stagioni = Number(valore()); break;
      case '--seme': o.seme = valore(); break;
      case '--mondo': o.mondo = resolve(valore()); break;
      case '--standardizzazione': o.standardizzazione = true; break;
      default: throw new Error(`Opzione sconosciuta: ${a}`);
    }
  }
  if (!Number.isInteger(o.stagioni) || o.stagioni < 1) {
    throw new Error('--stagioni vuole un intero positivo');
  }
  return o;
}

/* ------------------------------------------------------------------ */
/* Raccolta delle metriche                                             */
/* ------------------------------------------------------------------ */

type Accumulatore = {
  partite: number;
  gol: number;
  golCasa: number;
  vittorieCasa: number;
  pareggi: number;
  votiPerGruppo: Map<GruppoRuolo, number[]>;
  voti: number[];
  senzaVoto: number;
  valutazioni: number;
  ammonizioni: number;
  espulsioni: number;
  infortuni: number;
  indiciPerGruppo: Map<GruppoRuolo, number[]>;
  minutiPerClub: Map<string, number[]>;
  puntiPerClub: Map<string, number[]>;
  golPerClub: Map<string, number[]>;
};

function accumulatoreVuoto(): Accumulatore {
  return {
    partite: 0, gol: 0, golCasa: 0, vittorieCasa: 0, pareggi: 0,
    votiPerGruppo: new Map(GRUPPI_RUOLO.map((g) => [g, []])),
    voti: [], senzaVoto: 0, valutazioni: 0,
    ammonizioni: 0, espulsioni: 0, infortuni: 0,
    indiciPerGruppo: new Map(GRUPPI_RUOLO.map((g) => [g, []])),
    minutiPerClub: new Map(), puntiPerClub: new Map(), golPerClub: new Map(),
  };
}

function raccogli(
  acc: Accumulatore,
  stagione: StagioneSimulata,
  mondo: MondoIndicizzato,
  voto: ParametriVoto,
): void {
  for (const p of stagione.partite) {
    acc.partite++;
    acc.gol += p.golCasa + p.golOspite;
    acc.golCasa += p.golCasa;
    if (p.golCasa > p.golOspite) acc.vittorieCasa++;
    else if (p.golCasa === p.golOspite) acc.pareggi++;

    for (const pr of p.prestazioni) {
      const giocatore = mondo.giocatorePerId.get(pr.giocatoreId);
      if (!giocatore) continue;
      const gruppo = gruppoDi(giocatore);

      acc.valutazioni++;
      if (pr.voto === null) acc.senzaVoto++;
      else {
        acc.voti.push(pr.voto);
        acc.votiPerGruppo.get(gruppo)!.push(pr.voto);
      }
      if (pr.ammonito) acc.ammonizioni++;
      if (pr.espulso) acc.espulsioni++;

      // L'indice riportato a novanta minuti: e' la grandezza che va
      // standardizzata, quindi va misurata cosi' com'e' usata.
      if (pr.minuti >= voto.minuti.sogliaGiudizioPieno) {
        acc.indiciPerGruppo
          .get(gruppo)!
          .push((indiceDiRuolo(gruppo, pr.statistiche, voto) * 90) / pr.minuti);
      }
    }

    for (const e of p.eventi) if (e.tipo === 'infortunio') acc.infortuni++;
  }

  for (const riga of stagione.classifica) {
    if (!acc.puntiPerClub.has(riga.clubId)) {
      acc.puntiPerClub.set(riga.clubId, []);
      acc.golPerClub.set(riga.clubId, []);
      acc.minutiPerClub.set(riga.clubId, []);
    }
    acc.puntiPerClub.get(riga.clubId)!.push(riga.punti);
    acc.golPerClub.get(riga.clubId)!.push(riga.golFatti);
  }

  for (const c of mondo.club) {
    const rosa = mondo.rosaPerClub.get(c.id) ?? [];
    const usati = rosa.filter((g) => (stagione.stati.giocatori.get(g.id)?.minutiStagione ?? 0) > 0);
    acc.minutiPerClub.get(c.id)!.push(usati.length);
  }
}

/* ------------------------------------------------------------------ */
/* Statistica di supporto                                              */
/* ------------------------------------------------------------------ */

const media = (v: readonly number[]): number =>
  v.length === 0 ? 0 : v.reduce((a, b) => a + b, 0) / v.length;

const deviazione = (v: readonly number[]): number => {
  if (v.length < 2) return 0;
  const m = media(v);
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length);
};

const quota = (v: readonly number[], test: (x: number) => boolean): number =>
  v.length === 0 ? 0 : v.filter(test).length / v.length;

const d2 = (v: number) => v.toFixed(2);
const d3 = (v: number) => v.toFixed(3);

/** Riga di verdetto: verde se dentro il bersaglio, altrimenti indica da che parte sbaglia. */
function verdetto(valore: number, minimo: number, massimo: number): string {
  if (valore < minimo) return `BASSO (atteso ${d2(minimo)}-${d2(massimo)})`;
  if (valore > massimo) return `ALTO (atteso ${d2(minimo)}-${d2(massimo)})`;
  return 'ok';
}

/* ------------------------------------------------------------------ */

async function principale(): Promise<number> {
  const opzioni = leggiArgomenti(process.argv.slice(2));

  const mondo = indicizza(caricaMondo(JSON.parse(await readFile(opzioni.mondo, 'utf8'))));
  const motore = validaParametriMotore(
    JSON.parse(await readFile(join(RADICE, 'config', 'motore.json'), 'utf8')) as ParametriMotore,
  );
  const voto = validaParametriVoto(
    JSON.parse(await readFile(join(RADICE, 'config', 'voto.json'), 'utf8')) as ParametriVoto,
  );

  const acc = accumulatoreVuoto();
  const inizio = Date.now();

  for (let i = 0; i < opzioni.stagioni; i++) {
    const stagione = simulaStagione(mondo, motore, voto, { seme: `${opzioni.seme}-${i}` });
    raccogli(acc, stagione, mondo, voto);
  }

  const secondi = (Date.now() - inizio) / 1000;

  /* --- standardizzazione ------------------------------------------- */

  if (opzioni.standardizzazione) {
    console.log('Media e deviazione dell’indice di ruolo, da incollare in config/voto.json');
    console.log('sotto la chiave "standardizzazione":\n');
    const blocco: Record<string, { media: number; deviazione: number }> = {};
    for (const gruppo of GRUPPI_RUOLO) {
      const valori = acc.indiciPerGruppo.get(gruppo)!;
      blocco[gruppo] = {
        media: Number(media(valori).toFixed(3)),
        deviazione: Number(Math.max(0.001, deviazione(valori)).toFixed(3)),
      };
    }
    console.log(JSON.stringify(blocco, null, 2));
    console.log(`\n(su ${opzioni.stagioni} stagioni, ${secondi.toFixed(1)}s)`);
    return 0;
  }

  /* --- rapporto ----------------------------------------------------- */

  const o = voto.obiettiviCalibrazione;
  const golAPartita = acc.gol / acc.partite;
  const mediaVoti = media(acc.voti);
  const devVoti = deviazione(acc.voti);
  const quotaAlti = quota(acc.voti, (v) => v >= o.sogliaVotoAlto);
  const quotaBassi = quota(acc.voti, (v) => v <= o.sogliaVotoBasso);

  console.log(`CALIBRAZIONE — ${opzioni.stagioni} stagioni, ${acc.partite} partite, ${secondi.toFixed(1)}s\n`);

  console.log('PARTITE');
  console.log(`  gol a partita          ${d2(golAPartita)}   ${verdetto(golAPartita, 2.4, 3.0)}`);
  console.log(`  quota gol in casa      ${d3(acc.golCasa / acc.gol)}   ${verdetto(acc.golCasa / acc.gol, 0.53, 0.58)}`);
  console.log(`  vittorie in casa       ${d3(acc.vittorieCasa / acc.partite)}   ${verdetto(acc.vittorieCasa / acc.partite, 0.4, 0.48)}`);
  console.log(`  pareggi                ${d3(acc.pareggi / acc.partite)}   ${verdetto(acc.pareggi / acc.partite, 0.22, 0.3)}`);

  console.log('\nVOTI');
  console.log(`  media                  ${d2(mediaVoti)}   ${verdetto(mediaVoti, o.mediaVoti - 0.1, o.mediaVoti + 0.1)}`);
  console.log(`  deviazione standard    ${d2(devVoti)}   ${verdetto(devVoti, o.deviazioneMinima, o.deviazioneMassima)}`);
  console.log(`  voti >= ${o.sogliaVotoAlto}            ${d3(quotaAlti)}   ${verdetto(quotaAlti, o.quotaVotiAltiMin, o.quotaVotiAltiMax)}`);
  console.log(`  voti <= ${o.sogliaVotoBasso}          ${d3(quotaBassi)}   ${verdetto(quotaBassi, o.quotaVotiBassiMin, o.quotaVotiBassiMax)}`);
  console.log(`  senza voto             ${d3(acc.senzaVoto / acc.valutazioni)}`);

  console.log('\nVOTI PER GRUPPO DI RUOLO');
  console.log('  gruppo      n        media   dev.std');
  const devPerGruppo: number[] = [];
  for (const gruppo of GRUPPI_RUOLO) {
    const v = acc.votiPerGruppo.get(gruppo)!;
    devPerGruppo.push(deviazione(v));
    console.log(
      `  ${gruppo.padEnd(10)}  ${String(v.length).padStart(7)}  ${d2(media(v))}    ${d2(deviazione(v))}`,
    );
  }
  // SPEC 5.6: nessun ruolo deve avere varianza sistematicamente piu' bassa.
  const rapportoVarianza = Math.min(...devPerGruppo) / Math.max(...devPerGruppo);
  console.log(
    `  rapporto fra la dev.std minima e la massima: ${d2(rapportoVarianza)}   ` +
      `${rapportoVarianza >= 0.75 ? 'ok' : 'SQUILIBRATO (atteso >= 0.75)'}`,
  );

  console.log('\nDISCIPLINA E INFORTUNI (per partita, somma delle due squadre)');
  console.log(`  ammonizioni            ${d2(acc.ammonizioni / acc.partite)}   ${verdetto(acc.ammonizioni / acc.partite, 4.0, 5.5)}`);
  console.log(`  espulsioni             ${d3(acc.espulsioni / acc.partite)}   ${verdetto(acc.espulsioni / acc.partite, 0.15, 0.35)}`);
  console.log(`  infortuni              ${d3(acc.infortuni / acc.partite)}`);

  console.log('\nCLUB (media sulle stagioni)');
  console.log('  club                 punti    gol   giocatori usati');
  const righe = mondo.club
    .map((c) => ({
      nome: c.nome,
      punti: media(acc.puntiPerClub.get(c.id) ?? []),
      gol: media(acc.golPerClub.get(c.id) ?? []),
      usati: media(acc.minutiPerClub.get(c.id) ?? []),
    }))
    .sort((a, b) => b.punti - a.punti);
  for (const r of righe) {
    console.log(
      `  ${r.nome.padEnd(20)} ${d2(r.punti).padStart(5)}  ${d2(r.gol).padStart(5)}   ${d2(r.usati).padStart(5)}`,
    );
  }

  const primo = righe[0]!;
  const ultimo = righe[righe.length - 1]!;
  console.log(`\n  forbice punti: ${d2(primo.punti)} (${primo.nome}) — ${d2(ultimo.punti)} (${ultimo.nome})`);
  console.log(`  ${verdetto(primo.punti - ultimo.punti, 45, 70)} sulla distanza fra primo e ultimo`);

  return 0;
}

principale().then(
  (codice) => { process.exitCode = codice; },
  (errore: unknown) => {
    console.error(`\nErrore: ${errore instanceof Error ? errore.message : String(errore)}`);
    process.exitCode = 1;
  },
);

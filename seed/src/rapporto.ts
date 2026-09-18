/**
 * Rapporto leggibile sul seed generato.
 *
 * La roadmap chiede che il seed sia "piccolo e verificabile a occhio": un file
 * JSON da cinquecento giocatori non lo e'. Questo rapporto lo e': si apre, si
 * guarda se i migliori attaccanti sono davvero i migliori attaccanti e se le
 * eta' hanno senso, e in trenta secondi si sa se la derivazione ha funzionato.
 */

import type { Mondo } from './costruisci.ts';
import type { Avviso } from './costruisci.ts';
import { RUOLI_MANTRA } from './ruoli.ts';

type Riassunto = {
  n: number;
  media: number;
  deviazione: number;
  min: number;
  p25: number;
  p50: number;
  p75: number;
  max: number;
};

function riassumi(valori: number[]): Riassunto {
  const n = valori.length;
  if (n === 0) return { n: 0, media: 0, deviazione: 0, min: 0, p25: 0, p50: 0, p75: 0, max: 0 };
  const ordinati = [...valori].sort((a, b) => a - b);
  const media = valori.reduce((a, b) => a + b, 0) / n;
  const varianza = valori.reduce((a, b) => a + (b - media) ** 2, 0) / n;
  const q = (p: number): number => ordinati[Math.min(n - 1, Math.floor(p * (n - 1)))]!;
  return {
    n,
    media,
    deviazione: Math.sqrt(varianza),
    min: ordinati[0]!,
    p25: q(0.25),
    p50: q(0.5),
    p75: q(0.75),
    max: ordinati[n - 1]!,
  };
}

const d1 = (v: number): string => v.toFixed(1);

function tabellaRiassunti(titolo: string, gruppi: [string, number[]][]): string {
  const righe = [
    `### ${titolo}`,
    '',
    '| gruppo | n | media | dev.std | min | p25 | mediana | p75 | max |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|',
  ];
  for (const [nome, valori] of gruppi) {
    const r = riassumi(valori);
    righe.push(
      `| ${nome} | ${r.n} | ${d1(r.media)} | ${d1(r.deviazione)} | ${d1(r.min)} | ` +
        `${d1(r.p25)} | ${d1(r.p50)} | ${d1(r.p75)} | ${d1(r.max)} |`,
    );
  }
  righe.push('');
  return righe.join('\n');
}

export function scriviRapporto(mondo: Mondo, avvisi: readonly Avviso[]): string {
  const { club, giocatori } = mondo;
  const nomeClub = new Map(club.map((c) => [c.id, c.nome]));
  const out: string[] = [];

  out.push(`# Seed FantaBlitz — stagione ${mondo.stagione}`);
  out.push('');
  out.push(
    'Generato da `seed/Quotazioni_Fantacalcio_Stagione_*.xlsx`. ' +
      'Rigenerare con `npm run seed` dentro la cartella `seed/`.',
  );
  out.push('');
  out.push('| | |');
  out.push('|---|---|');
  out.push(`| club | ${club.length} |`);
  out.push(`| giocatori | ${giocatori.length} |`);
  out.push(`| nomi anonimizzati | ${mondo.sorgente.anonimizzato ? 'si' : 'no'} |`);
  out.push(`| impronta del listone | \`${mondo.sorgente.impronta.slice(0, 16)}…\` |`);
  out.push('');

  /* --- avvisi ------------------------------------------------------ */

  if (avvisi.length > 0) {
    out.push('## Avvisi');
    out.push('');
    for (const a of avvisi) out.push(`- **${a.tipo}** — ${a.messaggio}`);
    out.push('');
  }

  /* --- distribuzioni ----------------------------------------------- */

  out.push('## Distribuzioni');
  out.push('');
  out.push(
    tabellaRiassunti('Overall per ruolo classico', [
      ['tutti', giocatori.map((g) => g.overall)],
      ...(['P', 'D', 'C', 'A'] as const).map(
        (r): [string, number[]] => [
          r,
          giocatori.filter((g) => g.ruoloClassico === r).map((g) => g.overall),
        ],
      ),
    ]),
  );
  out.push(
    tabellaRiassunti('Eta e potenziale', [
      ['eta', giocatori.map((g) => g.eta)],
      ['potenziale', giocatori.map((g) => g.potenziale)],
      [
        'margine di crescita',
        giocatori.map((g) => g.potenziale - g.overall).filter((m) => m > 0),
      ],
    ]),
  );

  const perRuoloMantra = RUOLI_MANTRA.map((r): [string, number[]] => [
    r,
    giocatori.filter((g) => g.ruoliMantra.includes(r)).map((g) => g.overall),
  ]).filter(([, v]) => v.length > 0);
  out.push(tabellaRiassunti('Overall per ruolo Mantra (un giocatore puo comparire piu volte)', perRuoloMantra));

  /* --- club --------------------------------------------------------- */

  out.push('## Club');
  out.push('');
  out.push('Forza = somma degli overall dei 13 migliori. E il criterio con cui vengono assegnati gli impegni europei.');
  out.push('');
  out.push('| club | sigla | rosa | por | forza | media overall | miglior giocatore | coppa |');
  out.push('|---|---|---:|---:|---:|---:|---|---|');

  const righeClub = club.map((c) => {
    const rosa = giocatori.filter((g) => g.clubId === c.id);
    const ordinati = [...rosa].sort((a, b) => b.overall - a.overall);
    const forza = ordinati.slice(0, 13).reduce((a, g) => a + g.overall, 0);
    return { c, rosa, ordinati, forza };
  });
  righeClub.sort((a, b) => b.forza - a.forza);

  for (const { c, rosa, ordinati, forza } of righeClub) {
    const media = rosa.reduce((a, g) => a + g.overall, 0) / Math.max(1, rosa.length);
    const migliore = ordinati[0];
    out.push(
      `| ${c.nome} | ${c.abbreviazione} | ${rosa.length} | ` +
        `${rosa.filter((g) => g.ruoloClassico === 'P').length} | ${d1(forza)} | ${d1(media)} | ` +
        `${migliore ? `${migliore.nome} (${d1(migliore.overall)})` : '—'} | ${c.coppa ?? ''} |`,
    );
  }
  out.push('');

  /* --- migliori ------------------------------------------------------ */

  out.push('## I 25 giocatori piu forti');
  out.push('');
  out.push('| # | giocatore | club | ruoli | eta | overall | pot. | att | dif | tec | fis | gol | assist |');
  out.push('|---:|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  [...giocatori]
    .sort((a, b) => b.overall - a.overall || a.nome.localeCompare(b.nome, 'it'))
    .slice(0, 25)
    .forEach((g, i) => {
      out.push(
        `| ${i + 1} | ${g.nome} | ${nomeClub.get(g.clubId)} | ${g.ruoliMantra.join(';')} | ` +
          `${g.eta} | ${d1(g.overall)} | ${d1(g.potenziale)} | ${d1(g.rating.attacco)} | ` +
          `${d1(g.rating.difesa)} | ${d1(g.rating.tecnica)} | ${d1(g.rating.fisico)} | ` +
          `${g.propensioni.gol.toFixed(2)} | ${g.propensioni.assist.toFixed(2)} |`,
      );
    });
  out.push('');

  out.push('## I migliori per ruolo Mantra');
  out.push('');
  out.push('| ruolo | 1 | 2 | 3 |');
  out.push('|---|---|---|---|');
  for (const ruolo of RUOLI_MANTRA) {
    const migliori = giocatori
      .filter((g) => g.ruoliMantra.includes(ruolo))
      .sort((a, b) => b.overall - a.overall || a.nome.localeCompare(b.nome, 'it'))
      .slice(0, 3)
      .map((g) => `${g.nome} (${d1(g.overall)})`);
    if (migliori.length > 0) out.push(`| ${ruolo} | ${[0, 1, 2].map((i) => migliori[i] ?? '—').join(' | ')} |`);
  }
  out.push('');

  out.push('## Le maggiori promesse');
  out.push('');
  out.push('Giocatori con il margine di crescita piu ampio: sono quelli su cui la fase 2 fara la differenza.');
  out.push('');
  out.push('| giocatore | club | ruoli | eta | overall | potenziale | margine |');
  out.push('|---|---|---|---:|---:|---:|---:|');
  [...giocatori]
    .sort(
      (a, b) =>
        b.potenziale - b.overall - (a.potenziale - a.overall) ||
        a.nome.localeCompare(b.nome, 'it'),
    )
    .slice(0, 15)
    .forEach((g) => {
      out.push(
        `| ${g.nome} | ${nomeClub.get(g.clubId)} | ${g.ruoliMantra.join(';')} | ${g.eta} | ` +
          `${d1(g.overall)} | ${d1(g.potenziale)} | +${d1(g.potenziale - g.overall)} |`,
      );
    });
  out.push('');

  return out.join('\n');
}

/**
 * L'orario fisso del ciclo automatico (SPEC §4: "Orario del ciclo: fisso,
 * serale"). Deve restare allineato a `web/vercel.json` (`crons[0].schedule`):
 * se cambia uno dei due, cambia anche l'altro — non c'e' un modo per
 * generare lo schedule di Vercel da qui, che legge solo file statici.
 *
 * E' un'ora UTC, non un parametro di lega (issue #13): il piano gratuito di
 * Vercel esegue un solo cron al giorno, alla stessa ora per tutte le leghe.
 */
const ORARIO_CICLO_UTC = { ore: 19, minuti: 0 };

/** L'orario del ciclo automatico nel fuso orario italiano, per un messaggio in interfaccia. */
export function orarioCicloLocale(): string {
  const oggi = new Date();
  const inUtc = new Date(Date.UTC(
    oggi.getUTCFullYear(), oggi.getUTCMonth(), oggi.getUTCDate(),
    ORARIO_CICLO_UTC.ore, ORARIO_CICLO_UTC.minuti,
  ));
  return inUtc.toLocaleTimeString('it-IT', {
    timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit',
  });
}

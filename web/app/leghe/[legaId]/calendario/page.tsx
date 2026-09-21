import Link from 'next/link';
import { legaAutorizzata, posizioneAttuale, stagioneDi } from '../../../../src/dati.ts';
import { configurato, emailUtente } from '../../../../src/supabase/server.ts';

export const dynamic = 'force-dynamic';

const FINESTRA = 4;

export default async function Calendario({
  params,
  searchParams,
}: {
  params: Promise<{ legaId: string }>;
  searchParams: Promise<{ da?: string }>;
}) {
  const { legaId } = await params;
  const { da: daGrezzo } = await searchParams;
  const id = decodeURIComponent(legaId);
  const lega = await legaAutorizzata(id);
  if (!lega) return <p className="vuoto">Lega non disponibile.</p>;

  const radice = `/leghe/${encodeURIComponent(lega.id)}`;
  const stagione = await stagioneDi(lega);
  // Cresce di stagione in stagione (SPEC 5.8): non e' un tetto fisso, e' fin
  // dove arriva il calendario della stagione in corso.
  const totale = stagione.calendario.giornate.length;
  const posizione = await posizioneAttuale(lega);

  const email = configurato() ? await emailUtente() : null;
  const squadraPropria = email ? lega.squadre.find((s) => s.proprietario === email) : undefined;

  const giornataAttuale = Math.min(lega.giornateGiocate + 1, totale);
  const richiesta = Number(daGrezzo);
  const daPredefinito = Math.max(1, giornataAttuale - 1);
  const da = Math.max(1, Math.min(Number.isInteger(richiesta) ? richiesta : daPredefinito, Math.max(1, totale - FINESTRA + 1)));
  const a = Math.min(totale, da + FINESTRA - 1);

  const nomeSquadra = (squadraId: string): string =>
    lega.squadre.find((s) => s.id === squadraId)?.nome ?? squadraId;

  // Il risultato delle giornate gia' giocate nella finestra mostrata: si
  // cerca solo qui, non per tutta la stagione, che sarebbe sprecato per una
  // finestra di poche giornate.
  const risultati = new Map<string, { golCasa: number; golOspite: number }>();
  for (let n = da; n <= a; n++) {
    if (n > lega.giornateGiocate) continue;
    const giornata = stagione.giornate.find((g) => g.numero === n);
    for (const s of giornata?.scontri ?? []) {
      risultati.set(`${n}-${s.casaId}-${s.ospiteId}`, { golCasa: s.golCasa, golOspite: s.golOspite });
    }
  }

  return (
    <section className="riquadro">
      <h1>Calendario</h1>
      <p className="spiega">
        Stagione {posizione.stagione}: {posizione.giornataStagionale} giornate giocate su{' '}
        {posizione.giornatePerStagione}. Le giornate non ancora giocate non si possono aprire: i
        voti si vedono dopo, non prima.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1.5rem' }}>
        {Array.from({ length: totale }, (_, i) => i + 1).map((n) => (
          <Link
            key={n}
            href={`${radice}/calendario?da=${n}`}
            style={{
              padding: '0.2rem 0.5rem',
              fontWeight: n >= da && n <= a ? 700 : 400,
              color: n >= da && n <= a ? 'var(--testo)' : undefined,
              textDecoration: n >= da && n <= a ? 'underline' : undefined,
            }}
          >
            {n}
          </Link>
        ))}
      </div>

      <p className="azioni">
        {da > 1 && (
          <Link href={`${radice}/calendario?da=${Math.max(1, da - FINESTRA)}`}>← Giornate precedenti</Link>
        )}
        {a < totale && (
          <Link href={`${radice}/calendario?da=${a + 1}`}>Giornate successive →</Link>
        )}
      </p>

      <div className="griglia-due">
        {Array.from({ length: a - da + 1 }, (_, i) => da + i).map((n) => {
          const giocata = n <= lega.giornateGiocate;
          const scontri = stagione.calendario.giornate[n - 1]?.scontri ?? [];
          return (
            <div key={n} className="riquadro">
              <h3>
                {giocata ? <Link href={`${radice}/calendario/${n}`}>Giornata {n} →</Link> : `Giornata ${n}`}
                {' '}
                <span style={{ color: 'var(--tenue)', fontWeight: 400 }}>
                  {giocata ? 'giocata' : 'da giocare'}
                </span>
              </h3>
              {scontri.map((s) => {
                const mia = squadraPropria && (s.casaId === squadraPropria.id || s.ospiteId === squadraPropria.id);
                const risultato = risultati.get(`${n}-${s.casaId}-${s.ospiteId}`);
                const testo = risultato
                  ? `${nomeSquadra(s.casaId)} ${risultato.golCasa}-${risultato.golOspite} ${nomeSquadra(s.ospiteId)}`
                  : `${nomeSquadra(s.casaId)} — ${nomeSquadra(s.ospiteId)}`;
                return (
                  <p key={`${s.casaId}-${s.ospiteId}`} style={{ margin: '0.3rem 0', fontSize: '0.9rem' }}>
                    {mia ? <strong>{testo}</strong> : testo}
                  </p>
                );
              })}
            </div>
          );
        })}
      </div>
    </section>
  );
}

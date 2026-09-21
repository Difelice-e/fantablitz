import Link from 'next/link';
import { legaAutorizzata, posizioneAttuale, stagioneDi } from '../../../../src/dati.ts';
import { configurato, emailUtente } from '../../../../src/supabase/server.ts';

export const dynamic = 'force-dynamic';

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

  // Dalla giornata scelta (o quella in corso, di default) fino a fine
  // campionato: niente finestra ne' paginazione, si scorre.
  const giornataAttuale = Math.min(lega.giornateGiocate + 1, totale);
  const richiesta = Number(daGrezzo);
  const da = Math.max(1, Math.min(Number.isInteger(richiesta) ? richiesta : giornataAttuale, totale));
  const a = totale;

  const nomeSquadra = (squadraId: string): string =>
    lega.squadre.find((s) => s.id === squadraId)?.nome ?? squadraId;

  // Il risultato delle giornate gia' giocate a partire da quella scelta: non
  // c'e' bisogno di cercarlo anche per quelle prima, che non si mostrano.
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
              fontWeight: n === da ? 700 : 400,
              color: n === da ? 'var(--testo)' : undefined,
              textDecoration: n === da ? 'underline' : undefined,
            }}
          >
            {n}
          </Link>
        ))}
      </div>

      <div className="griglia-due">
        {Array.from({ length: a - da + 1 }, (_, i) => da + i).map((n) => {
          const giocata = n <= lega.giornateGiocate;
          const scontri = stagione.calendario.giornate[n - 1]?.scontri ?? [];
          // Come calendario/[n]/page.tsx: apre sempre il dettaglio di una
          // partita, la propria se c'e'. Calcolato gia' qui (gli scontri
          // della giornata sono gia' in mano) per evitare il giro a vuoto sul
          // redirect di quella pagina per il caso comune del click da questa
          // lista.
          const scontroProprio = squadraPropria
            ? scontri.find((s) => s.casaId === squadraPropria.id || s.ospiteId === squadraPropria.id)
            : undefined;
          const destinazioneGiornata = scontroProprio?.casaId ?? scontri[0]?.casaId;
          return (
            <div key={n} className="riquadro">
              <h3>
                {giocata && destinazioneGiornata ? (
                  <Link href={`${radice}/calendario/${n}/${encodeURIComponent(destinazioneGiornata)}`}>
                    Giornata {n} →
                  </Link>
                ) : (
                  `Giornata ${n}`
                )}
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

import { legaPredefinita, nomiGiocatori, stagioneDi } from '../../../src/dati.ts';

export const dynamic = 'force-dynamic';

export default async function Giornata({ params }: { params: Promise<{ n: string }> }) {
  const { n } = await params;
  const numero = Number(n);
  const lega = await legaPredefinita();
  if (!lega) return <p className="vuoto">Nessuna lega in archivio.</p>;

  if (!Number.isInteger(numero) || numero < 1 || numero > lega.giornateGiocate) {
    return (
      <section className="riquadro">
        <h1>Giornata {n}</h1>
        <p className="avviso">
          Questa giornata non è ancora stata giocata. Si gioca con{' '}
          <code>npm run gioca -- {lega.id}</code>.
        </p>
      </section>
    );
  }

  const stagione = await stagioneDi(lega);
  const giornata = stagione.giornate.find((g) => g.numero === numero);
  const nomi = await nomiGiocatori();
  const nome = (id: string): string => nomi.get(id) ?? id;

  if (!giornata) return <p className="vuoto">Giornata non trovata.</p>;

  return (
    <>
      <section className="riquadro">
        <h1>Giornata {numero}</h1>
        <p className="spiega">
          Il punteggio in grande sono i gol, quello piccolo i fantapunti da cui derivano.
        </p>
        {giornata.scontri.map((s) => (
          <div className="scontro" key={`${s.casaId}-${s.ospiteId}`}>
            <span className="casa">
              <a href={`/squadre/${encodeURIComponent(s.casaId)}`}>{s.casaId}</a>
            </span>
            <span className="punteggio">
              {s.golCasa}–{s.golOspite}
              <span className="fanta">
                {s.fantapuntiCasa.toFixed(1)} — {s.fantapuntiOspite.toFixed(1)}
              </span>
            </span>
            <span>
              <a href={`/squadre/${encodeURIComponent(s.ospiteId)}`}>{s.ospiteId}</a>
            </span>
          </div>
        ))}
      </section>

      <section className="riquadro">
        <h2>Cosa è successo alle formazioni</h2>
        <p className="spiega">
          Chi non prende voto viene sostituito dalla panchina, come nel fantacalcio vero. Se la
          panchina non basta, la casella resta scoperta e vale zero.
        </p>

        {giornata.squadre.every(
          (s) => s.cambi.length === 0 && s.slotScoperti.length === 0 && s.adattati.length === 0,
        ) ? (
          <p className="vuoto">Nessuna sostituzione: tutti hanno preso voto.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Squadra</th>
                <th>Sostituzioni automatiche</th>
                <th className="numero">Scoperti</th>
              </tr>
            </thead>
            <tbody>
              {giornata.squadre.map((s) => (
                <tr key={s.squadraId}>
                  <td>
                    <a href={`/squadre/${encodeURIComponent(s.squadraId)}`}>{s.squadraId}</a>
                  </td>
                  <td>
                    {s.cambi.length === 0
                      ? '—'
                      : s.cambi.map((c) => `${nome(c.esce)} → ${nome(c.entra)}`).join(', ')}
                  </td>
                  <td className="numero">{s.slotScoperti.length || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="riquadro">
        <h2>Tabellini</h2>
        <div className="griglia-due">
          {giornata.squadre.map((s) => (
            <div key={s.squadraId}>
              <h3>
                {s.squadraId} — {s.punteggio.fantapunti.toFixed(1)}
              </h3>
              <table>
                <tbody>
                  {s.punteggio.prestazioni.map((p) => (
                    <tr key={p.giocatoreId}>
                      <td>{nome(p.giocatoreId)}</td>
                      <td className="numero">{p.voto === null ? 's.v.' : p.voto.toFixed(1)}</td>
                      <td
                        className="numero"
                        style={{
                          color:
                            p.bonus > 0
                              ? 'var(--positivo)'
                              : p.bonus < 0
                                ? 'var(--negativo)'
                                : 'var(--tenue)',
                        }}
                      >
                        {p.bonus === 0 ? '' : p.bonus > 0 ? `+${p.bonus}` : p.bonus}
                      </td>
                      <td className="numero">
                        <strong>{p.fantavoto === null ? '0' : p.fantavoto.toFixed(1)}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} style={{ color: 'var(--tenue)' }}>
                      {s.punteggio.difesa.applicato
                        ? `Modificatore difesa (media ${s.punteggio.difesa.media?.toFixed(2)})`
                        : `Modificatore difesa: ${s.punteggio.difesa.motivo}`}
                    </td>
                    <td className="numero">
                      <strong>
                        {s.punteggio.difesa.bonus > 0 ? `+${s.punteggio.difesa.bonus}` : '—'}
                      </strong>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

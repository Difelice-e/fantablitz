import Link from 'next/link';
import { legaAutorizzata, nomiGiocatori, stagioneDi } from '../../../../../../src/dati.ts';

export const dynamic = 'force-dynamic';

export default async function DettaglioPartita({
  params,
}: {
  params: Promise<{ legaId: string; n: string; squadraId: string }>;
}) {
  const { legaId, n, squadraId } = await params;
  const numero = Number(n);
  const id = decodeURIComponent(squadraId);
  const lega = await legaAutorizzata(decodeURIComponent(legaId));
  if (!lega) return <p className="vuoto">Lega non disponibile.</p>;

  const radice = `/leghe/${encodeURIComponent(lega.id)}`;

  if (!Number.isInteger(numero) || numero < 1 || numero > lega.giornateGiocate) {
    return (
      <section className="riquadro">
        <h1>Giornata {n}</h1>
        <p className="avviso">Questa giornata non è ancora stata giocata.</p>
      </section>
    );
  }

  const stagione = await stagioneDi(lega);
  const giornata = stagione.giornate.find((g) => g.numero === numero);
  const scontro = giornata?.scontri.find((s) => s.casaId === id || s.ospiteId === id);
  if (!giornata || !scontro) {
    return (
      <section className="riquadro">
        <h1>Partita non trovata</h1>
        <p className="avviso errore">Nessun incontro di «{id}» nella giornata {numero}.</p>
      </section>
    );
  }

  const squadraCasa = giornata.squadre.find((s) => s.squadraId === scontro.casaId)!;
  const squadraOspite = giornata.squadre.find((s) => s.squadraId === scontro.ospiteId)!;
  const nomi = await nomiGiocatori();
  const nome = (giocatoreId: string): string => nomi.get(giocatoreId) ?? giocatoreId;
  const proprietari = new Map(lega.squadre.map((s) => [s.id, s.proprietario]));
  const nomeSquadra = (squadraId: string): string =>
    lega.squadre.find((s) => s.id === squadraId)?.nome ?? squadraId;
  const bot = (squadraId: string): React.ReactNode =>
    proprietari.get(squadraId) === null && <span className="etichetta-bot">BOT</span>;

  return (
    <>
      <section className="riquadro">
        <p className="azioni" style={{ marginBottom: '0.5rem' }}>
          <Link href={`${radice}/calendario/${numero}`}>← Giornata {numero}</Link>
        </p>
        <h1>
          {nomeSquadra(scontro.casaId)} {scontro.golCasa}–{scontro.golOspite}{' '}
          {nomeSquadra(scontro.ospiteId)}
        </h1>
        <p className="spiega">
          {squadraCasa.punteggio.fantapunti.toFixed(1)} — {squadraOspite.punteggio.fantapunti.toFixed(1)} fantapunti.{' '}
          {squadraCasa.formazione.modulo} contro {squadraOspite.formazione.modulo}.
        </p>
      </section>

      <section className="riquadro">
        <div className="griglia-due">
          {[squadraCasa, squadraOspite].map((s) => (
            <div key={s.squadraId}>
              <h3>
                {nomeSquadra(s.squadraId)} — {s.punteggio.fantapunti.toFixed(1)}
                {bot(s.squadraId)}
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

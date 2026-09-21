import Link from 'next/link';
import { legaAutorizzata, mvFmDiRosa, rosaInVista, stagioneDi } from '../../../../../src/dati.ts';

export const dynamic = 'force-dynamic';

export default async function Rosa({
  params,
}: {
  params: Promise<{ legaId: string; id: string }>;
}) {
  const { legaId, id } = await params;
  const legaIdDecodificato = decodeURIComponent(legaId);
  const squadraId = decodeURIComponent(id);
  const lega = await legaAutorizzata(legaIdDecodificato);
  if (!lega) return <p className="vuoto">Lega non disponibile.</p>;

  const radice = `/leghe/${encodeURIComponent(lega.id)}`;
  const squadra = lega.squadre.find((s) => s.id === squadraId);
  if (!squadra) {
    return (
      <section className="riquadro">
        <h1>Squadra sconosciuta</h1>
        <p className="avviso errore">Nessuna squadra si chiama «{squadraId}».</p>
      </section>
    );
  }

  const rosa = await rosaInVista(lega, squadraId);
  const mvFm = await mvFmDiRosa(lega, squadraId);
  const stagione = await stagioneDi(lega);
  const riga = stagione.classifica.find((r) => r.squadraId === squadraId);
  const spesa = rosa.reduce((a, g) => a + g.prezzo, 0);

  const perRuolo = (r: string) => rosa.filter((g) => g.ruoloClassico === r);

  return (
    <div className="griglia-due">
      <section className="riquadro">
        <h2>Squadre</h2>
        {lega.squadre.map((s) => (
          <div key={s.id} style={{ padding: '0.25rem 0' }}>
            {s.id === squadraId ? (
              <strong>{s.nome}</strong>
            ) : (
              <Link href={`${radice}/rose/${encodeURIComponent(s.id)}`}>{s.nome}</Link>
            )}
            {s.proprietario === null && <span className="etichetta-bot">BOT</span>}
          </div>
        ))}
      </section>

      <div>
        <section className="riquadro">
          <h1>
            {squadra.nome}
            {squadra.proprietario === null && <span className="etichetta-bot">BOT</span>}
          </h1>
          <p className="spiega">
            {riga
              ? `${riga.punti} punti in ${riga.giocate} giornate, ${riga.fantapunti.toFixed(1)} fantapunti.`
              : 'La stagione non è ancora iniziata.'}{' '}
            Rosa da {rosa.length} giocatori, {spesa} crediti spesi su {lega.budget}.
          </p>
          <div className="azioni">
            <Link href={`${radice}/rose/${encodeURIComponent(squadraId)}/formazione`}>
              <button className="principale">Schiera la formazione</button>
            </Link>
            <Link href={`${radice}/rose/${encodeURIComponent(squadraId)}/scambi`}>
              <button className="secondario">Scambi</button>
            </Link>
            {/* Scarica un file, non naviga: resta un <a> normale, non <Link>. */}
            <a href={`${radice}/rose/${encodeURIComponent(squadraId)}/csv`}>Esporta CSV</a>
          </div>
        </section>

        <section className="riquadro">
          <h2>Rosa</h2>
          {(['P', 'D', 'C', 'A'] as const).map((ruolo) => {
            const gruppo = perRuolo(ruolo);
            if (gruppo.length === 0) return null;
            const etichette = { P: 'Portieri', D: 'Difensori', C: 'Centrocampisti', A: 'Attaccanti' };
            return (
              <div key={ruolo}>
                <h3>
                  {etichette[ruolo]} ({gruppo.length})
                </h3>
                <table>
                  <thead>
                    <tr>
                      <th />
                      <th>Nome</th>
                      <th>Ruolo</th>
                      <th className="numero">Prezzo</th>
                      <th className="numero">MV</th>
                      <th className="numero">FM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gruppo.map((g) => {
                      const voti = mvFm.get(g.id);
                      return (
                        <tr key={g.id}>
                          <td>
                            <span className="club" style={{ background: g.colore }}>
                              {g.clubBreve}
                            </span>
                          </td>
                          <td>{g.nome}</td>
                          <td style={{ color: 'var(--tenue)', fontSize: '0.8rem' }}>
                            {lega.modalita === 'mantra' ? g.ruoliMantra.join('/') : g.ruoloClassico}
                          </td>
                          <td className="numero">{g.prezzo}</td>
                          <td className="numero">{voti?.mv !== null && voti?.mv !== undefined ? voti.mv.toFixed(2) : '—'}</td>
                          <td className="numero">{voti?.fm !== null && voti?.fm !== undefined ? voti.fm.toFixed(2) : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}

import { legaPredefinita, stagioneDi } from '../../src/dati.ts';

export const dynamic = 'force-dynamic';

export default async function Squadre() {
  const lega = await legaPredefinita();
  if (!lega) return <p className="vuoto">Nessuna lega in archivio.</p>;

  const stagione = await stagioneDi(lega);
  const posizione = new Map(stagione.classifica.map((r, i) => [r.squadraId, i + 1]));

  return (
    <section className="riquadro">
      <h1>Squadre</h1>
      <p className="spiega">Dieci squadre, {lega.modalita === 'mantra' ? 'Mantra' : 'classic'}.</p>
      <table>
        <thead>
          <tr>
            <th className="numero">#</th>
            <th>Squadra</th>
            <th className="numero">Giocatori</th>
            <th className="numero">Spesa</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {lega.squadre.map((s) => (
            <tr key={s.id}>
              <td className="numero">{posizione.get(s.id) ?? '—'}</td>
              <td>
                <a href={`/squadre/${encodeURIComponent(s.id)}`}>{s.nome}</a>
                {s.proprietario === null && <span className="etichetta-bot">BOT</span>}
              </td>
              <td className="numero">{s.giocatori.length}</td>
              <td className="numero">{s.giocatori.reduce((a, g) => a + g.prezzo, 0)}</td>
              <td>
                <a href={`/squadre/${encodeURIComponent(s.id)}/formazione`}>Schiera</a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

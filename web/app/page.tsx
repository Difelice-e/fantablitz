import { legaPredefinita, stagioneDi } from '../src/dati.ts';
import { sonoAmministratore } from '../src/admin.ts';

export const dynamic = 'force-dynamic';

export default async function Classifica() {
  const lega = await legaPredefinita();

  if (!lega) {
    const admin = await sonoAmministratore();
    return (
      <section className="riquadro">
        <h1>Nessuna lega</h1>
        {admin ? (
          <>
            <p className="spiega">Non c’è ancora nessuna lega. Creane una dall’amministrazione.</p>
            <p className="azioni">
              <a href="/admin">Vai all’amministrazione</a>
            </p>
          </>
        ) : (
          <p className="spiega">
            Non c’è ancora nessuna lega, o non sei ancora stato assegnato a una squadra. Chiedi
            all’amministratore.
          </p>
        )}
      </section>
    );
  }

  const proprietari = new Map(lega.squadre.map((s) => [s.id, s.proprietario]));
  const stagione = await stagioneDi(lega);
  const totale = stagione.calendario.giornate.length;

  return (
    <>
      <section className="riquadro">
        <h1>Classifica</h1>
        <p className="spiega">
          {lega.giornateGiocate === 0
            ? `La stagione non è ancora iniziata: ${totale} giornate in calendario.`
            : `Dopo ${lega.giornateGiocate} giornate su ${totale}.`}
        </p>

        {lega.giornateGiocate === 0 ? (
          <p className="vuoto">
            Schiera la formazione, poi gioca la prima giornata con{' '}
            <code>npm run gioca -- {lega.id}</code>.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th className="numero">#</th>
                <th>Squadra</th>
                <th className="numero">Pt</th>
                <th className="numero">G</th>
                <th className="numero">V</th>
                <th className="numero">N</th>
                <th className="numero">P</th>
                <th className="numero">GF</th>
                <th className="numero">GS</th>
                <th className="numero">Fantapunti</th>
                <th className="numero">Media</th>
              </tr>
            </thead>
            <tbody>
              {stagione.classifica.map((r, i) => (
                <tr key={r.squadraId}>
                  <td className="numero">{i + 1}</td>
                  <td>
                    <a href={`/squadre/${encodeURIComponent(r.squadraId)}`}>{r.squadraId}</a>
                    {proprietari.get(r.squadraId) === null && <span className="etichetta-bot">BOT</span>}
                  </td>
                  <td className="numero">
                    <strong>{r.punti}</strong>
                  </td>
                  <td className="numero">{r.giocate}</td>
                  <td className="numero">{r.vinte}</td>
                  <td className="numero">{r.pareggiate}</td>
                  <td className="numero">{r.perse}</td>
                  <td className="numero">{r.golFatti}</td>
                  <td className="numero">{r.golSubiti}</td>
                  <td className="numero">{r.fantapunti.toFixed(1)}</td>
                  <td className="numero">
                    {r.giocate > 0 ? (r.fantapunti / r.giocate).toFixed(1) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

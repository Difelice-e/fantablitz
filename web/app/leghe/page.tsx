import { legheDiUtente, posizioneAttuale } from '../../src/dati.ts';
import { sonoAmministratore } from '../../src/admin.ts';

export const dynamic = 'force-dynamic';

export default async function LeMieLeghe() {
  const leghe = await legheDiUtente();
  const admin = await sonoAmministratore();

  return (
    <section className="riquadro">
      <h1>Le mie leghe</h1>

      {leghe.length === 0 ? (
        <p className="spiega">
          Non sei ancora in nessuna lega: aspetta che l’amministratore ti assegni una squadra,
          oppure entra da solo se conosci il nome della lega e la sua parola d’ordine.
        </p>
      ) : (
        <table>
          <tbody>
            {await Promise.all(
              leghe.map(async (lega) => {
                const posizione = await posizioneAttuale(lega);
                return (
                  <tr key={lega.id}>
                    <td>
                      <a href={`/leghe/${encodeURIComponent(lega.id)}/dashboard`}>{lega.nome}</a>
                    </td>
                    <td style={{ color: 'var(--tenue)', fontSize: '0.85rem' }}>
                      {lega.giornateGiocate === 0
                        ? 'stagione non ancora iniziata'
                        : `stagione ${posizione.stagione}, giornata ${posizione.giornataStagionale} di ${posizione.giornatePerStagione}`}
                    </td>
                  </tr>
                );
              }),
            )}
          </tbody>
        </table>
      )}

      <div className="azioni" style={{ marginTop: '1rem' }}>
        <a href="/entra">
          <button className="principale">Entra in una lega</button>
        </a>
        {admin && (
          <a href="/admin">
            <button className="secondario">Crea una lega</button>
          </a>
        )}
      </div>
    </section>
  );
}

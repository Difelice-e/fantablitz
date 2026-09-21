import { legaAutorizzata } from '../../../../src/dati.ts';

export const dynamic = 'force-dynamic';

export default async function SalaStampa({ params }: { params: Promise<{ legaId: string }> }) {
  const { legaId } = await params;
  const id = decodeURIComponent(legaId);
  const stato = await legaAutorizzata(id);
  if (!stato) return <p className="vuoto">Lega non disponibile.</p>;

  const radice = `/leghe/${encodeURIComponent(stato.id)}`;
  const editoriali = [...stato.editoriali].sort((a, b) => b.giornata - a.giornata);

  return (
    <section className="riquadro">
      <h1>Sala stampa</h1>
      <p className="spiega">
        L’editoriale di ogni giornata giocata, con un link alle cronache del mondo simulato e ai
        tabellini di quella giornata.
      </p>

      {editoriali.length === 0 ? (
        <p className="vuoto">
          Non c’è ancora nessun editoriale: arriva dopo la prima giornata giocata.
        </p>
      ) : (
        <table>
          <tbody>
            {editoriali.map((e) => (
              <tr key={e.giornata}>
                <td className="numero" style={{ width: '3rem' }}>
                  <a href={`${radice}/calendario/${e.giornata}`}>G{e.giornata}</a>
                </td>
                <td>
                  {e.testo}
                  {e.fonte === 'template' && (
                    <span
                      className="etichetta"
                      title="Il provider AI non era raggiungibile: testo da modello fisso."
                    >
                      da modello
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

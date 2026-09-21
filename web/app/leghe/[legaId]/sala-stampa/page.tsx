import Link from 'next/link';
import { legaAutorizzata, stagioneDi } from '../../../../src/dati.ts';
import { configurato, emailUtente } from '../../../../src/supabase/server.ts';

export const dynamic = 'force-dynamic';

export default async function SalaStampa({ params }: { params: Promise<{ legaId: string }> }) {
  const { legaId } = await params;
  const id = decodeURIComponent(legaId);
  const stato = await legaAutorizzata(id);
  if (!stato) return <p className="vuoto">Lega non disponibile.</p>;

  const radice = `/leghe/${encodeURIComponent(stato.id)}`;
  const editoriali = [...stato.editoriali].sort((a, b) => b.giornata - a.giornata);

  // Come calendario/[n]/page.tsx: il link salta direttamente al dettaglio
  // della propria partita, invece che passare dal suo redirect.
  const email = configurato() ? await emailUtente() : null;
  const squadraPropria = email ? stato.squadre.find((s) => s.proprietario === email) : undefined;
  const stagione = editoriali.length > 0 ? await stagioneDi(stato) : null;
  const destinazioneGiornata = (giornata: number): string | undefined => {
    const scontri = stagione?.giornate.find((g) => g.numero === giornata)?.scontri ?? [];
    const proprio = squadraPropria
      ? scontri.find((s) => s.casaId === squadraPropria.id || s.ospiteId === squadraPropria.id)
      : undefined;
    return proprio?.casaId ?? scontri[0]?.casaId;
  };

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
            {editoriali.map((e) => {
              const destinazione = destinazioneGiornata(e.giornata);
              return (
              <tr key={e.giornata}>
                <td className="numero" style={{ width: '3rem' }}>
                  {destinazione ? (
                    <Link href={`${radice}/calendario/${e.giornata}/${encodeURIComponent(destinazione)}`}>
                      G{e.giornata}
                    </Link>
                  ) : (
                    `G${e.giornata}`
                  )}
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
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

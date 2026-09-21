import { legaAutorizzata } from '../../../../src/dati.ts';
import { sonoAmministratore } from '../../../../src/admin.ts';
import { orarioCicloLocale } from '../../../../src/ciclo.ts';

export const dynamic = 'force-dynamic';

export default async function Dashboard({ params }: { params: Promise<{ legaId: string }> }) {
  const { legaId } = await params;
  const id = decodeURIComponent(legaId);
  const stato = await legaAutorizzata(id);
  if (!stato) return <p className="vuoto">Lega non disponibile.</p>;

  const admin = await sonoAmministratore();
  const radice = `/leghe/${encodeURIComponent(stato.id)}`;

  return (
    <section className="riquadro">
      <h1>{stato.nome}</h1>

      {stato.giornateGiocate === 0 ? (
        <p className="vuoto">
          Schiera la formazione: la prima giornata si gioca da sola ogni sera, verso le{' '}
          {orarioCicloLocale()} (ora italiana).
          {admin && (
            <>
              {' '}
              Se vuoi testare subito senza aspettare, usa «Simula la giornata adesso» nella{' '}
              <a href={`/admin/squadre/${encodeURIComponent(stato.id)}`}>pagina di amministrazione</a>{' '}
              della lega.
            </>
          )}
        </p>
      ) : (
        <p className="spiega">{stato.giornateGiocate} giornate giocate finora.</p>
      )}

      <div className="azioni" style={{ marginTop: '0.5rem' }}>
        <a href={`${radice}/rose`}>
          <button className="secondario">Rose</button>
        </a>
        <a href={`${radice}/calendario`}>
          <button className="secondario">Calendario</button>
        </a>
        <a href={`${radice}/classifica`}>
          <button className="secondario">Classifica</button>
        </a>
        <a href={`${radice}/sala-stampa`}>
          <button className="secondario">Sala stampa</button>
        </a>
      </div>
    </section>
  );
}

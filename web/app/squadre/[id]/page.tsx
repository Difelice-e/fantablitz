import { legaPredefinita, rosaInVista, stagioneDi } from '../../../src/dati.ts';

export const dynamic = 'force-dynamic';

export default async function Rosa({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const squadraId = decodeURIComponent(id);
  const lega = await legaPredefinita();
  if (!lega) return <p className="vuoto">Nessuna lega in archivio.</p>;

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
  const stagione = await stagioneDi(lega);
  const riga = stagione.classifica.find((r) => r.squadraId === squadraId);
  const spesa = rosa.reduce((a, g) => a + g.prezzo, 0);

  const perRuolo = (r: string) => rosa.filter((g) => g.ruoloClassico === r);

  return (
    <>
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
          <a href={`/squadre/${encodeURIComponent(squadraId)}/formazione`}>
            <button className="principale">Schiera la formazione</button>
          </a>
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
                <tbody>
                  {gruppo.map((g) => (
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </section>
    </>
  );
}

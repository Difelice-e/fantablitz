import { legaAutorizzata, posizioneAttuale, stagioneDi } from '../../../../src/dati.ts';

export const dynamic = 'force-dynamic';

export default async function Classifica({ params }: { params: Promise<{ legaId: string }> }) {
  const { legaId } = await params;
  const id = decodeURIComponent(legaId);
  const lega = await legaAutorizzata(id);
  if (!lega) return <p className="vuoto">Lega non disponibile.</p>;

  const radice = `/leghe/${encodeURIComponent(lega.id)}`;
  const proprietari = new Map(lega.squadre.map((s) => [s.id, s.proprietario]));
  const stagione = await stagioneDi(lega);
  const posizione = await posizioneAttuale(lega);
  const nomeSquadra = (squadraId: string): string =>
    lega.squadre.find((s) => s.id === squadraId)?.nome ?? squadraId;

  // Fantamedia subita: non e' un campo di RigaClassificaFanta (fanta/src/classifica.ts),
  // si somma dai risultati delle giornate gia' giocate, gia' disponibili qui.
  const fantapuntiSubiti = new Map<string, number>();
  for (const giornata of stagione.giornate) {
    for (const s of giornata.scontri) {
      fantapuntiSubiti.set(s.casaId, (fantapuntiSubiti.get(s.casaId) ?? 0) + s.fantapuntiOspite);
      fantapuntiSubiti.set(s.ospiteId, (fantapuntiSubiti.get(s.ospiteId) ?? 0) + s.fantapuntiCasa);
    }
  }

  return (
    <>
      <section className="riquadro">
        <h1>Classifica — Stagione {posizione.stagione}</h1>
        <p className="spiega">
          {lega.giornateGiocate === 0
            ? `La stagione non è ancora iniziata: ${posizione.giornatePerStagione} giornate in calendario.`
            : `Dopo ${posizione.giornataStagionale} giornate su ${posizione.giornatePerStagione} di questa stagione.`}
        </p>

        {lega.giornateGiocate === 0 ? (
          <p className="vuoto">Nessuna giornata giocata finora.</p>
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
                <th className="numero">DR</th>
                <th className="numero">Fantapunti</th>
                <th className="numero">FM</th>
                <th className="numero">FMa</th>
              </tr>
            </thead>
            <tbody>
              {stagione.classifica.map((r, i) => (
                <tr key={r.squadraId}>
                  <td className="numero">{i + 1}</td>
                  <td>
                    <a href={`${radice}/rose/${encodeURIComponent(r.squadraId)}`}>{r.squadraId}</a>
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
                  <td className="numero">{r.golFatti - r.golSubiti}</td>
                  <td className="numero">{r.fantapunti.toFixed(1)}</td>
                  <td className="numero">
                    {r.giocate > 0 ? (r.fantapunti / r.giocate).toFixed(1) : '—'}
                  </td>
                  <td className="numero">
                    {r.giocate > 0 ? ((fantapuntiSubiti.get(r.squadraId) ?? 0) / r.giocate).toFixed(1) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {lega.alboDoro.length > 0 && (
        <section className="riquadro">
          <h2>Albo d’oro</h2>
          <table>
            <thead>
              <tr>
                <th className="numero">Stagione</th>
                <th>Campione</th>
                <th className="numero">Punti</th>
                <th className="numero">Fantapunti</th>
              </tr>
            </thead>
            <tbody>
              {[...lega.alboDoro]
                .sort((a, b) => b.stagione - a.stagione)
                .map((v) => (
                  <tr key={v.stagione}>
                    <td className="numero">{v.stagione}</td>
                    <td>
                      <a href={`${radice}/rose/${encodeURIComponent(v.campioneSquadraId)}`}>
                        {nomeSquadra(v.campioneSquadraId)}
                      </a>
                      {proprietari.get(v.campioneSquadraId) === null && (
                        <span className="etichetta-bot">BOT</span>
                      )}
                    </td>
                    <td className="numero">{v.puntiCampione}</td>
                    <td className="numero">{v.fantapuntiCampione.toFixed(1)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}

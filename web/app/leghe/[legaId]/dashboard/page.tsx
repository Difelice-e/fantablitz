import { legaAutorizzata, posizioneAttuale, stagioneDi } from '../../../../src/dati.ts';
import { amministraLega, sonoAmministratore } from '../../../../src/admin.ts';
import { configurato, emailUtente } from '../../../../src/supabase/server.ts';
import { orarioCicloLocale } from '../../../../src/ciclo.ts';
import { scontriDi } from '../../../../../fanta/src/calendarioFanta.ts';

export const dynamic = 'force-dynamic';

export default async function Dashboard({ params }: { params: Promise<{ legaId: string }> }) {
  const { legaId } = await params;
  const id = decodeURIComponent(legaId);
  const stato = await legaAutorizzata(id);
  if (!stato) return <p className="vuoto">Lega non disponibile.</p>;

  const radice = `/leghe/${encodeURIComponent(stato.id)}`;
  const email = configurato() ? await emailUtente() : null;
  const squadraPropria = email ? stato.squadre.find((s) => s.proprietario === email) : undefined;
  const admin = await amministraLega(stato);
  const superadmin = await sonoAmministratore();

  const stagione = await stagioneDi(stato);
  const posizione = await posizioneAttuale(stato);
  const nomeSquadra = (squadraId: string): string =>
    stato.squadre.find((s) => s.id === squadraId)?.nome ?? squadraId;

  const rigaPropria = squadraPropria
    ? stagione.classifica.find((r) => r.squadraId === squadraPropria.id)
    : undefined;
  const posizionePropria = squadraPropria
    ? stagione.classifica.findIndex((r) => r.squadraId === squadraPropria.id) + 1
    : 0;

  const incontriPropri = squadraPropria ? scontriDi(stagione.calendario, squadraPropria.id) : [];
  const prossimo = incontriPropri.find((e) => e.giornata.numero > stato.giornateGiocate);
  const precedenti = incontriPropri.filter((e) => e.giornata.numero <= stato.giornateGiocate);
  const ultimo = precedenti[precedenti.length - 1];
  const risultatoUltimo = ultimo
    ? stagione.giornate
        .find((g) => g.numero === ultimo.giornata.numero)
        ?.scontri.find(
          (s) => s.casaId === ultimo.scontro.casaId && s.ospiteId === ultimo.scontro.ospiteId,
        )
    : undefined;

  const avversarioDi = (casaId: string, ospiteId: string, squadraId: string): string =>
    casaId === squadraId ? ospiteId : casaId;

  return (
    <>
      <section className="riquadro">
        <h1>{stato.nome}</h1>
        {stato.giornateGiocate === 0 ? (
          <p className="vuoto">
            Schiera la formazione: la prima giornata si gioca da sola ogni sera, verso le{' '}
            {orarioCicloLocale()} (ora italiana).
            {superadmin && (
              <>
                {' '}
                Se vuoi testare subito senza aspettare, usa «Simula la giornata adesso» nella{' '}
                <a href={`${radice}/admin`}>pagina di amministrazione</a> della lega.
              </>
            )}
          </p>
        ) : (
          <p className="spiega">
            Stagione {posizione.stagione}, giornata {posizione.giornataStagionale} di{' '}
            {posizione.giornatePerStagione}.
          </p>
        )}
      </section>

      {squadraPropria && (
        <section className="riquadro">
          <h2>{squadraPropria.nome}</h2>
          <p className="spiega">
            {rigaPropria
              ? `${posizionePropria}° in classifica — ${rigaPropria.punti} punti in ${rigaPropria.giocate} partite, ${rigaPropria.fantapunti.toFixed(1)} fantapunti totali.`
              : 'La stagione non è ancora iniziata.'}
          </p>
          <div className="azioni">
            <a href={`${radice}/rose/${encodeURIComponent(squadraPropria.id)}`}>
              <button className="secondario">Vai alla rosa</button>
            </a>
          </div>
        </section>
      )}

      {prossimo && (
        <section className="riquadro">
          <h2>Prossima giornata — {prossimo.giornata.numero}</h2>
          <p className="spiega">
            Contro <strong>{nomeSquadra(avversarioDi(prossimo.scontro.casaId, prossimo.scontro.ospiteId, squadraPropria!.id))}</strong>.
            Si gioca verso le {orarioCicloLocale()} (ora italiana), quando il ciclo automatico
            arriverà a questa giornata.
          </p>
        </section>
      )}

      {ultimo && risultatoUltimo && (
        <section className="riquadro">
          <h2>Ultima giornata — {ultimo.giornata.numero}</h2>
          <p className="spiega">
            {nomeSquadra(risultatoUltimo.casaId)} {risultatoUltimo.golCasa}–{risultatoUltimo.golOspite}{' '}
            {nomeSquadra(risultatoUltimo.ospiteId)}
            {' '}({risultatoUltimo.fantapuntiCasa.toFixed(1)} — {risultatoUltimo.fantapuntiOspite.toFixed(1)})
          </p>
          <p className="azioni">
            <a href={`${radice}/calendario/${ultimo.giornata.numero}/${encodeURIComponent(squadraPropria!.id)}`}>
              Vedi dettaglio
            </a>
          </p>
        </section>
      )}

      <section className="riquadro">
        <h2>Classifica</h2>
        {stagione.classifica.length === 0 ? (
          <p className="vuoto">Nessuna giornata giocata finora.</p>
        ) : (
          <table>
            <tbody>
              {stagione.classifica.slice(0, 5).map((r, i) => (
                <tr key={r.squadraId}>
                  <td className="numero" style={{ width: '2rem' }}>
                    {i + 1}
                  </td>
                  <td>
                    {nomeSquadra(r.squadraId)}
                    {stato.squadre.find((s) => s.id === r.squadraId)?.proprietario === null && (
                      <span className="etichetta-bot">BOT</span>
                    )}
                  </td>
                  <td className="numero">
                    <strong>{r.punti} pt</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="azioni">
          <a href={`${radice}/classifica`}>Vai alla classifica completa</a>
        </p>
      </section>

      <section className="riquadro">
        <h2>Sezioni</h2>
        <div className="azioni">
          <a href={`${radice}/rose`}>
            <button className="secondario">Rose</button>
          </a>
          <a href={`${radice}/calendario`}>
            <button className="secondario">Calendario</button>
          </a>
          <a href={`${radice}/sala-stampa`}>
            <button className="secondario">Sala stampa</button>
          </a>
        </div>
      </section>

      {admin && (
        <section className="riquadro">
          <p className="spiega">Modifica le impostazioni di questa lega: squadre, parola d’ordine.</p>
          <p className="azioni">
            <a href={`${radice}/admin`}>
              <button className="secondario">Impostazioni</button>
            </a>
          </p>
        </section>
      )}
    </>
  );
}

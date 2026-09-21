import { contesto, legaAutorizzata, nomiGiocatori, stagioneDi } from '../../../../../src/dati.ts';
import { giornatePerStagione, posizioneStagione } from '../../../../../../jobs/src/stagioni.ts';

export const dynamic = 'force-dynamic';

export default async function Giornata({
  params,
}: {
  params: Promise<{ legaId: string; n: string }>;
}) {
  const { legaId, n } = await params;
  const numero = Number(n);
  const lega = await legaAutorizzata(decodeURIComponent(legaId));
  if (!lega) return <p className="vuoto">Lega non disponibile.</p>;

  const radice = `/leghe/${encodeURIComponent(lega.id)}`;

  if (!Number.isInteger(numero) || numero < 1 || numero > lega.giornateGiocate) {
    return (
      <section className="riquadro">
        <h1>Giornata {n}</h1>
        <p className="avviso">Questa giornata non è ancora stata giocata.</p>
      </section>
    );
  }

  const stagione = await stagioneDi(lega);
  const giornata = stagione.giornate.find((g) => g.numero === numero);
  const nomi = await nomiGiocatori();
  const proprietari = new Map(lega.squadre.map((s) => [s.id, s.proprietario]));
  const bot = (squadraId: string): React.ReactNode =>
    proprietari.get(squadraId) === null && <span className="etichetta-bot">BOT</span>;

  if (!giornata) return <p className="vuoto">Giornata non trovata.</p>;

  const c = await contesto();
  const nomeClub = (id: string): string => c.mondo.clubPerId.get(id)?.nome ?? id;
  const editoriale = lega.editoriali.find((e) => e.giornata === numero);
  const cronache = lega.cronache.filter((cr) => cr.giornata === numero);
  const chat = lega.chat.filter((m) => m.giornata === numero);
  const nome = (id: string): string => nomi.get(id) ?? id;
  const nomeSquadra = (squadraId: string): string =>
    lega.squadre.find((s) => s.id === squadraId)?.nome ?? squadraId;

  const gps = giornatePerStagione(c.mondo);
  const posizione = posizioneStagione(numero, gps);
  const primaDellaStagione = posizione.giornataStagionale === 1;
  const verdettoPrecedente = primaDellaStagione
    ? lega.alboDoro.find((v) => v.stagione === posizione.stagione - 1)
    : undefined;
  const vociMercato = primaDellaStagione
    ? lega.vociMercato.find((v) => v.stagione === posizione.stagione)
    : undefined;

  return (
    <>
      <section className="riquadro">
        <h1>
          Giornata {numero} <span style={{ color: 'var(--tenue)', fontWeight: 400, fontSize: '0.85rem' }}>
            (stagione {posizione.stagione}, giornata {posizione.giornataStagionale} di {gps})
          </span>
        </h1>
        <p className="spiega">
          Il punteggio in grande sono i gol, quello piccolo i fantapunti da cui derivano. Clicca il
          punteggio per il dettaglio di una partita.
        </p>
        {giornata.scontri.map((s) => (
          <div className="scontro" key={`${s.casaId}-${s.ospiteId}`}>
            <span className="casa">
              <a href={`${radice}/rose/${encodeURIComponent(s.casaId)}`}>{s.casaId}</a>
              {bot(s.casaId)}
            </span>
            <a
              className="punteggio"
              href={`${radice}/calendario/${numero}/${encodeURIComponent(s.casaId)}`}
            >
              {s.golCasa}–{s.golOspite}
              <span className="fanta">
                {s.fantapuntiCasa.toFixed(1)} — {s.fantapuntiOspite.toFixed(1)}
              </span>
            </a>
            <span>
              <a href={`${radice}/rose/${encodeURIComponent(s.ospiteId)}`}>{s.ospiteId}</a>
              {bot(s.ospiteId)}
            </span>
          </div>
        ))}
      </section>

      {(verdettoPrecedente || vociMercato) && (
        <section className="riquadro">
          <h2>Inizio stagione {posizione.stagione}</h2>
          {verdettoPrecedente && (
            <p className="spiega">
              La stagione {verdettoPrecedente.stagione} l’ha vinta{' '}
              <a href={`${radice}/rose/${encodeURIComponent(verdettoPrecedente.campioneSquadraId)}`}>
                {nomeSquadra(verdettoPrecedente.campioneSquadraId)}
              </a>
              {bot(verdettoPrecedente.campioneSquadraId)}, con {verdettoPrecedente.puntiCampione} punti e{' '}
              {verdettoPrecedente.fantapuntiCampione.toFixed(1)} fantapunti.
            </p>
          )}
          {vociMercato && (
            <p>
              {vociMercato.testo}
              {vociMercato.fonte === 'template' && (
                <span className="etichetta" title="Il provider AI non era raggiungibile: testo da modello fisso.">
                  da modello
                </span>
              )}
            </p>
          )}
        </section>
      )}

      {editoriale && (
        <section className="riquadro">
          <h2>
            Editoriale
            {editoriale.fonte === 'template' && (
              <span className="etichetta" title="Il provider AI non era raggiungibile: testo da modello fisso.">
                da modello
              </span>
            )}
          </h2>
          <p>{editoriale.testo}</p>
        </section>
      )}

      {cronache.length > 0 && (
        <section className="riquadro">
          <h2>Cronache dal campionato</h2>
          <p className="spiega">Il mondo simulato gioca dieci partite a giornata, indipendenti dagli scontri fanta qui sopra.</p>
          <div className="griglia-due">
            {cronache.map((cr) => (
              <div key={`${cr.casaId}-${cr.ospiteId}`}>
                <h3>
                  {nomeClub(cr.casaId)} — {nomeClub(cr.ospiteId)}
                  {cr.fonte === 'template' && (
                    <span className="etichetta" title="Il provider AI non era raggiungibile: testo da modello fisso.">
                      da modello
                    </span>
                  )}
                </h3>
                <p style={{ fontSize: '0.9rem' }}>{cr.testo}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {chat.length > 0 && (
        <section className="riquadro">
          <h2>Chat</h2>
          <p className="spiega">I bot commentano solo le proprie sconfitte pesanti e i propri scambi: mai a caso.</p>
          {chat.map((m) => (
            <p key={m.id} style={{ margin: '0.4rem 0' }}>
              <strong>{nomeSquadra(m.squadraId)}</strong>
              {bot(m.squadraId)}: {m.testo}
              {m.fonte === 'template' && (
                <span className="etichetta" title="Il provider AI non era raggiungibile: testo da modello fisso.">
                  da modello
                </span>
              )}
            </p>
          ))}
        </section>
      )}

      <section className="riquadro">
        <h2>Cosa è successo alle formazioni</h2>
        <p className="spiega">
          Chi non prende voto viene sostituito dalla panchina, come nel fantacalcio vero. Se la
          panchina non basta, la casella resta scoperta e vale zero.
        </p>

        {giornata.squadre.every(
          (s) => s.cambi.length === 0 && s.slotScoperti.length === 0 && s.adattati.length === 0,
        ) ? (
          <p className="vuoto">Nessuna sostituzione: tutti hanno preso voto.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Squadra</th>
                <th>Sostituzioni automatiche</th>
                <th className="numero">Scoperti</th>
              </tr>
            </thead>
            <tbody>
              {giornata.squadre.map((s) => (
                <tr key={s.squadraId}>
                  <td>
                    <a href={`${radice}/rose/${encodeURIComponent(s.squadraId)}`}>{s.squadraId}</a>
                    {bot(s.squadraId)}
                  </td>
                  <td>
                    {s.cambi.length === 0
                      ? '—'
                      : s.cambi.map((c) => `${nome(c.esce)} → ${nome(c.entra)}`).join(', ')}
                  </td>
                  <td className="numero">{s.slotScoperti.length || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

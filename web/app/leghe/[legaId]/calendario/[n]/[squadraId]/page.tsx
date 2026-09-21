import Link from 'next/link';
import { contesto, legaAutorizzata, nomiGiocatori, stagioneDi } from '../../../../../../src/dati.ts';
import { giornatePerStagione, posizioneStagione } from '../../../../../../../jobs/src/stagioni.ts';
import { eventiDaPrestazione } from '../../../../../../../jobs/src/ciclo.ts';
import type { EventiFanta } from '../../../../../../../fanta/src/fantavoto.ts';

export const dynamic = 'force-dynamic';

/** I simboli di bonus e malus di un giocatore, come li mostra Fantacalcio.it. */
function IconeBonus({ eventi }: { eventi: EventiFanta }) {
  const pezzi: { icona: string; etichetta: string }[] = [];
  for (let i = 0; i < eventi.gol; i++) pezzi.push({ icona: '⚽', etichetta: 'gol' });
  for (let i = 0; i < eventi.rigoriSegnati; i++) pezzi.push({ icona: '🎯', etichetta: 'rigore segnato' });
  for (let i = 0; i < eventi.assist; i++) pezzi.push({ icona: '👟', etichetta: 'assist' });
  for (let i = 0; i < eventi.rigoriParati; i++) pezzi.push({ icona: '🧤', etichetta: 'rigore parato' });
  for (let i = 0; i < eventi.rigoriSbagliati; i++) pezzi.push({ icona: '❌', etichetta: 'rigore sbagliato' });
  for (let i = 0; i < eventi.autogol; i++) pezzi.push({ icona: '🔴', etichetta: 'autogol' });
  for (let i = 0; i < eventi.ammonizioni; i++) pezzi.push({ icona: '🟨', etichetta: 'ammonizione' });
  if (eventi.espulso) pezzi.push({ icona: '🟥', etichetta: 'espulsione' });
  if (pezzi.length === 0) return null;

  return (
    <span style={{ fontSize: '0.9rem', letterSpacing: '0.05em' }}>
      {pezzi.map((p, i) => (
        <span key={i} title={p.etichetta}>
          {p.icona}
        </span>
      ))}
    </span>
  );
}

export default async function DettaglioPartita({
  params,
}: {
  params: Promise<{ legaId: string; n: string; squadraId: string }>;
}) {
  const { legaId, n, squadraId } = await params;
  const numero = Number(n);
  const id = decodeURIComponent(squadraId);
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
  const scontro = giornata?.scontri.find((s) => s.casaId === id || s.ospiteId === id);
  if (!giornata || !scontro) {
    return (
      <section className="riquadro">
        <h1>Partita non trovata</h1>
        <p className="avviso errore">Nessun incontro di «{id}» nella giornata {numero}.</p>
      </section>
    );
  }

  const squadraCasa = giornata.squadre.find((s) => s.squadraId === scontro.casaId)!;
  const squadraOspite = giornata.squadre.find((s) => s.squadraId === scontro.ospiteId)!;
  const nomi = await nomiGiocatori();
  const nome = (giocatoreId: string): string => nomi.get(giocatoreId) ?? giocatoreId;
  const proprietari = new Map(lega.squadre.map((s) => [s.id, s.proprietario]));
  const nomeSquadra = (squadraId: string): string =>
    lega.squadre.find((s) => s.id === squadraId)?.nome ?? squadraId;
  const bot = (squadraId: string): React.ReactNode =>
    proprietari.get(squadraId) === null && <span className="etichetta-bot">BOT</span>;

  // Gli eventi (gol, assist, cartellini...) sono del mondo simulato, non della
  // lega: si prendono dalle partite di quella giornata, non da `punteggio`,
  // che ha gia' ridotto tutto al solo bonus netto (fanta/src/fantavoto.ts).
  const prestazioniMondo = new Map(
    stagione.mondo.partite
      .filter((p) => p.giornata === numero)
      .flatMap((p) => p.prestazioni.map((pr) => [pr.giocatoreId, pr] as const)),
  );

  const c = await contesto();
  const nomeClub = (id: string): string => c.mondo.clubPerId.get(id)?.nome ?? id;
  const editoriale = lega.editoriali.find((e) => e.giornata === numero);
  const cronache = lega.cronache.filter((cr) => cr.giornata === numero);
  const chat = lega.chat.filter((m) => m.giornata === numero);

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
          Giornata {numero}{' '}
          <span style={{ color: 'var(--tenue)', fontWeight: 400, fontSize: '0.85rem' }}>
            (stagione {posizione.stagione}, giornata {posizione.giornataStagionale} di {gps})
          </span>
        </h1>
      </section>

      <div className="griglia-due">
        <section className="riquadro">
          <h2>Incontri</h2>
          {giornata.scontri.map((s) => {
            const selezionato = s.casaId === scontro.casaId && s.ospiteId === scontro.ospiteId;
            return (
              <div key={`${s.casaId}-${s.ospiteId}`} style={{ padding: '0.4rem 0', borderBottom: '1px solid var(--bordo)' }}>
                {selezionato ? (
                  <strong>
                    {nomeSquadra(s.casaId)} {s.golCasa}–{s.golOspite} {nomeSquadra(s.ospiteId)}
                  </strong>
                ) : (
                  <Link href={`${radice}/calendario/${numero}/${encodeURIComponent(s.casaId)}`}>
                    {nomeSquadra(s.casaId)} {s.golCasa}–{s.golOspite} {nomeSquadra(s.ospiteId)}
                  </Link>
                )}
                <div style={{ fontSize: '0.8rem', color: 'var(--tenue)' }}>
                  {s.fantapuntiCasa.toFixed(1)} — {s.fantapuntiOspite.toFixed(1)} fantapunti
                </div>
              </div>
            );
          })}
        </section>

        <section className="riquadro">
          <h2>
            {nomeSquadra(scontro.casaId)} {scontro.golCasa}–{scontro.golOspite}{' '}
            {nomeSquadra(scontro.ospiteId)}
          </h2>
          <p className="spiega">
            {squadraCasa.punteggio.fantapunti.toFixed(1)} — {squadraOspite.punteggio.fantapunti.toFixed(1)} fantapunti.{' '}
            {squadraCasa.formazione.modulo} contro {squadraOspite.formazione.modulo}.
          </p>

          <div className="griglia-due">
            {[squadraCasa, squadraOspite].map((s) => (
              <div key={s.squadraId}>
                <h3>
                  {nomeSquadra(s.squadraId)} — {s.punteggio.fantapunti.toFixed(1)}
                  {bot(s.squadraId)}
                </h3>
                <table>
                  <tbody>
                    {s.punteggio.prestazioni.map((p) => {
                      const eventi = prestazioniMondo.get(p.giocatoreId);
                      return (
                        <tr key={p.giocatoreId}>
                          <td>{nome(p.giocatoreId)}</td>
                          <td className="numero">{p.voto === null ? 's.v.' : p.voto.toFixed(1)}</td>
                          <td className="numero" title={`bonus netto: ${p.bonus > 0 ? `+${p.bonus}` : p.bonus}`}>
                            {eventi && <IconeBonus eventi={eventiDaPrestazione(eventi)} />}
                          </td>
                          <td className="numero">
                            <strong>{p.fantavoto === null ? '0' : p.fantavoto.toFixed(1)}</strong>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3} style={{ color: 'var(--tenue)' }}>
                        {s.punteggio.difesa.applicato
                          ? `Modificatore difesa (media ${s.punteggio.difesa.media?.toFixed(2)})`
                          : `Modificatore difesa: ${s.punteggio.difesa.motivo}`}
                      </td>
                      <td className="numero">
                        <strong>
                          {s.punteggio.difesa.bonus > 0 ? `+${s.punteggio.difesa.bonus}` : '—'}
                        </strong>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ))}
          </div>
        </section>
      </div>

      {(verdettoPrecedente || vociMercato) && (
        <section className="riquadro">
          <h2>Inizio stagione {posizione.stagione}</h2>
          {verdettoPrecedente && (
            <p className="spiega">
              La stagione {verdettoPrecedente.stagione} l’ha vinta{' '}
              <Link href={`${radice}/rose/${encodeURIComponent(verdettoPrecedente.campioneSquadraId)}`}>
                {nomeSquadra(verdettoPrecedente.campioneSquadraId)}
              </Link>
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
                    <Link href={`${radice}/rose/${encodeURIComponent(s.squadraId)}`}>{s.squadraId}</Link>
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

import { legaAutorizzata, nomiGiocatori } from '../../../../../../src/dati.ts';
import { configurato, emailUtente } from '../../../../../../src/supabase/server.ts';
import { scambiDiSquadra } from '../../../../../../../jobs/src/scambi.ts';
import type { ScambioSalvato } from '../../../../../../../jobs/src/archivio.ts';
import ScambioForm from './ScambioForm.tsx';
import RispostaScambio from './RispostaScambio.tsx';

export const dynamic = 'force-dynamic';

const ETICHETTA_STATO: Record<ScambioSalvato['stato'], string> = {
  proposto: 'In attesa',
  accettato: 'Accettato',
  rifiutato: 'Rifiutato',
  ritirato: 'Ritirato',
};

export default async function PaginaScambi({
  params,
}: {
  params: Promise<{ legaId: string; id: string }>;
}) {
  const { legaId, id } = await params;
  const squadraId = decodeURIComponent(id);
  const lega = await legaAutorizzata(decodeURIComponent(legaId));
  if (!lega) return <p className="vuoto">Lega non disponibile.</p>;

  const radice = `/leghe/${encodeURIComponent(lega.id)}`;
  const squadra = lega.squadre.find((s) => s.id === squadraId);
  if (!squadra) {
    return (
      <section className="riquadro">
        <h1>Squadra sconosciuta</h1>
        <p className="avviso errore">Nessuna squadra si chiama «{squadraId}».</p>
      </section>
    );
  }

  const email = configurato() ? await emailUtente() : null;
  const miaSquadra = !configurato() || email === squadra.proprietario;

  const nomi = await nomiGiocatori();
  const nomeGiocatore = (giocatoreId: string): string => nomi.get(giocatoreId) ?? giocatoreId;
  const nomeSquadra = (id: string): string => lega.squadre.find((s) => s.id === id)?.nome ?? id;

  const storico = scambiDiSquadra(lega, squadraId);
  const inArrivo = storico.filter((s) => s.stato === 'proposto' && s.aSquadraId === squadraId);
  const inUscita = storico.filter((s) => s.stato === 'proposto' && s.daSquadraId === squadraId);
  const risolti = storico.filter((s) => s.stato !== 'proposto');

  const descrivi = (s: ScambioSalvato): string => {
    const daNoi = s.daSquadraId === squadraId;
    const noi = daNoi ? s.offerti : s.richiesti;
    const loro = daNoi ? s.richiesti : s.offerti;
    return `${noi.map(nomeGiocatore).join(', ')} ⇄ ${loro.map(nomeGiocatore).join(', ')}`;
  };

  return (
    <>
      <section className="riquadro">
        <h1>
          Scambi — {squadra.nome}
          {squadra.proprietario === null && <span className="etichetta-bot">BOT</span>}
        </h1>
        <p className="spiega">
          {miaSquadra
            ? 'Proponi uno scambio a un’altra squadra, oppure rispondi a quelli ricevuti. Verso un bot la risposta arriva subito; verso una persona resta in attesa.'
            : 'Storico degli scambi di questa squadra: fa parte del gioco, come vedere la rosa degli avversari.'}
        </p>
        <p className="azioni">
          <a href={`${radice}/rose/${encodeURIComponent(squadraId)}`}>Torna alla rosa</a>
        </p>
      </section>

      {miaSquadra && (
        <section className="riquadro">
          <h2>Proponi uno scambio</h2>
          <ScambioForm
            legaId={lega.id}
            squadraId={squadra.id}
            propriGiocatori={squadra.giocatori.map((g) => ({
              id: g.giocatoreId, nome: nomeGiocatore(g.giocatoreId),
            }))}
            controparti={lega.squadre
              .filter((s) => s.id !== squadra.id)
              .map((s) => ({
                id: s.id,
                nome: s.nome,
                bot: s.proprietario === null,
                giocatori: s.giocatori.map((g) => ({ id: g.giocatoreId, nome: nomeGiocatore(g.giocatoreId) })),
              }))}
          />
        </section>
      )}

      {miaSquadra && inArrivo.length > 0 && (
        <section className="riquadro">
          <h2>Proposte ricevute</h2>
          <table>
            <tbody>
              {inArrivo.map((s) => (
                <tr key={s.id}>
                  <td>{nomeSquadra(s.daSquadraId)}</td>
                  <td>{descrivi(s)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <RispostaScambio legaId={lega.id} scambioId={s.id} modo="rispondi" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {miaSquadra && inUscita.length > 0 && (
        <section className="riquadro">
          <h2>Proposte in attesa</h2>
          <table>
            <tbody>
              {inUscita.map((s) => (
                <tr key={s.id}>
                  <td>{nomeSquadra(s.aSquadraId)}</td>
                  <td>{descrivi(s)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <RispostaScambio legaId={lega.id} scambioId={s.id} modo="ritira" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {risolti.length > 0 && (
        <section className="riquadro">
          <h2>Storico</h2>
          <table>
            <tbody>
              {risolti.map((s) => (
                <tr key={s.id}>
                  <td>{nomeSquadra(s.daSquadraId)} ⇄ {nomeSquadra(s.aSquadraId)}</td>
                  <td>{descrivi(s)}</td>
                  <td>{ETICHETTA_STATO[s.stato]}</td>
                  <td style={{ color: 'var(--tenue)', fontSize: '0.85rem' }}>{s.motivo ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}

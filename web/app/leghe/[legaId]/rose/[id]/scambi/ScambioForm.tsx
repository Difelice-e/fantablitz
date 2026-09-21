'use client';

import { useMemo, useState, useTransition } from 'react';
import { proponiScambioAzione } from './azioni.ts';

type Giocatore = { id: string; nome: string };
type Controparte = { id: string; nome: string; bot: boolean; giocatori: Giocatore[] };

export default function ScambioForm({
  legaId,
  squadraId,
  propriGiocatori,
  controparti,
}: {
  legaId: string;
  squadraId: string;
  propriGiocatori: Giocatore[];
  controparti: Controparte[];
}) {
  const [aSquadraId, setASquadraId] = useState(controparti[0]?.id ?? '');
  const [offerti, setOfferti] = useState<Set<string>>(new Set());
  const [richiesti, setRichiesti] = useState<Set<string>>(new Set());
  const [messaggio, setMessaggio] = useState<{ testo: string; ok: boolean } | null>(null);
  const [inCorso, avvia] = useTransition();

  const controparte = useMemo(
    () => controparti.find((c) => c.id === aSquadraId) ?? null,
    [controparti, aSquadraId],
  );

  function cambiaControparte(id: string): void {
    setASquadraId(id);
    setRichiesti(new Set());
  }

  function scambia(insieme: Set<string>, id: string): Set<string> {
    const nuovo = new Set(insieme);
    if (nuovo.has(id)) nuovo.delete(id);
    else nuovo.add(id);
    return nuovo;
  }

  function invia(): void {
    avvia(async () => {
      const esito = await proponiScambioAzione(
        legaId, squadraId, aSquadraId, [...offerti], [...richiesti],
      );
      setMessaggio({ testo: esito.messaggio, ok: esito.riuscito });
      if (esito.riuscito) {
        setOfferti(new Set());
        setRichiesti(new Set());
      }
    });
  }

  if (controparti.length === 0) {
    return <p className="vuoto">Non ci sono altre squadre con cui scambiare.</p>;
  }

  return (
    <>
      <p>
        <label>
          Scambia con
          <br />
          <select value={aSquadraId} onChange={(e) => cambiaControparte(e.target.value)}>
            {controparti.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}{c.bot ? ' (bot)' : ''}
              </option>
            ))}
          </select>
        </label>
      </p>

      <div className="griglia-due">
        <div>
          <h3>Offri</h3>
          {propriGiocatori.map((g) => (
            <label key={g.id} style={{ display: 'block', fontSize: '0.9rem', padding: '0.15rem 0' }}>
              <input
                type="checkbox"
                checked={offerti.has(g.id)}
                onChange={() => setOfferti(scambia(offerti, g.id))}
              />{' '}
              {g.nome}
            </label>
          ))}
        </div>
        <div>
          <h3>Chiedi</h3>
          {controparte?.giocatori.map((g) => (
            <label key={g.id} style={{ display: 'block', fontSize: '0.9rem', padding: '0.15rem 0' }}>
              <input
                type="checkbox"
                checked={richiesti.has(g.id)}
                onChange={() => setRichiesti(scambia(richiesti, g.id))}
              />{' '}
              {g.nome}
            </label>
          ))}
        </div>
      </div>

      {messaggio && (
        <p className={`avviso ${messaggio.ok ? 'ok' : 'errore'}`}>{messaggio.testo}</p>
      )}

      <div className="azioni">
        <button
          className="principale"
          onClick={invia}
          disabled={inCorso || offerti.size === 0 || richiesti.size === 0}
        >
          {inCorso ? 'Invio…' : 'Proponi lo scambio'}
        </button>
      </div>
    </>
  );
}

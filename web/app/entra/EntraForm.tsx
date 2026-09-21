'use client';

import { useState, useTransition } from 'react';
import { cercaSquadreLibere, scegliSquadra, type SquadraLibera } from './azioni.ts';

export default function EntraForm() {
  const [nomeLega, setNomeLega] = useState('');
  const [parola, setParola] = useState('');
  const [squadre, setSquadre] = useState<SquadraLibera[] | null>(null);
  const [messaggio, setMessaggio] = useState<{ testo: string; ok: boolean } | null>(null);
  const [fatto, setFatto] = useState<{ testo: string; legaId: string } | null>(null);
  const [inCorso, avvia] = useTransition();

  function cerca(): void {
    avvia(async () => {
      setMessaggio(null);
      const esito = await cercaSquadreLibere(nomeLega, parola);
      if (!esito.trovate) {
        setSquadre(null);
        setMessaggio({ testo: esito.messaggio, ok: false });
        return;
      }
      setSquadre(esito.squadre);
    });
  }

  function scegli(squadraId: string): void {
    avvia(async () => {
      const legaId = squadre?.find((s) => s.squadraId === squadraId)?.legaId;
      const esito = await scegliSquadra(nomeLega, parola, squadraId);
      setMessaggio({ testo: esito.messaggio, ok: esito.riuscito });
      if (esito.riuscito && legaId) setFatto({ testo: esito.messaggio, legaId });
    });
  }

  if (fatto) {
    return (
      <>
        <p className="avviso ok">{fatto.testo}</p>
        <p className="azioni">
          <a href={`/leghe/${encodeURIComponent(fatto.legaId)}/dashboard`}>Vai alla lega</a>
        </p>
      </>
    );
  }

  return (
    <>
      <p>
        <label>
          Nome della lega
          <br />
          <input
            value={nomeLega}
            onChange={(e) => setNomeLega(e.target.value)}
            style={{ width: '100%' }}
          />
        </label>
      </p>
      <p>
        <label>
          Parola d’ordine
          <br />
          <input
            type="password"
            value={parola}
            onChange={(e) => setParola(e.target.value)}
            style={{ width: '100%' }}
          />
        </label>
      </p>

      {messaggio && (
        <p className={`avviso ${messaggio.ok ? 'ok' : 'errore'}`}>{messaggio.testo}</p>
      )}

      {!squadre && (
        <div className="azioni">
          <button
            className="principale"
            onClick={cerca}
            disabled={inCorso || !nomeLega.trim() || !parola}
          >
            {inCorso ? 'Cerco…' : 'Cerca la lega'}
          </button>
        </div>
      )}

      {squadre && (
        <>
          <h2 style={{ marginTop: '1.5rem' }}>Squadre libere</h2>
          <table>
            <tbody>
              {squadre.map((s) => (
                <tr key={s.squadraId}>
                  <td>{s.squadraNome}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      className="secondario"
                      onClick={() => scegli(s.squadraId)}
                      disabled={inCorso}
                    >
                      Scegli
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}

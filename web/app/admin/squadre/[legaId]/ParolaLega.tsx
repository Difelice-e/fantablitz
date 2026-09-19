'use client';

import { useState, useTransition } from 'react';
import { impostaParolaLega } from '../../azioni.ts';

export default function ParolaLega({ legaId }: { legaId: string }) {
  const [parola, setParola] = useState('');
  const [messaggio, setMessaggio] = useState<{ testo: string; ok: boolean } | null>(null);
  const [inCorso, avvia] = useTransition();

  function salva(): void {
    avvia(async () => {
      const esito = await impostaParolaLega(legaId, parola);
      setMessaggio({ testo: esito.messaggio, ok: esito.riuscito });
      if (esito.riuscito) setParola('');
    });
  }

  return (
    <>
      <p className="spiega">
        Chi la conosce insieme al nome della lega può entrare da{' '}
        <code>/entra</code> e scegliere una squadra libera. Impostarne una nuova sostituisce
        quella attuale.
      </p>
      <div className="azioni">
        <input
          type="text"
          value={parola}
          onChange={(e) => setParola(e.target.value)}
          placeholder="almeno 6 caratteri"
          style={{ flex: 1 }}
        />
        <button
          className="secondario"
          onClick={salva}
          disabled={inCorso || parola.trim().length < 6}
        >
          {inCorso ? 'Salvo…' : 'Imposta'}
        </button>
      </div>
      {messaggio && (
        <p className={`avviso ${messaggio.ok ? 'ok' : 'errore'}`} style={{ marginTop: '0.5rem' }}>
          {messaggio.testo}
        </p>
      )}
    </>
  );
}

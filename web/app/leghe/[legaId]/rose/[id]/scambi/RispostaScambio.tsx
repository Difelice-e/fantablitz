'use client';

import { useState, useTransition } from 'react';
import { ritiraScambioAzione, rispondiScambioAzione } from './azioni.ts';

export default function RispostaScambio({
  legaId,
  scambioId,
  modo,
}: {
  legaId: string;
  scambioId: string;
  /** "rispondi": e' arrivata a me e posso accettarla o rifiutarla. "ritira": l'ho proposta io. */
  modo: 'rispondi' | 'ritira';
}) {
  const [messaggio, setMessaggio] = useState<string | null>(null);
  const [fatto, setFatto] = useState(false);
  const [inCorso, avvia] = useTransition();

  function rispondi(accetta: boolean): void {
    avvia(async () => {
      const esito = await rispondiScambioAzione(legaId, scambioId, accetta);
      setMessaggio(esito.messaggio);
      if (esito.riuscito) setFatto(true);
    });
  }

  function ritira(): void {
    avvia(async () => {
      const esito = await ritiraScambioAzione(legaId, scambioId);
      setMessaggio(esito.messaggio);
      if (esito.riuscito) setFatto(true);
    });
  }

  if (fatto) return <span style={{ fontSize: '0.85rem', color: 'var(--tenue)' }}>{messaggio}</span>;

  return (
    <span style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
      {modo === 'rispondi' ? (
        <>
          <button className="principale" onClick={() => rispondi(true)} disabled={inCorso}>
            Accetta
          </button>
          <button className="secondario" onClick={() => rispondi(false)} disabled={inCorso}>
            Rifiuta
          </button>
        </>
      ) : (
        <button className="secondario" onClick={ritira} disabled={inCorso}>
          Ritira
        </button>
      )}
      {messaggio && !fatto && (
        <span style={{ fontSize: '0.8rem', color: 'var(--negativo)' }}>{messaggio}</span>
      )}
    </span>
  );
}

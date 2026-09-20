'use client';

import { useState, useTransition } from 'react';
import { simulaOraAzione } from '../../azioni.ts';

export default function SimulaOra({ legaId }: { legaId: string }) {
  const [messaggio, setMessaggio] = useState<{ testo: string; ok: boolean } | null>(null);
  const [inCorso, avvia] = useTransition();

  function simula(): void {
    avvia(async () => {
      const esito = await simulaOraAzione(legaId);
      setMessaggio({ testo: esito.messaggio, ok: esito.riuscito });
    });
  }

  return (
    <>
      <p className="spiega">
        Gioca subito il ciclo di questa lega, senza aspettare l’orario fisso del job automatico —
        utile per testare o per non aspettare la sera. Visibile solo al superadmin: il cron continua
        comunque a giocarla da solo ogni sera.
      </p>
      <div className="azioni">
        <button className="secondario" onClick={simula} disabled={inCorso}>
          {inCorso ? 'Simulo…' : 'Simula la giornata adesso'}
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

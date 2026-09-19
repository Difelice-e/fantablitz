'use client';

import { useRef, useState, useTransition } from 'react';
import { creaLega, type EsitoCreazione } from './azioni.ts';

export default function CreaLegaForm() {
  const [esito, setEsito] = useState<EsitoCreazione | null>(null);
  const [inCorso, avvia] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function invia(dati: FormData): void {
    avvia(async () => {
      const risultato = await creaLega(dati);
      setEsito(risultato);
      if (risultato.riuscito) formRef.current?.reset();
    });
  }

  return (
    <form ref={formRef} action={invia}>
      <p>
        <label>
          Nome della lega
          <br />
          <input type="text" name="nome" required placeholder="Lega degli amici" style={{ width: '100%' }} />
        </label>
      </p>
      <p>
        <label>
          Modalità{' '}
          <select name="modalita" defaultValue="classic">
            <option value="classic">classic</option>
            <option value="mantra">mantra</option>
          </select>
        </label>{' '}
        <label>
          Budget{' '}
          <input type="number" name="budget" defaultValue={500} min={1} required style={{ width: '6rem' }} />
        </label>
      </p>
      <p>
        <label>
          Export delle rose (Fantalab, CSV)
          <br />
          <input type="file" name="file" accept=".csv,text/csv" required />
        </label>
      </p>

      {esito && (
        <div className={`avviso ${esito.riuscito ? 'ok' : 'errore'}`}>
          {esito.messaggio}
          {esito.avvisi.length > 0 && (
            <ul>
              {esito.avvisi.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="azioni">
        <button className="principale" type="submit" disabled={inCorso}>
          {inCorso ? 'Creo…' : 'Crea la lega'}
        </button>
      </div>
    </form>
  );
}

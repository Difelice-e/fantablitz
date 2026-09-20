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
          Numero di partecipanti{' '}
          <input
            type="number"
            name="squadreAttese"
            min={2}
            step={2}
            placeholder="facoltativo"
            style={{ width: '6rem' }}
          />
        </label>
        <br />
        <small className="spiega">
          Se lo indichi, la creazione si rifiuta se il CSV contiene un numero diverso di squadre —
          utile per accorgersi subito di un file sbagliato o incompleto.
        </small>
      </p>
      <p>
        <label>
          Giornate al giorno{' '}
          <input
            type="number"
            name="giornateAlGiorno"
            defaultValue={1}
            min={1}
            required
            style={{ width: '6rem' }}
          />
        </label>
        <br />
        <small className="spiega">
          Quante giornate gioca il ciclo automatico di ogni sera (una stagione dura 38 diviso questo
          numero di giorni).
        </small>
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

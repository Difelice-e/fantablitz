'use client';

import { useState, useTransition } from 'react';
import { assegnaSquadra } from '../../../admin/azioni.ts';

export default function RigaSquadra({
  legaId,
  squadraId,
  nome,
  proprietario,
}: {
  legaId: string;
  squadraId: string;
  nome: string;
  proprietario: string | null;
}) {
  const [mail, setMail] = useState(proprietario ?? '');
  const [messaggio, setMessaggio] = useState<{ testo: string; ok: boolean } | null>(null);
  const [inCorso, avvia] = useTransition();

  function salva(): void {
    avvia(async () => {
      const esito = await assegnaSquadra(legaId, squadraId, mail);
      setMessaggio({ testo: esito.messaggio, ok: esito.riuscito });
    });
  }

  return (
    <tr>
      <td>
        {nome}
        {proprietario === null && <span className="etichetta-bot">BOT</span>}
      </td>
      <td>
        <input
          type="email"
          value={mail}
          onChange={(e) => setMail(e.target.value)}
          placeholder="vuoto = bot"
          style={{ width: '100%' }}
        />
      </td>
      <td style={{ whiteSpace: 'nowrap' }}>
        <button className="secondario" onClick={salva} disabled={inCorso}>
          {inCorso ? 'Salvo…' : 'Salva'}
        </button>
        {messaggio && (
          <span
            style={{
              marginLeft: '0.5rem',
              fontSize: '0.8rem',
              color: messaggio.ok ? 'var(--positivo)' : 'var(--negativo)',
            }}
          >
            {messaggio.testo}
          </span>
        )}
      </td>
    </tr>
  );
}

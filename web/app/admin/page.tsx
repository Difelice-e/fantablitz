import Link from 'next/link';
import { archivioServizio } from '../../src/dati.ts';
import { sonoAmministratore } from '../../src/admin.ts';
import CreaLegaForm from './CreaLegaForm.tsx';

export const dynamic = 'force-dynamic';

export default async function Admin() {
  if (!(await sonoAmministratore())) {
    return (
      <section className="riquadro">
        <h1>Amministrazione</h1>
        <p className="avviso errore">Questa pagina è riservata all’amministratore.</p>
      </section>
    );
  }

  const leghe = await archivioServizio.elenca();

  return (
    <>
      <section className="riquadro">
        <h1>Amministrazione</h1>
        <p className="spiega">
          Crea una lega da un export di Fantalab: le squadre nascono senza proprietario (bot), poi
          si assegnano alle mail nella pagina della lega qui sotto.
        </p>
        <CreaLegaForm />
      </section>

      <section className="riquadro">
        <h2>Leghe</h2>
        {leghe.length === 0 ? (
          <p className="vuoto">Nessuna lega ancora.</p>
        ) : (
          <table>
            <tbody>
              {leghe.map((l) => (
                <tr key={l.id}>
                  <td>{l.nome}</td>
                  <td>
                    <Link href={`/leghe/${encodeURIComponent(l.id)}/admin`}>Assegna squadre</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

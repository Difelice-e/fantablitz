import { redirect } from 'next/navigation';
import { legaAutorizzata, stagioneDi } from '../../../../../src/dati.ts';
import { configurato, emailUtente } from '../../../../../src/supabase/server.ts';

export const dynamic = 'force-dynamic';

/** "Giornata N" apre sempre il dettaglio di una partita (vedi [squadraId]): la propria, se ne hai una. */
export default async function Giornata({
  params,
}: {
  params: Promise<{ legaId: string; n: string }>;
}) {
  const { legaId, n } = await params;
  const numero = Number(n);
  const lega = await legaAutorizzata(decodeURIComponent(legaId));
  if (!lega) return <p className="vuoto">Lega non disponibile.</p>;

  if (!Number.isInteger(numero) || numero < 1 || numero > lega.giornateGiocate) {
    return (
      <section className="riquadro">
        <h1>Giornata {n}</h1>
        <p className="avviso">Questa giornata non è ancora stata giocata.</p>
      </section>
    );
  }

  const stagione = await stagioneDi(lega);
  const giornata = stagione.giornate.find((g) => g.numero === numero);
  if (!giornata || giornata.scontri.length === 0) {
    return <p className="vuoto">Giornata non trovata.</p>;
  }

  const email = configurato() ? await emailUtente() : null;
  const propria = email ? lega.squadre.find((s) => s.proprietario === email) : undefined;
  const scontroProprio = propria
    ? giornata.scontri.find((s) => s.casaId === propria.id || s.ospiteId === propria.id)
    : undefined;
  const destinazione = scontroProprio?.casaId ?? giornata.scontri[0]!.casaId;

  redirect(`/leghe/${encodeURIComponent(lega.id)}/calendario/${numero}/${encodeURIComponent(destinazione)}`);
}

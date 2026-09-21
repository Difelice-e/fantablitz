import { redirect } from 'next/navigation';
import { legaAutorizzata } from '../../../../src/dati.ts';
import { configurato, emailUtente } from '../../../../src/supabase/server.ts';

export const dynamic = 'force-dynamic';

/** "Rose" apre sempre il dettaglio di una squadra (vedi rose/[id]): la propria, se ne hai una. */
export default async function Squadre({ params }: { params: Promise<{ legaId: string }> }) {
  const { legaId } = await params;
  const id = decodeURIComponent(legaId);
  const lega = await legaAutorizzata(id);
  if (!lega) return <p className="vuoto">Lega non disponibile.</p>;

  const email = configurato() ? await emailUtente() : null;
  const propria = email ? lega.squadre.find((s) => s.proprietario === email) : undefined;
  const destinazione = propria ?? lega.squadre[0];
  if (!destinazione) return <p className="vuoto">Nessuna squadra in questa lega.</p>;

  redirect(`/leghe/${encodeURIComponent(lega.id)}/rose/${encodeURIComponent(destinazione.id)}`);
}

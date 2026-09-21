import { legaAutorizzata, posizioneAttuale } from '../../../src/dati.ts';
import { amministraLega } from '../../../src/admin.ts';
import NavLega, { type VoceNav } from './NavLega.tsx';

export const dynamic = 'force-dynamic';

export default async function LayoutLega({
  params,
  children,
}: {
  params: Promise<{ legaId: string }>;
  children: React.ReactNode;
}) {
  const { legaId } = await params;
  const id = decodeURIComponent(legaId);
  const stato = await legaAutorizzata(id);

  if (!stato) {
    return (
      <section className="riquadro">
        <h1>Lega non disponibile</h1>
        <p className="avviso errore">
          Nessuna lega con questo indirizzo, oppure non fai parte di questa lega.
        </p>
        <p className="azioni">
          <a href="/leghe">Le mie leghe</a>
        </p>
      </section>
    );
  }

  const posizione = await posizioneAttuale(stato);
  const admin = await amministraLega(stato);
  const radice = `/leghe/${encodeURIComponent(stato.id)}`;

  const voci: VoceNav[] = [
    { href: `${radice}/dashboard`, etichetta: 'Dashboard' },
    { href: `${radice}/rose`, etichetta: 'Rose' },
    { href: `${radice}/calendario`, etichetta: 'Calendario' },
    { href: `${radice}/classifica`, etichetta: 'Classifica' },
    { href: `${radice}/sala-stampa`, etichetta: 'Sala stampa' },
    ...(admin
      ? [{ href: `/admin/squadre/${encodeURIComponent(stato.id)}`, etichetta: 'Amministrazione' }]
      : []),
  ];

  return (
    <>
      <div style={{ marginBottom: '1.25rem' }}>
        <p className="sottotitolo" style={{ margin: '0 0 0.4rem' }}>
          {stato.nome} —{' '}
          {stato.giornateGiocate === 0
            ? 'stagione non ancora iniziata'
            : `stagione ${posizione.stagione}, giornata ${posizione.giornataStagionale} di ${posizione.giornatePerStagione}`}
        </p>
        <NavLega voci={voci} />
      </div>
      {children}
    </>
  );
}

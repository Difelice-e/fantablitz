import Link from 'next/link';
import { legaAutorizzata, posizioneAttuale } from '../../../src/dati.ts';
import { amministraLega } from '../../../src/admin.ts';
import { configurato, emailUtente } from '../../../src/supabase/server.ts';
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
          <Link href="/leghe">Le mie leghe</Link>
        </p>
      </section>
    );
  }

  const posizione = await posizioneAttuale(stato);
  const admin = await amministraLega(stato);
  const radice = `/leghe/${encodeURIComponent(stato.id)}`;

  // Il link punta gia' alla propria rosa quando se ne conosce una: risparmia
  // il giro a vuoto su `rose/page.tsx` (legge di nuovo tutto solo per
  // decidere dove reindirizzare) per il caso comune del click sul menu. La
  // pagina indice resta comunque raggiungibile ed e' lei a scegliere per chi
  // non ha una squadra propria (admin, o sviluppo locale senza login).
  const email = configurato() ? await emailUtente() : null;
  const propria = email ? stato.squadre.find((s) => s.proprietario === email) : undefined;
  const hrefRose = propria ? `${radice}/rose/${encodeURIComponent(propria.id)}` : `${radice}/rose`;

  const voci: VoceNav[] = [
    { href: `${radice}/dashboard`, etichetta: 'Dashboard' },
    { href: hrefRose, etichetta: 'Rose', attivoSu: `${radice}/rose` },
    { href: `${radice}/calendario`, etichetta: 'Calendario' },
    { href: `${radice}/classifica`, etichetta: 'Classifica' },
    { href: `${radice}/sala-stampa`, etichetta: 'Sala stampa' },
    ...(admin ? [{ href: `${radice}/admin`, etichetta: 'Amministrazione' }] : []),
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

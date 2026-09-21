import { legaAutorizzata, mvFmDiRosa, rosaInVista } from '../../../../../../src/dati.ts';

export const dynamic = 'force-dynamic';

function campoCsv(valore: string | number): string {
  const testo = String(valore);
  return /[",\n]/.test(testo) ? `"${testo.replace(/"/g, '""')}"` : testo;
}

export async function GET(
  _richiesta: Request,
  { params }: { params: Promise<{ legaId: string; id: string }> },
): Promise<Response> {
  const { legaId, id } = await params;
  const lega = await legaAutorizzata(decodeURIComponent(legaId));
  const squadraId = decodeURIComponent(id);
  const squadra = lega?.squadre.find((s) => s.id === squadraId);
  if (!lega || !squadra) {
    return new Response('Squadra non trovata.', { status: 404 });
  }

  const rosa = await rosaInVista(lega, squadraId);
  const mvFm = await mvFmDiRosa(lega, squadraId);

  const righe = [
    ['Ruolo', 'Nome', 'Club', 'Prezzo', 'MV', 'FM'],
    ...rosa.map((g) => {
      const voti = mvFm.get(g.id);
      return [
        lega.modalita === 'mantra' ? g.ruoliMantra.join('/') : g.ruoloClassico,
        g.nome,
        g.club,
        String(g.prezzo),
        voti?.mv !== null && voti?.mv !== undefined ? voti.mv.toFixed(2) : '',
        voti?.fm !== null && voti?.fm !== undefined ? voti.fm.toFixed(2) : '',
      ];
    }),
  ];

  const csv = righe.map((riga) => riga.map(campoCsv).join(',')).join('\r\n');

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${squadra.nome.replace(/[^a-z0-9]+/gi, '-')}.csv"`,
    },
  });
}

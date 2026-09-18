import { contesto, formazioneDaSchierare, legaPredefinita, rosaInVista } from '../../../../src/dati.ts';
import Schieramento, { type DatiSchieramento } from './schieramento.tsx';

export const dynamic = 'force-dynamic';

export default async function PaginaFormazione({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const squadraId = decodeURIComponent(id);
  const lega = await legaPredefinita();
  if (!lega) return <p className="vuoto">Nessuna lega in archivio.</p>;

  const squadra = lega.squadre.find((s) => s.id === squadraId);
  if (!squadra) {
    return (
      <section className="riquadro">
        <h1>Squadra sconosciuta</h1>
        <p className="avviso errore">Nessuna squadra si chiama «{squadraId}».</p>
      </section>
    );
  }

  const c = await contesto();
  const regole = c.regole[lega.modalita];
  const { formazione, rosa, giornata } = await formazioneDaSchierare(lega, squadraId);
  const inVista = await rosaInVista(lega, squadraId);

  // Per ogni modulo, per ogni casella, chi la puo' occupare e a che costo.
  // Si calcola qui, una volta, perche' la regola di ammissibilita' e' quella di
  // `/fanta` e non deve essere riscritta nel browser: la matrice Mantra ha
  // eccezioni che dipendono dal modulo, e una seconda copia divergerebbe.
  const moduli: DatiSchieramento['moduli'] = regole.moduli.map((m) => ({
    nome: m.nome,
    slot: m.slot.map((s) => ({
      id: s.id,
      reparto: s.reparto,
      ammessi: rosa
        .map((g) => ({ id: g.id, ...regole.valuta(g, s, m) }))
        .filter((e) => e.ammesso)
        .map((e) => ({ id: e.id, costo: e.costo })),
    })),
  }));

  const dati: DatiSchieramento = {
    legaId: lega.id,
    squadraId,
    squadraNome: squadra.nome,
    giornata,
    modalita: lega.modalita,
    malusAdattamento: c.punteggio.malus.adattamento,
    moduli,
    rosa: inVista.map((g) => ({
      id: g.id,
      nome: g.nome,
      clubBreve: g.clubBreve,
      colore: g.colore,
      ruolo: lega.modalita === 'mantra' ? g.ruoliMantra.join('/') : g.ruoloClassico,
    })),
    iniziale: {
      modulo: formazione.modulo,
      titolari: [...formazione.titolari.entries()],
      panchina: [...formazione.panchina],
    },
  };

  return <Schieramento dati={dati} />;
}

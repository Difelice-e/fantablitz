import { contesto, formazioneDaSchierare, legaAutorizzata, rosaInVista } from '../../../../../../src/dati.ts';
import { configurato, emailUtente } from '../../../../../../src/supabase/server.ts';
import Schieramento, { type DatiSchieramento } from './schieramento.tsx';

export const dynamic = 'force-dynamic';

export default async function PaginaFormazione({
  params,
}: {
  params: Promise<{ legaId: string; id: string }>;
}) {
  const { legaId, id } = await params;
  const squadraId = decodeURIComponent(id);
  const lega = await legaAutorizzata(decodeURIComponent(legaId));
  if (!lega) return <p className="vuoto">Lega non disponibile.</p>;

  const radice = `/leghe/${encodeURIComponent(lega.id)}`;
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

  // Non e' la propria squadra: si vede la formazione (fa parte del gioco,
  // come vedere la rosa degli avversari), ma l'interfaccia non deve nemmeno
  // proporre di modificarla. La RLS lo impedirebbe comunque lato database.
  const email = configurato() ? await emailUtente() : null;
  const miaSquadra = !configurato() || email === squadra.proprietario;
  if (!miaSquadra) {
    const perId = new Map(inVista.map((g) => [g.id, g]));
    const eBot = squadra.proprietario === null;
    return (
      <section className="riquadro">
        <h1>
          {squadra.nome}
          {eBot && <span className="etichetta-bot">BOT</span>}
        </h1>
        <p className="spiega">
          {eBot
            ? `Nessuno la gestisce: viene schierata in automatico, con la formazione migliore che la rosa esprime per la giornata ${giornata}.`
            : `Non è la tua squadra: puoi vedere la formazione per la giornata ${giornata}, non modificarla.`}
        </p>
        <p>
          <strong>Modulo:</strong> {formazione.modulo}
        </p>
        <table>
          <tbody>
            {[...formazione.titolari.entries()].map(([slot, giocatoreId]) => {
              const g = perId.get(giocatoreId);
              return (
                <tr key={slot}>
                  <td className="numero" style={{ width: '2.5rem' }}>
                    {slot}
                  </td>
                  <td>{g?.nome ?? giocatoreId}</td>
                  <td style={{ color: 'var(--tenue)' }}>{g?.clubBreve}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="azioni">
          <a href={`${radice}/rose/${encodeURIComponent(squadraId)}`}>Torna alla rosa</a>
        </p>
      </section>
    );
  }

  return <Schieramento dati={dati} />;
}

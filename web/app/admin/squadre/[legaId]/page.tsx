import { archivioServizio } from '../../../../src/dati.ts';
import { sonoAmministratore } from '../../../../src/admin.ts';
import RigaSquadra from './RigaSquadra.tsx';

export const dynamic = 'force-dynamic';

export default async function AssegnaSquadre({
  params,
}: {
  params: Promise<{ legaId: string }>;
}) {
  const { legaId } = await params;

  if (!(await sonoAmministratore())) {
    return (
      <section className="riquadro">
        <h1>Assegna squadre</h1>
        <p className="avviso errore">Questa pagina è riservata all’amministratore.</p>
      </section>
    );
  }

  const stato = await archivioServizio.leggi(decodeURIComponent(legaId));
  if (!stato) {
    return (
      <section className="riquadro">
        <h1>Lega sconosciuta</h1>
        <p className="avviso errore">Nessuna lega con id «{legaId}».</p>
      </section>
    );
  }

  return (
    <section className="riquadro">
      <h1>{stato.nome}</h1>
      <p className="spiega">
        La mail associata a una squadra è insieme identità e invito: chi si autentica con quella
        mail vede questa lega e può schierare solo questa squadra. Lascia vuoto per lasciarla
        pilotata dal bot.
      </p>
      <table>
        <thead>
          <tr>
            <th>Squadra</th>
            <th>Mail del proprietario</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {stato.squadre.map((s) => (
            <RigaSquadra
              key={s.id}
              legaId={stato.id}
              squadraId={s.id}
              nome={s.nome}
              proprietario={s.proprietario}
            />
          ))}
        </tbody>
      </table>
      <p className="azioni">
        <a href="/admin">Torna all’amministrazione</a>
      </p>
    </section>
  );
}

import { archivioServizio, clientServizio } from '../../../../src/dati.ts';
import { amministraLega } from '../../../../src/admin.ts';
import RigaSquadra from './RigaSquadra.tsx';
import ParolaLega from './ParolaLega.tsx';

export const dynamic = 'force-dynamic';

export default async function AssegnaSquadre({
  params,
}: {
  params: Promise<{ legaId: string }>;
}) {
  const { legaId } = await params;

  const stato = await archivioServizio.leggi(decodeURIComponent(legaId));
  if (!stato) {
    return (
      <section className="riquadro">
        <h1>Lega sconosciuta</h1>
        <p className="avviso errore">Nessuna lega con id «{legaId}».</p>
      </section>
    );
  }

  if (!(await amministraLega(stato))) {
    return (
      <section className="riquadro">
        <h1>{stato.nome}</h1>
        <p className="avviso errore">Questa pagina è riservata all’amministratore della lega.</p>
      </section>
    );
  }

  const client = clientServizio();
  const riga = client
    ? (await client.from('leghe').select('parola_ordine_hash').eq('id', stato.id).maybeSingle()).data
    : null;
  const parolaImpostata = Boolean(riga?.['parola_ordine_hash']);

  return (
    <>
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
      </section>

      <section className="riquadro">
        <h2>Parola d’ordine {parolaImpostata && <span className="etichetta ok">IMPOSTATA</span>}</h2>
        <ParolaLega legaId={stato.id} />
      </section>

      <p className="azioni">
        <a href="/admin">Torna all’amministrazione</a>
      </p>
    </>
  );
}

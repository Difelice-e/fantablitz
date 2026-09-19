import { legaPredefinita, stagioneDi } from '../../src/dati.ts';

export const dynamic = 'force-dynamic';

export default async function Giornate() {
  const lega = await legaPredefinita();
  if (!lega) return <p className="vuoto">Nessuna lega in archivio.</p>;

  const stagione = await stagioneDi(lega);
  const totale = stagione.calendario.giornate.length;

  return (
    <section className="riquadro">
      <h1>Giornate</h1>
      <p className="spiega">
        {lega.giornateGiocate} giocate su {totale}. Le giornate non ancora giocate non si possono
        aprire: i voti si vedono dopo, non prima.
      </p>

      <div className="caselle">
        {Array.from({ length: totale }, (_, i) => i + 1).map((n) => {
          const giocata = n <= lega.giornateGiocate;
          return (
            <div key={n} className="scontro">
              <span className="casa">{giocata ? <a href={`/giornate/${n}`}>Giornata {n}</a> : `Giornata ${n}`}</span>
              <span className="punteggio" />
              <span style={{ color: 'var(--tenue)', fontSize: '0.8rem' }}>
                {giocata ? 'giocata' : 'da giocare'}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

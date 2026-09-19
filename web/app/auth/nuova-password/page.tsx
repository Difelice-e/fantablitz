import { impostaNuovaPassword } from './azioni.ts';

export const dynamic = 'force-dynamic';

export default async function NuovaPassword({
  searchParams,
}: {
  searchParams: Promise<{ errore?: string }>;
}) {
  const { errore } = await searchParams;

  return (
    <section className="riquadro" style={{ maxWidth: '24rem', margin: '3rem auto' }}>
      <h1>Nuova password</h1>
      {errore && <p className="avviso errore">{decodeURIComponent(errore)}</p>}
      <form action={impostaNuovaPassword}>
        <p>
          <input
            type="password"
            name="password"
            placeholder="almeno 6 caratteri"
            required
            minLength={6}
            autoFocus
            style={{ width: '100%' }}
          />
        </p>
        <div className="azioni">
          <button className="principale" type="submit">
            Salva
          </button>
        </div>
      </form>
    </section>
  );
}

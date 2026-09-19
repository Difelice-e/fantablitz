import { inviaLinkMagico } from './azioni.ts';

export const dynamic = 'force-dynamic';

export default async function PaginaLogin({
  searchParams,
}: {
  searchParams: Promise<{ inviato?: string; errore?: string }>;
}) {
  const { inviato, errore } = await searchParams;

  return (
    <section className="riquadro" style={{ maxWidth: '24rem', margin: '3rem auto' }}>
      <h1>
        Fanta<span style={{ color: 'var(--accento)' }}>Blitz</span>
      </h1>
      <p className="spiega">
        Accesso su invito. Scrivi la mail con cui ti hanno assegnato una squadra: ti mandiamo un
        link per entrare, nessuna password.
      </p>

      {errore && <p className="avviso errore">{decodeURIComponent(errore)}</p>}
      {inviato && !errore && (
        <p className="avviso ok">
          Controlla la posta: ti abbiamo mandato un link per entrare. Puoi chiudere questa pagina.
        </p>
      )}

      {!inviato && (
        <form action={inviaLinkMagico}>
          <p>
            <input
              type="email"
              name="email"
              placeholder="tu@esempio.it"
              required
              autoFocus
              style={{ width: '100%' }}
            />
          </p>
          <div className="azioni">
            <button className="principale" type="submit">
              Mandami il link
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

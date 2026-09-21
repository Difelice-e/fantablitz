import Link from 'next/link';
import { accedi, registrati, richiediReset } from './azioni.ts';

export const dynamic = 'force-dynamic';

type Modo = 'accedi' | 'registrati' | 'reset';

export default async function PaginaLogin({
  searchParams,
}: {
  searchParams: Promise<{ modo?: string; errore?: string; registrato?: string; inviato?: string }>;
}) {
  const sp = await searchParams;
  const modo: Modo = sp.modo === 'registrati' ? 'registrati' : sp.modo === 'reset' ? 'reset' : 'accedi';

  return (
    <section className="riquadro" style={{ maxWidth: '24rem', margin: '3rem auto' }}>
      <h1>
        Fanta<span style={{ color: 'var(--accento)' }}>Blitz</span>
      </h1>
      <p className="spiega">
        {modo === 'accedi' && 'Entra con la mail e la password del tuo account.'}
        {modo === 'registrati' &&
          'Crea un account. Da solo non basta: serve un invito per entrare in una lega.'}
        {modo === 'reset' && 'Ti mandiamo un link per scegliere una nuova password.'}
      </p>

      {sp.errore && <p className="avviso errore">{decodeURIComponent(sp.errore)}</p>}
      {sp.registrato && (
        <p className="avviso ok">Controlla la posta per confermare l’account, poi accedi.</p>
      )}
      {sp.inviato && (
        <p className="avviso ok">
          Controlla la posta: ti abbiamo mandato un link per scegliere una nuova password.
        </p>
      )}

      {modo === 'accedi' && (
        <form action={accedi}>
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
          <p>
            <input
              type="password"
              name="password"
              placeholder="password"
              required
              style={{ width: '100%' }}
            />
          </p>
          <div className="azioni">
            <button className="principale" type="submit">
              Accedi
            </button>
          </div>
        </form>
      )}

      {modo === 'registrati' && !sp.registrato && (
        <form action={registrati}>
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
          <p>
            <input
              type="password"
              name="password"
              placeholder="almeno 6 caratteri"
              required
              minLength={6}
              style={{ width: '100%' }}
            />
          </p>
          <div className="azioni">
            <button className="principale" type="submit">
              Registrati
            </button>
          </div>
        </form>
      )}

      {modo === 'reset' && !sp.inviato && (
        <form action={richiediReset}>
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

      <p className="spiega" style={{ marginTop: '1rem' }}>
        {[
          modo !== 'accedi' && (
            <Link key="accedi" href="/login">
              Accedi
            </Link>
          ),
          modo !== 'registrati' && (
            <Link key="registrati" href="/login?modo=registrati">
              Registrati
            </Link>
          ),
          modo !== 'reset' && (
            <Link key="reset" href="/login?modo=reset">
              Password dimenticata?
            </Link>
          ),
        ]
          .filter(Boolean)
          .map((link, i) => (
            <span key={i}>
              {i > 0 && ' · '}
              {link}
            </span>
          ))}
      </p>
    </section>
  );
}

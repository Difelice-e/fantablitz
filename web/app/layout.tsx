import './globals.css';
import Link from 'next/link';
import { configurato, emailUtente } from '../src/supabase/server.ts';
import { sonoAmministratore } from '../src/admin.ts';

export const metadata = {
  title: 'FantaBlitz',
  description: 'Fantacalcio su un campionato simulato',
};

export default async function Layout({ children }: { children: React.ReactNode }) {
  const email = configurato() ? await emailUtente() : null;
  const admin = await sonoAmministratore();
  // Loggato in locale (senza Supabase, `email` e' sempre null) o su Supabase
  // con una sessione vera: in entrambi i casi si vede "Le mie leghe".
  const loggato = !configurato() || email !== null;

  return (
    <html lang="it">
      <body>
        <header className="principale">
          <div className="guscio">
            <div className="marchio">
              Fanta<span>Blitz</span>
            </div>
            <p className="sottotitolo">
              {email && (
                <>
                  {email}{' '}
                  <form action="/auth/signout" method="post" style={{ display: 'inline' }}>
                    <button
                      className="secondario"
                      type="submit"
                      style={{ padding: '0.1rem 0.4rem', fontSize: '0.75rem' }}
                    >
                      Esci
                    </button>
                  </form>
                </>
              )}
            </p>
            <nav className="principale">
              {loggato && <Link href="/leghe">Le mie leghe</Link>}
              {admin && <Link href="/admin">Amministrazione</Link>}
            </nav>
          </div>
        </header>
        <main className="guscio">{children}</main>
      </body>
    </html>
  );
}

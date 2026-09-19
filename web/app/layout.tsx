import './globals.css';
import { legaPredefinita } from '../src/dati.ts';
import { configurato, emailUtente } from '../src/supabase/server.ts';
import { sonoAmministratore } from '../src/admin.ts';

export const metadata = {
  title: 'FantaBlitz',
  description: 'Fantacalcio su un campionato simulato',
};

export default async function Layout({ children }: { children: React.ReactNode }) {
  const lega = await legaPredefinita();
  const email = configurato() ? await emailUtente() : null;
  const admin = await sonoAmministratore();

  return (
    <html lang="it">
      <body>
        <header className="principale">
          <div className="guscio">
            <div className="marchio">
              Fanta<span>Blitz</span>
            </div>
            <p className="sottotitolo">
              {lega ? `${lega.nome} — ${lega.giornateGiocate} giornate giocate` : 'nessuna lega'}
              {email && (
                <>
                  {' · '}
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
              <a href="/">Classifica</a>
              <a href="/giornate">Giornate</a>
              <a href="/squadre">Squadre</a>
              {admin && <a href="/admin">Amministrazione</a>}
            </nav>
          </div>
        </header>
        <main className="guscio">{children}</main>
      </body>
    </html>
  );
}

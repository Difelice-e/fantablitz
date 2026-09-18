import './globals.css';
import { legaPredefinita } from '../src/dati.ts';

export const metadata = {
  title: 'FantaBlitz',
  description: 'Fantacalcio su un campionato simulato',
};

export default async function Layout({ children }: { children: React.ReactNode }) {
  const lega = await legaPredefinita();

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
            </p>
            <nav className="principale">
              <a href="/">Classifica</a>
              <a href="/giornate">Giornate</a>
              <a href="/squadre">Squadre</a>
            </nav>
          </div>
        </header>
        <main className="guscio">{children}</main>
      </body>
    </html>
  );
}

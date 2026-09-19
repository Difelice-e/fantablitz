import { configurato } from '../../src/supabase/server.ts';
import EntraForm from './EntraForm.tsx';

export const dynamic = 'force-dynamic';

export default async function Entra() {
  if (!configurato()) {
    return (
      <section className="riquadro">
        <h1>Entra in una lega</h1>
        <p className="avviso">Questa funzione richiede Supabase configurato.</p>
      </section>
    );
  }

  return (
    <section className="riquadro" style={{ maxWidth: '28rem', margin: '3rem auto' }}>
      <h1>Entra in una lega</h1>
      <p className="spiega">
        Conosci il nome della lega e la sua parola d’ordine? Scegli una squadra fra quelle
        libere.
      </p>
      <EntraForm />
    </section>
  );
}

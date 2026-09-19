'use client';

/**
 * La schermata di schieramento.
 *
 * L'unica pagina interattiva del sito, e l'unica con uno stato nel browser.
 * Tutto il resto e' HTML calcolato sul server.
 *
 * La regola che decide chi puo' occupare quale casella **non e' qui**: arriva
 * gia' calcolata dal server, casella per casella, perche' la matrice Mantra ha
 * eccezioni che dipendono dal modulo e una seconda copia in JavaScript
 * divergerebbe dalla prima. Qui si disegna e si sposta, non si decide.
 */

import { useState, useTransition } from 'react';
import { riempiAutomaticamente, salvaFormazione, type FormazioneGrezza } from './azioni.ts';

export type DatiSchieramento = {
  legaId: string;
  squadraId: string;
  squadraNome: string;
  giornata: number;
  modalita: 'classic' | 'mantra';
  malusAdattamento: number;
  moduli: {
    nome: string;
    slot: { id: string; reparto: string; ammessi: { id: string; costo: number }[] }[];
  }[];
  rosa: { id: string; nome: string; clubBreve: string; colore: string; ruolo: string }[];
  iniziale: FormazioneGrezza;
};

const ETICHETTE: Record<string, string> = {
  P: 'Portiere',
  D: 'Difesa',
  C: 'Centrocampo',
  A: 'Attacco',
};

export default function Schieramento({ dati }: { dati: DatiSchieramento }) {
  const [modulo, setModulo] = useState(dati.iniziale.modulo);
  const [titolari, setTitolari] = useState<Map<string, string>>(
    () => new Map(dati.iniziale.titolari),
  );
  const [panchina, setPanchina] = useState<string[]>(() => [...dati.iniziale.panchina]);
  const [messaggio, setMessaggio] = useState<{ testo: string; ok: boolean; problemi: string[] } | null>(
    null,
  );
  const [inCorso, avvia] = useTransition();

  const perId = new Map(dati.rosa.map((g) => [g.id, g]));
  const schema = dati.moduli.find((m) => m.nome === modulo) ?? dati.moduli[0]!;

  const nome = (id: string): string => perId.get(id)?.nome ?? id;

  /** Il costo di adattamento del giocatore nella casella in cui sta ora. */
  const costoIn = (slotId: string, giocatoreId: string | undefined): number => {
    if (giocatoreId === undefined) return 0;
    const slot = schema.slot.find((s) => s.id === slotId);
    return slot?.ammessi.find((a) => a.id === giocatoreId)?.costo ?? 0;
  };

  const adattati = schema.slot.filter((s) => costoIn(s.id, titolari.get(s.id)) > 0).length;
  const scoperte = schema.slot.filter((s) => !titolari.get(s.id)).length;

  /* --- modifiche ---------------------------------------------------- */

  function cambiaModulo(nuovo: string): void {
    const nuovoSchema = dati.moduli.find((m) => m.nome === nuovo);
    if (!nuovoSchema) return;
    // Si tiene chi puo' restare dov'e'; gli altri tornano in panchina. Svuotare
    // tutto a ogni cambio di modulo sarebbe la cosa piu' fastidiosa possibile.
    const tenuti = new Map<string, string>();
    const presi = new Set<string>();
    for (const slot of nuovoSchema.slot) {
      const attuale = titolari.get(slot.id);
      if (attuale && !presi.has(attuale) && slot.ammessi.some((a) => a.id === attuale)) {
        tenuti.set(slot.id, attuale);
        presi.add(attuale);
      }
    }
    setModulo(nuovo);
    setTitolari(tenuti);
    setPanchina(dati.rosa.filter((g) => !presi.has(g.id)).map((g) => g.id));
    setMessaggio(null);
  }

  function metti(slotId: string, giocatoreId: string): void {
    const prossimi = new Map(titolari);
    const uscente = prossimi.get(slotId);

    if (giocatoreId === '') {
      prossimi.delete(slotId);
    } else {
      // Se il giocatore era in un'altra casella, i due si scambiano: e' quello
      // che uno si aspetta trascinandoli, e non lascia mai un doppione.
      for (const [altro, id] of prossimi) {
        if (id === giocatoreId && altro !== slotId) {
          if (uscente === undefined) prossimi.delete(altro);
          else prossimi.set(altro, uscente);
        }
      }
      prossimi.set(slotId, giocatoreId);
    }

    const inCampo = new Set(prossimi.values());
    setTitolari(prossimi);
    setPanchina(dati.rosa.filter((g) => !inCampo.has(g.id)).map((g) => g.id));
    setMessaggio(null);
  }

  function spostaInPanchina(indice: number, verso: -1 | 1): void {
    const prossima = [...panchina];
    const destinazione = indice + verso;
    if (destinazione < 0 || destinazione >= prossima.length) return;
    [prossima[indice], prossima[destinazione]] = [prossima[destinazione]!, prossima[indice]!];
    setPanchina(prossima);
  }

  /* --- azioni sul server -------------------------------------------- */

  function riempi(): void {
    avvia(async () => {
      const esito = await riempiAutomaticamente(dati.legaId, dati.squadraId, modulo);
      if (!esito) return;
      setModulo(esito.modulo);
      setTitolari(new Map(esito.titolari));
      setPanchina(esito.panchina);
      setMessaggio(null);
    });
  }

  function salva(): void {
    avvia(async () => {
      const esito = await salvaFormazione(dati.legaId, dati.squadraId, {
        modulo,
        titolari: [...titolari.entries()],
        panchina,
      });
      setMessaggio({ testo: esito.messaggio, ok: esito.riuscito, problemi: esito.problemi });
    });
  }

  /* --- disegno ------------------------------------------------------ */

  const perReparto = new Map<string, typeof schema.slot>();
  for (const slot of schema.slot) {
    const gruppo = perReparto.get(slot.reparto) ?? [];
    gruppo.push(slot);
    perReparto.set(slot.reparto, gruppo);
  }

  return (
    <>
      <section className="riquadro">
        <h1>{dati.squadraNome}</h1>
        <p className="spiega">
          Formazione per la <strong>giornata {dati.giornata}</strong>. Chi non prende voto verrà
          sostituito automaticamente seguendo l’ordine della panchina.
        </p>

        <div className="azioni">
          <label>
            Modulo{' '}
            <select value={modulo} onChange={(e) => cambiaModulo(e.target.value)}>
              {dati.moduli.map((m) => (
                <option key={m.nome} value={m.nome}>
                  {m.nome}
                </option>
              ))}
            </select>
          </label>
          <button className="secondario" onClick={riempi} disabled={inCorso}>
            Riempi da solo
          </button>
        </div>
      </section>

      <section className="riquadro">
        <h2>In campo</h2>

        {dati.modalita === 'mantra' && adattati > 0 && (
          <p className="avviso">
            {adattati} {adattati === 1 ? 'giocatore è' : 'giocatori sono'} fuori posizione:{' '}
            {adattati === 1 ? 'costa' : 'costano'} {(adattati * dati.malusAdattamento).toFixed(1)}{' '}
            punti di malus.
          </p>
        )}
        {scoperte > 0 && (
          <p className="avviso errore">
            {scoperte} {scoperte === 1 ? 'casella è vuota' : 'caselle sono vuote'}: una casella vuota
            vale zero.
          </p>
        )}

        {[...perReparto.entries()].map(([reparto, slot]) => (
          <div key={reparto}>
            <h3>{ETICHETTE[reparto] ?? reparto}</h3>
            <div className="caselle">
              {slot.map((s) => {
                const attuale = titolari.get(s.id) ?? '';
                const costo = costoIn(s.id, attuale || undefined);
                return (
                  <div className="casella" key={s.id}>
                    <span className="etichetta">{s.id}</span>
                    <select
                      value={attuale}
                      className={attuale === '' ? 'scoperto' : costo > 0 ? 'adattato' : ''}
                      onChange={(e) => metti(s.id, e.target.value)}
                    >
                      <option value="">— vuota —</option>
                      {s.ammessi.map((a) => {
                        const g = perId.get(a.id);
                        if (!g) return null;
                        return (
                          <option key={a.id} value={a.id}>
                            {g.nome} ({g.clubBreve}, {g.ruolo}){a.costo > 0 ? ' — adattato' : ''}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      <section className="riquadro">
        <h2>Panchina</h2>
        <p className="spiega">
          L’ordine conta: entra per primo chi sta più in alto. È quello che decide chi sostituisce
          un titolare rimasto senza voto.
        </p>
        <table>
          <tbody>
            {panchina.map((id, i) => {
              const g = perId.get(id);
              return (
                <tr key={id}>
                  <td className="numero" style={{ width: '2rem', color: 'var(--tenue)' }}>
                    {i + 1}
                  </td>
                  <td style={{ width: '3.5rem' }}>
                    <span className="club" style={{ background: g?.colore ?? '#888' }}>
                      {g?.clubBreve}
                    </span>
                  </td>
                  <td>{nome(id)}</td>
                  <td style={{ color: 'var(--tenue)', fontSize: '0.8rem' }}>{g?.ruolo}</td>
                  <td style={{ width: '5rem', textAlign: 'right' }}>
                    <button
                      className="secondario"
                      onClick={() => spostaInPanchina(i, -1)}
                      disabled={i === 0}
                      aria-label={`Sposta ${nome(id)} più in alto`}
                    >
                      ↑
                    </button>{' '}
                    <button
                      className="secondario"
                      onClick={() => spostaInPanchina(i, 1)}
                      disabled={i === panchina.length - 1}
                      aria-label={`Sposta ${nome(id)} più in basso`}
                    >
                      ↓
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="riquadro">
        {messaggio && (
          <div className={`avviso ${messaggio.ok ? 'ok' : 'errore'}`}>
            {messaggio.testo}
            {messaggio.problemi.length > 0 && (
              <ul>
                {messaggio.problemi.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="azioni">
          <button className="principale" onClick={salva} disabled={inCorso || scoperte > 0}>
            {inCorso ? 'Salvo…' : `Salva per la giornata ${dati.giornata}`}
          </button>
          <a href={`/squadre/${encodeURIComponent(dati.squadraId)}`}>Torna alla rosa</a>
        </div>
      </section>
    </>
  );
}

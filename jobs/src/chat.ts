/**
 * Fa reagire i bot in chat agli eventi scatenanti (SPEC 7.2, 8): una
 * sconfitta pesante, uno scambio proposto e rifiutato, uno scambio concluso.
 *
 * Non e' legata a una sola giornata quanto invece a "quello che non ha ancora
 * avuto una reazione, per quel bot": una sconfitta appartiene alla sua
 * giornata, ma uno scambio puo' risolversi molto dopo essere stato proposto
 * (una persona risponde quando vuole), quindi qui si guarda tutto lo storico
 * degli scambi e si salta solo cio' a cui quel bot si e' gia' reagito — la
 * chiave e' sempre (evento, squadra, riferimento): due bot diversi possono
 * reagire allo stesso scambio, uno per parte.
 */

import { randomUUID } from 'node:crypto';
import { generaMessaggioChat, type DatiMessaggioChat } from './ai/chat.ts';
import { attesa, PAUSA_FRA_CHIAMATE_MS, type ProviderAI } from './ai/provider.ts';
import type { Archivio, EventoChat, StatoLega } from './archivio.ts';
import type { EsitoCiclo } from './ciclo.ts';
import type { ContestoMondo } from './lega.ts';
import { schedaPersonaggio, type ConfigurazioneChat } from './personaggio.ts';

type EventoCandidato = { evento: EventoChat; dettaglio: string; riferimento: string | null };

/** Priorita' fra eventi dello stesso bot nella stessa giornata, quando il tetto ne lascia passare solo uno: le buone notizie prima. */
const PRIORITA: Record<EventoChat, number> = {
  colpoDiMercato: 0,
  sconfittaPesante: 1,
  scambioRifiutato: 2,
};

function nomeSquadra(stato: StatoLega, squadraId: string): string {
  return stato.squadre.find((s) => s.id === squadraId)?.nome ?? squadraId;
}

/**
 * La chiave che dice "questo bot ha gia' reagito a questo episodio".
 *
 * Include sempre lo squadraId: due bot diversi possono reagire allo stesso
 * scambio (chi lo propone e chi lo riceve), e senza lo squadraId nella
 * chiave la reazione del primo faceva sembrare "gia' fatto" anche il turno
 * del secondo — bug trovato scrivendo i test, non a occhio.
 */
function chiaveReazione(evento: EventoChat, squadraId: string, riferimento: string | number): string {
  return `${evento}:${squadraId}:${riferimento}`;
}

/** Gli scambi (accettati o rifiutati) del bot senza ancora una reazione, dal piu' vecchio al piu' nuovo. */
function eventiDaScambi(
  stato: StatoLega,
  bot: string,
  giaReagito: ReadonlySet<string>,
): EventoCandidato[] {
  const eventi: EventoCandidato[] = [];
  for (const s of stato.scambi) {
    if (s.stato === 'accettato' && (s.daSquadraId === bot || s.aSquadraId === bot)) {
      if (giaReagito.has(chiaveReazione('colpoDiMercato', bot, s.id))) continue;
      const altra = s.daSquadraId === bot ? s.aSquadraId : s.daSquadraId;
      eventi.push({
        evento: 'colpoDiMercato',
        dettaglio: `ha chiuso uno scambio con ${nomeSquadra(stato, altra)}`,
        riferimento: s.id,
      });
    }
    // Solo chi ha proposto si lamenta: chi rifiuta l'ha gia' deciso lui.
    if (s.stato === 'rifiutato' && s.daSquadraId === bot) {
      if (giaReagito.has(chiaveReazione('scambioRifiutato', bot, s.id))) continue;
      eventi.push({
        evento: 'scambioRifiutato',
        dettaglio: `si è visto rifiutare una proposta di scambio da ${nomeSquadra(stato, s.aSquadraId)}`,
        riferimento: s.id,
      });
    }
  }
  return eventi;
}

/** L'evento di sconfitta pesante di un bot in una giornata, se c'e'. */
function eventoSconfitta(
  stato: StatoLega,
  bot: string,
  giornataFanta: EsitoCiclo['giornate'][number] | undefined,
  n: number,
  soglia: number,
  giaReagito: ReadonlySet<string>,
): EventoCandidato | null {
  if (!giornataFanta) return null;
  if (giaReagito.has(chiaveReazione('sconfittaPesante', bot, n))) return null;

  const scontro = giornataFanta.scontri.find((s) => s.casaId === bot || s.ospiteId === bot);
  if (!scontro) return null;

  const mie = scontro.casaId === bot ? scontro.fantapuntiCasa : scontro.fantapuntiOspite;
  const avversario = scontro.casaId === bot ? scontro.fantapuntiOspite : scontro.fantapuntiCasa;
  const avversarioId = scontro.casaId === bot ? scontro.ospiteId : scontro.casaId;
  if (avversario - mie < soglia) return null;

  return {
    evento: 'sconfittaPesante',
    dettaglio: `ha perso ${mie.toFixed(1)} a ${avversario.toFixed(1)} contro ${nomeSquadra(stato, avversarioId)}`,
    riferimento: null,
  };
}

/**
 * Genera e salva i messaggi di chat per le giornate da `da` a `fino`.
 * `vista` serve solo per gli scontri (le sconfitte pesanti): gli scambi si
 * leggono da `stato`, che li ha tutti indipendentemente da quando sono stati
 * risolti.
 */
export async function generaChatGiornate(
  archivio: Archivio,
  stato: StatoLega,
  contesto: ContestoMondo,
  vista: EsitoCiclo,
  provider: ProviderAI | null,
  da: number,
  fino: number,
): Promise<void> {
  const giaReagito = new Set(
    stato.chat.map((m) => chiaveReazione(m.evento, m.squadraId, m.riferimento ?? m.giornata)),
  );
  let primaChiamata = true;

  for (let n = da; n <= fino; n++) {
    const giornataFanta = vista.giornate.find((g) => g.numero === n);

    for (const bot of stato.squadre.filter((s) => s.proprietario === null)) {
      const candidati = [
        ...eventiDaScambi(stato, bot.id, giaReagito),
        ...(() => {
          const e = eventoSconfitta(
            stato, bot.id, giornataFanta, n, contesto.chat.sogliaSconfittaPesante, giaReagito,
          );
          return e ? [e] : [];
        })(),
      ].sort((a, b) => PRIORITA[a.evento] - PRIORITA[b.evento]);

      const scheda = schedaPersonaggio(bot.id, stato.seme, contesto.chat);
      let inviati = 0;

      for (const candidato of candidati) {
        if (inviati >= contesto.chat.tettoMessaggiAlGiorno) break;

        if (provider && !primaChiamata) await attesa(PAUSA_FRA_CHIAMATE_MS);
        primaChiamata = false;

        const dati: DatiMessaggioChat = {
          squadra: bot.nome, carattere: scheda.carattere, tic: scheda.tic,
          evento: candidato.evento, dettaglio: candidato.dettaglio,
        };
        const esito = await generaMessaggioChat(dati, provider);
        await archivio.salvaMessaggioChat(stato.id, {
          id: randomUUID(), giornata: n, squadraId: bot.id, evento: candidato.evento,
          riferimento: candidato.riferimento, testo: esito.testo, fonte: esito.fonte,
        });
        giaReagito.add(chiaveReazione(candidato.evento, bot.id, candidato.riferimento ?? n));
        inviati++;
      }
    }
  }
}

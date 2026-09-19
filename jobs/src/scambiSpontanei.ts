/**
 * I bot propongono scambi di loro iniziativa (SPEC 6.5: "i bot propongono e
 * valutano"), non solo rispondono. E' la meta' mancante di `decisioneBot`,
 * che sa gia' valutare una proposta ma non sa farne una.
 *
 * L'idea e' riusare quel giudizio invece di scriverne uno parallelo, due
 * volte: prima di scegliere un candidato, si simula la stessa domanda che si
 * farebbe la squadra bersaglio se fosse un bot ("la accetterebbe?") — un
 * primo tentativo senza questo controllo proponeva quasi sempre il giocatore
 * piu' forte disponibile nel ruolo scoperto, che chiunque rifiuta a colpo
 * d'occhio. Poi, sul candidato scelto, un bot si fa la domanda anche su se
 * stesso ("la accetterei io, al contrario?"): se non se la offrirebbe lui,
 * non la propone a nessuno.
 */

import { generatore, seme } from '../../engine/src/casuale.ts';
import type { StagioneSimulata } from '../../engine/src/stagione.ts';
import { RUOLI_MANTRA, type RuoloMantra } from '../../fanta/src/tipi.ts';
import { trovaSquadra, type Archivio, type SquadraSalvata, type StatoLega } from './archivio.ts';
import type { ContestoMondo } from './lega.ts';
import { proponiScambio, scambiAccettatiInStagione, scambiDiSquadra } from './scambi.ts';
import {
  decisioneBot, frequenzaRuoli, frequenzaRuoliSquadra, valoreGiocatorePerRicevente,
  type ConfigurazioneScambi,
} from './valutazione.ts';

/** Il ruolo Mantra che una squadra copre meno nella propria rosa: il suo buco piu' evidente. */
export function ruoloPiuScoperto(squadra: SquadraSalvata, mondo: ContestoMondo['mondo']): RuoloMantra {
  const frequenza = frequenzaRuoliSquadra(squadra, mondo);
  return [...RUOLI_MANTRA].sort((a, b) => (frequenza.get(a) ?? 0) - (frequenza.get(b) ?? 0))[0]!;
}

/**
 * I giocatori che una squadra puo' permettersi di cedere: quelli che coprono
 * almeno un ruolo Mantra in cui ha un doppione, dal piu' al meno pagato.
 *
 * Non e' detto che il primo (il piu' caro tenuto in riserva) sia quello
 * giusto da offrire: dipende da chi vale il giocatore che si vuole in
 * cambio. E' per questo che restituisce una lista di possibilita', non un
 * solo giocatore — il chiamante prova ad accostarle a un candidato finche'
 * una non sembra un accordo alla pari.
 */
export function giocatoriCedibili(squadra: SquadraSalvata, mondo: ContestoMondo['mondo']): string[] {
  const frequenza = frequenzaRuoliSquadra(squadra, mondo);
  const cedibili = squadra.giocatori.filter((g) =>
    mondo.giocatorePerId.get(g.giocatoreId)?.ruoliMantra.some((r) => (frequenza.get(r) ?? 0) >= 2),
  );
  return [...cedibili].sort((a, b) => b.prezzo - a.prezzo).map((g) => g.giocatoreId);
}

/**
 * Fa proporre ai bot gli scambi che hanno senso per loro, per le giornate da
 * `da` a `fino`. Un bot per giornata considera la cosa al massimo una volta,
 * con probabilita' `1 / proponiOgniGiornate`: senza un ritmo, un bot con una
 * rosa scoperta proporrebbe scambi a ogni giornata giocata.
 *
 * Rilegge lo stato dopo ogni proposta: se la controparte era un altro bot che
 * ha accettato subito, le rose sono gia' cambiate quando si passa alla
 * squadra successiva. Per lo stesso motivo si scorrono gli **id** delle
 * squadre bot, decisi una volta all'inizio, e non gli oggetti squadra: un
 * `for...of` su un array non si accorge se quell'array viene sostituito a
 * meta', e userebbe rose vecchie per le squadre bot ancora da processare in
 * questa stessa giornata.
 */
export async function proponiScambiSpontanei(
  archivio: Archivio,
  statoIniziale: StatoLega,
  contesto: ContestoMondo,
  stagione: StagioneSimulata,
  config: ConfigurazioneScambi,
  da: number,
  fino: number,
): Promise<void> {
  let stato = statoIniziale;
  const idBot = statoIniziale.squadre.filter((s) => s.proprietario === null).map((s) => s.id);

  for (let n = da; n <= fino; n++) {
    for (const botId of idBot) {
      // Una squadra puo' essere passata a un proprietario umano nel
      // frattempo (assegnazione manuale, o... non ancora possibile via
      // scambio, ma il controllo costa niente ed evita sorprese future.
      const bot = stato.squadre.find((s) => s.id === botId);
      if (!bot || bot.proprietario !== null) continue;

      const rng = generatore(seme(stato.seme, bot.id, n, 'scambio-spontaneo'));
      if (!rng.bernoulli(1 / config.bot.proponiOgniGiornate)) continue;
      if (scambiAccettatiInStagione(stato, bot.id) >= config.bot.tettoScambiPerStagione) continue;
      if (scambiDiSquadra(stato, bot.id).some((s) => s.daSquadraId === bot.id && s.stato === 'proposto')) continue;

      const cedibili = giocatoriCedibili(bot, contesto.mondo);
      if (cedibili.length === 0) continue;

      const ruoloScoperto = ruoloPiuScoperto(bot, contesto.mondo);
      const frequenzaLega = frequenzaRuoli(stato, contesto.mondo);

      // I candidati che coprono il buco, dal piu' al meno utile al bot: si
      // prova ad accostare un cedibile al primo che regge un doppio
      // controllo, non necessariamente il migliore in assoluto.
      const candidati = stato.squadre
        .filter((altra) => altra.id !== bot.id)
        .flatMap((altra) =>
          altra.giocatori
            .filter((g) => contesto.mondo.giocatorePerId.get(g.giocatoreId)?.ruoliMantra.includes(ruoloScoperto))
            .map((g) => ({
              squadraId: altra.id,
              giocatoreId: g.giocatoreId,
              valorePerBot: valoreGiocatorePerRicevente(
                g.giocatoreId, stato, contesto.mondo, stagione, config, frequenzaLega, bot,
              ),
            })),
        )
        .sort((a, b) => b.valorePerBot - a.valorePerBot);

      let scelta: { squadraId: string; giocatoreId: string; offerto: string } | null = null;
      ricerca: for (const candidato of candidati) {
        for (const offerto of cedibili) {
          // La stessa domanda che si farebbe la squadra bersaglio se fosse un
          // bot: se non l'accetterebbe, non vale la pena nemmeno proporla.
          // Con una persona non e' una previsione esatta — non si conosce il
          // suo gusto — ma resta il modo di non arrivarle con un'offerta che
          // chiunque, ragionevolmente, rifiuterebbe a colpo d'occhio.
          const anteprima = decisioneBot(
            stato, contesto.mondo, stagione, config,
            {
              id: `anteprima-${bot.id}-${candidato.squadraId}-${n}`, aSquadraId: candidato.squadraId,
              offerti: [offerto], richiesti: [candidato.giocatoreId],
            },
            scambiAccettatiInStagione(stato, candidato.squadraId),
          );
          if (anteprima.esito !== 'accettato') continue;

          // E la stessa domanda su se stesso, al contrario: se il bot non
          // accetterebbe di ricevere il candidato cedendo questo offerto,
          // non lo propone nemmeno se la controparte l'avrebbe accettato.
          const sonda = decisioneBot(
            stato, contesto.mondo, stagione, config,
            {
              id: `sonda-${bot.id}-${n}`, aSquadraId: bot.id,
              offerti: [candidato.giocatoreId], richiesti: [offerto],
            },
            scambiAccettatiInStagione(stato, bot.id),
          );
          if (sonda.esito !== 'accettato') continue;

          scelta = { squadraId: candidato.squadraId, giocatoreId: candidato.giocatoreId, offerto };
          break ricerca;
        }
      }
      if (!scelta) continue;

      await proponiScambio(archivio, stato, contesto, stagione, config, {
        daSquadraId: bot.id, aSquadraId: scelta.squadraId,
        offerti: [scelta.offerto], richiesti: [scelta.giocatoreId],
      });
      stato = (await archivio.leggi(stato.id))!;
    }
  }
}

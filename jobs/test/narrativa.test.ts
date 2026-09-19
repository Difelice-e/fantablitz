/**
 * Test dell'orchestrazione fra ciclo di gioco e generatori AI (SPEC 8):
 * cosa si genera, cosa si salta perche' gia' salvato, e che la classifica
 * citata in un editoriale sia quella della sua giornata, non quella finale
 * del gruppo di giornate appena giocate insieme.
 */

import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { indicizza, caricaMondo, type MondoIndicizzato } from '../../engine/src/mondo.ts';
import {
  validaParametriMotore, validaParametriVoto,
  type ParametriMotore, type ParametriVoto,
} from '../../engine/src/configurazione.ts';
import { regoleClassic, type ConfigurazioneClassic } from '../../fanta/src/classic.ts';
import { regoleMantra, type ConfigurazioneMantra } from '../../fanta/src/mantra.ts';
import { validaConfigurazioneLega, type ConfigurazioneLega } from '../../fanta/src/fantavoto.ts';
import { calcolaClassifica } from '../../fanta/src/classifica.ts';
import { archivioInMemoria } from '../src/archivio.ts';
import { importaRose } from '../src/importa.ts';
import { statoDaImport, vistaStagione, type ContestoMondo } from '../src/lega.ts';
import { generaNarrativaGiornate } from '../src/narrativa.ts';
import { validaConfigurazioneScambi, type ConfigurazioneScambi } from '../src/valutazione.ts';
import type { ProviderAI } from '../src/ai/provider.ts';
import { contesto, mondo as mondoJson, roseCompleto } from './comune.ts';

const json = (percorso: string): any =>
  JSON.parse(readFileSync(fileURLToPath(new URL(percorso, import.meta.url)), 'utf8'));

const mondo: MondoIndicizzato = indicizza(caricaMondo(mondoJson));
const motore = validaParametriMotore(json('../../engine/config/motore.json') as ParametriMotore);
const voto = validaParametriVoto(json('../../engine/config/voto.json') as ParametriVoto);
const punteggio = validaConfigurazioneLega(json('../../fanta/config/lega.json') as ConfigurazioneLega);
const regole = {
  classic: regoleClassic(json('../../fanta/config/classic.json') as ConfigurazioneClassic),
  mantra: regoleMantra(json('../../fanta/config/mantra.json') as ConfigurazioneMantra),
};
const configScambi = validaConfigurazioneScambi(json('../../fanta/config/scambi.json') as ConfigurazioneScambi);
const contestoMondo = { mondo, motore, voto, punteggio, regole, scambi: configScambi } as ContestoMondo;

const SEME = 'seme-di-prova-narrativa';

function statoIniziale() {
  const esito = importaRose(roseCompleto, contesto('classic'));
  if (!esito.riuscito) throw new Error('le fixture non si importano piu’');
  return statoDaImport(
    { id: 'prova', nome: 'Prova', seme: SEME, modalita: 'classic', budget: 500, amministratore: null },
    esito.squadre,
  );
}

function contatore(): ProviderAI & { chiamate: number } {
  const stato = { chiamate: 0 };
  return {
    get chiamate() { return stato.chiamate; },
    async genera() {
      stato.chiamate++;
      throw new Error('provider finto: si usa sempre il template in questi test');
    },
  };
}

/* ------------------------------------------------------------------ */

describe('generaNarrativaGiornate', () => {
  it('genera una cronaca per ogni partita del mondo e un editoriale per la giornata', async () => {
    const stato = statoIniziale();
    const giocato = { ...stato, giornateGiocate: 1 };
    const vista = vistaStagione(giocato, contestoMondo);
    const archivio = archivioInMemoria([giocato]);

    await generaNarrativaGiornate(archivio, giocato, contestoMondo, vista, null, 1, 1);

    const partiteGiornata1 = vista.mondo.partite.filter((p) => p.giornata === 1);
    const finale = await archivio.leggi('prova');
    strictEqual(finale!.cronache.length, partiteGiornata1.length);
    strictEqual(finale!.editoriali.length, 1);
    strictEqual(finale!.editoriali[0]!.giornata, 1);
    for (const c of finale!.cronache) strictEqual(c.fonte, 'template');
  });

  it('non rigenera quello che e’ gia’ salvato, e non richiama il provider', async () => {
    const stato = statoIniziale();
    const giocato = { ...stato, giornateGiocate: 1 };
    const vista = vistaStagione(giocato, contestoMondo);
    const archivio = archivioInMemoria([giocato]);

    await generaNarrativaGiornate(archivio, giocato, contestoMondo, vista, null, 1, 1);
    const dopoPrimaVolta = await archivio.leggi('prova');

    const provider = contatore();
    await generaNarrativaGiornate(archivio, dopoPrimaVolta!, contestoMondo, vista, provider, 1, 1);
    const dopoSecondaVolta = await archivio.leggi('prova');

    strictEqual(provider.chiamate, 0, 'niente di nuovo da generare: il provider non deve nemmeno essere chiamato');
    deepStrictEqual(dopoSecondaVolta, dopoPrimaVolta);
  });

  it('l’editoriale di una giornata cita la classifica di quella giornata, non quella finale del gruppo', async () => {
    const stato = statoIniziale();
    const giocato = { ...stato, giornateGiocate: 2 };
    const vista = vistaStagione(giocato, contestoMondo);
    const archivio = archivioInMemoria([giocato]);

    await generaNarrativaGiornate(archivio, giocato, contestoMondo, vista, null, 1, 2);
    const finale = await archivio.leggi('prova');

    const squadraIds = stato.squadre.map((s) => s.id);
    const scontriGiornata1 = vista.giornate.find((g) => g.numero === 1)!.scontri;
    const capolistaAllaGiornata1 = calcolaClassifica(squadraIds, scontriGiornata1)[0]!.squadraId;

    const editorialeGiornata1 = finale!.editoriali.find((e) => e.giornata === 1)!;
    ok(
      editorialeGiornata1.testo.includes(capolistaAllaGiornata1),
      `l’editoriale della giornata 1 dovrebbe citare ${capolistaAllaGiornata1} come capolista di quel momento`,
    );
  });
});

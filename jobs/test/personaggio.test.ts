/** Test della scheda personaggio dei bot (SPEC 7.2). */

import { deepStrictEqual, notStrictEqual, ok, throws } from 'node:assert/strict';
import { describe, it } from 'node:test';
import { schedaPersonaggio, validaConfigurazioneChat, type ConfigurazioneChat } from '../src/personaggio.ts';

function configDiProva(modifiche: Partial<ConfigurazioneChat> = {}): ConfigurazioneChat {
  return {
    versione: 1,
    tettoMessaggiAlGiorno: 1,
    sogliaSconfittaPesante: 20,
    caratteri: ['smargiasso', 'piagnone', 'filosofo'],
    tic: ['dice sempre "vedrete"', 'usa i puntini...'],
    ...modifiche,
  };
}

describe('validaConfigurazioneChat', () => {
  it('accetta una configurazione sensata', () => {
    ok(validaConfigurazioneChat(configDiProva()));
  });

  it('rifiuta un tetto sotto 1', () => {
    throws(() => validaConfigurazioneChat(configDiProva({ tettoMessaggiAlGiorno: 0 })), /tettoMessaggiAlGiorno/);
  });

  it('rifiuta una lista di caratteri vuota', () => {
    throws(() => validaConfigurazioneChat(configDiProva({ caratteri: [] })), /carattere/);
  });

  it('rifiuta una lista di tic vuota', () => {
    throws(() => validaConfigurazioneChat(configDiProva({ tic: [] })), /tic/);
  });
});

describe('schedaPersonaggio', () => {
  const config = configDiProva();

  it('e’ deterministica per la stessa lega e la stessa squadra', () => {
    deepStrictEqual(schedaPersonaggio('Uno', 'seme-a', config), schedaPersonaggio('Uno', 'seme-a', config));
  });

  it('sceglie sempre un carattere e un tic dalla configurazione', () => {
    for (const squadraId of ['Uno', 'Due', 'Tre', 'Quattro', 'Cinque']) {
      const scheda = schedaPersonaggio(squadraId, 'seme-a', config);
      ok(config.caratteri.includes(scheda.carattere));
      ok(config.tic.includes(scheda.tic));
    }
  });

  it('due squadre diverse possono avere schede diverse', () => {
    const schede = ['Uno', 'Due', 'Tre', 'Quattro', 'Cinque'].map((id) => schedaPersonaggio(id, 'seme-a', config));
    const diverse = new Set(schede.map((s) => `${s.carattere}|${s.tic}`));
    ok(diverse.size > 1, 'con cinque squadre e tre caratteri, non dovrebbero uscire tutte identiche');
  });

  it('la stessa squadra in leghe diverse puo’ avere una scheda diversa', () => {
    notStrictEqual(
      JSON.stringify(schedaPersonaggio('Uno', 'seme-a', config)),
      JSON.stringify(schedaPersonaggio('Uno', 'seme-b', config)),
    );
  });
});

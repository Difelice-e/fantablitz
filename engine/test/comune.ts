/** Caricamento condiviso di mondo e configurazione per i test. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { caricaMondo, indicizza, type MondoIndicizzato } from '../src/mondo.ts';
import {
  validaParametriMotore,
  validaParametriVoto,
  type ParametriMotore,
  type ParametriVoto,
} from '../src/configurazione.ts';

const leggi = (percorso: string): unknown =>
  JSON.parse(readFileSync(fileURLToPath(new URL(percorso, import.meta.url)), 'utf8'));

export const mondo: MondoIndicizzato = indicizza(caricaMondo(leggi('../../seed/out/mondo.json')));

export const motore: ParametriMotore = validaParametriMotore(
  leggi('../config/motore.json') as ParametriMotore,
);

export const voto: ParametriVoto = validaParametriVoto(leggi('../config/voto.json') as ParametriVoto);

/**
 * Nomi inventati per club e giocatori.
 *
 * Non e' un ornamento: la regola 1 di CLAUDE.md dice che deve essere possibile
 * sostituire l'intero database con nomi di fantasia cambiando solo il seed.
 * L'opzione `--anonimizza` della riga di comando e' la prova che il vincolo
 * regge davvero: se qualcosa a valle dipendesse da un nome reale, il seed
 * anonimo lo farebbe emergere subito invece che fra sei mesi.
 *
 * I nomi sono costruiti per sillabe, quindi non appartengono a nessuno.
 */

import { generatore, seme } from './casuale.ts';

const INIZIALI = [
  'Ba', 'Be', 'Bo', 'Bra', 'Cal', 'Car', 'Ce', 'Cor', 'Dal', 'Dan', 'Del', 'Dor',
  'Fa', 'Fer', 'Fio', 'Fra', 'Gal', 'Gar', 'Gi', 'Gra', 'La', 'Len', 'Lo', 'Mar',
  'Me', 'Mi', 'Mor', 'Na', 'Ne', 'Or', 'Pa', 'Pe', 'Pi', 'Por', 'Ra', 'Ri', 'Ro',
  'Sa', 'Se', 'Sor', 'Ta', 'Te', 'To', 'Tra', 'Va', 'Ve', 'Vi', 'Zan', 'Ze', 'Zo',
] as const;

const CENTRALI = [
  '', '', 'bal', 'ber', 'bri', 'cal', 'del', 'fan', 'gan', 'len', 'lin', 'mar',
  'mel', 'nas', 'ner', 'pan', 'ras', 'ren', 'ris', 'sal', 'ser', 'tan', 'ter', 'van',
] as const;

const FINALI = [
  'ni', 'no', 'ti', 'to', 'ri', 'ro', 'li', 'lo', 'si', 'so', 'di', 'do',
  'ghi', 'ldi', 'nti', 'tti', 'zzi', 'ssi', 'cci', 'lli', 'nni', 'rri',
] as const;

const NOMI_PROPRI = [
  'A.', 'B.', 'C.', 'D.', 'E.', 'F.', 'G.', 'L.', 'M.', 'N.', 'P.', 'R.', 'S.', 'T.', 'V.',
] as const;

const LUOGHI = [
  'Albaro', 'Belmonte', 'Cardano', 'Costalta', 'Dorbeno', 'Fontalba', 'Gerlano',
  'Isolalta', 'Larino', 'Marzano', 'Nervesa', 'Oltremura', 'Pontelago', 'Quartina',
  'Rovedano', 'Salterio', 'Terrazzo', 'Ubaldo', 'Valmora', 'Zerbino', 'Anselmo',
  'Bardano', 'Cerreto', 'Dosseno', 'Fiorana', 'Gualdo', 'Lentara', 'Montebra',
] as const;

const FORME = ['%l', '%l', '%l', 'Real %l', 'Nuova %l', '%l 1908', 'Athletic %l'] as const;

export type Fantasia = {
  /** Nome di club, stabile per posizione nell'elenco ordinato dei club. */
  club(indice: number): string;
  /** Nome di giocatore, stabile per identificativo del giocatore. */
  giocatore(chiave: string | number): string;
};

export function nomiDiFantasia(semeGlobale: string): Fantasia {
  const luoghiUsati = new Map<number, string>();

  return {
    club(indice) {
      const gia = luoghiUsati.get(indice);
      if (gia) return gia;

      const rng = generatore(seme(semeGlobale, 'club', indice));
      // Si evita di riusare lo stesso luogo scorrendo l'elenco finche' e' libero.
      const presi = new Set(luoghiUsati.values());
      let tentativo = '';
      for (let passo = 0; passo < LUOGHI.length; passo++) {
        const luogo = LUOGHI[(rng.intero(0, LUOGHI.length - 1) + passo) % LUOGHI.length]!;
        tentativo = FORME[rng.intero(0, FORME.length - 1)]!.replace('%l', luogo);
        if (![...presi].some((p) => p.includes(luogo))) break;
      }
      luoghiUsati.set(indice, tentativo);
      return tentativo;
    },

    giocatore(chiave) {
      const rng = generatore(seme(semeGlobale, 'giocatore', chiave));
      const cognome =
        INIZIALI[rng.intero(0, INIZIALI.length - 1)]! +
        CENTRALI[rng.intero(0, CENTRALI.length - 1)]! +
        FINALI[rng.intero(0, FINALI.length - 1)]!;
      // Un quinto dei nomi porta l'iniziale, come nel listone vero dove serve a
      // distinguere gli omonimi.
      return rng.reale() < 0.2
        ? `${cognome} ${NOMI_PROPRI[rng.intero(0, NOMI_PROPRI.length - 1)]}`
        : cognome;
    },
  };
}

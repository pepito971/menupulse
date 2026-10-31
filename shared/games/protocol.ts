// Messages échangés sur le WebSocket des jeux (/ws). Types seulement : le serveur valide les messages
// reçus avec Zod (server/games/engine/protocol.ts), le navigateur importe ces types sans rien embarquer.
import type { Locale } from '../locales.ts';
import type { LobbyFacts } from './types.ts';

export type ClientMessage =
  | { t: 'hello'; token: string } // premier message obligatoire : rattache la connexion à une place
  | { t: 'start'; gameId: string } // depuis le salon : lancer un jeu
  | { t: 'action'; payload: unknown } // action de jeu, validée par le jeu en cours
  | { t: 'leave' } // quitter la table
  | { t: 'sync'; clientTime: number }; // mesure de l'écart d'horloge

export type ServerMessage =
  | { t: 'welcome'; playerId: string; serverTime: number }
  | { t: 'room'; room: RoomView }
  | { t: 'sync'; clientTime: number; serverTime: number }
  | { t: 'error'; code: ErrorCode };

export type ErrorCode =
  | 'invalid_message'
  | 'invalid_token' // place inconnue ou expirée : il faut rejoindre à nouveau
  | 'rate_limited'
  | 'game_unknown'
  | 'game_unavailable'
  | 'game_running'
  | 'too_few_players'
  | 'too_many_players'
  | 'already_played'
  | 'replaced'; // la même place s'est connectée ailleurs (autre onglet)

export interface LobbyGame {
  id: string;
  name: string;
  tagline: string;
  minPlayers: number;
  maxPlayers: number;
  available: boolean; // false : hors Happy Hour, déjà joué aujourd'hui…
  facts?: LobbyFacts;
}

export interface RoomVoucher {
  code: string;
  reward: string;
  expiresAt: number;
}

export interface RoomView {
  serverTime: number;
  you: string;
  locale: Locale;
  tableLabel: string;
  players: { id: string; pseudo: string; connected: boolean }[];
  /** La table forme une équipe pour la soirée : nom tiré au sort, points cumulés de tous ses joueurs. */
  team: { name: string; points: number };
  /** Classement de la soirée à cette table (points cumulés, joueurs partis compris). */
  standings: { pseudo: string; score: number; games: number; you: boolean }[];
  /** Records du mois dans l'établissement (seulement les joueurs qui l'ont accepté). */
  hallOfFame: { gameId: string; game: string; pseudo: string; score: number }[];
  games: LobbyGame[];
  /** Jeu en cours : `view` est propre au jeu (voir client/src/games/<id>/). */
  current: { gameId: string; rev: number; view: unknown } | null;
  /** Résultat de la dernière partie, affiché dans le salon jusqu'à la suivante. */
  lastResult: {
    gameId: string;
    ranking: { pseudo: string; score: number }[];
    vouchers: RoomVoucher[]; // seulement ceux de ce joueur ou de toute la table
  } | null;
}

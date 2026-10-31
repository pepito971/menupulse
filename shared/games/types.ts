// Contrat entre le moteur de jeux et un jeu. Le moteur (server/games/engine/) ne connaît aucun jeu ;
// un jeu ne connaît ni les WebSockets ni la base. Ajouter un jeu = ses règles (server/games/<id>/rules.ts)
// + son affichage (client/src/games/<id>/client.ts), sans toucher au moteur.
import type { ZodType } from 'zod';
import type { Locale } from '../locales.ts';

/** Une partie se joue à une table, ou dans toute la salle (une équipe par table). */
export type RoomKind = 'table' | 'venue';

export interface PlayerRef {
  id: string;
  pseudo: string;
  locale: Locale; // chaque joueur reçoit sa vue dans sa langue
  teamId?: string; // partie de salle : identifiant de la table du joueur
}

/** Qui regarde : un joueur, l'écran du bar (classement), ou le personnel qui anime. */
export type Viewer = { role: 'player'; player: PlayerRef } | { role: 'display' } | { role: 'host' };

export interface RuleContext {
  now: number; // horloge du serveur (ms), injectée : les règles restent testables
  random(maxExclusive: number): number; // crypto.randomInt en vrai, suite fixe en test
  setTimer(id: string, delayMs: number): void; // remplace un minuteur du même id
  clearTimer(id: string): void;
}

export interface SetupContext<Settings> {
  settings: Settings;
  players: readonly PlayerRef[];
  content: unknown; // pack de contenu déjà validé par contentSchema
  rules: RuleContext;
}

export interface GameResult {
  ranking: { playerId: string; score: number }[]; // trié du meilleur au moins bon
}

export interface GameDefinition<Settings, State, Action, View> {
  id: string; // 'quiz', 'roue'… jamais réutilisé pour un autre jeu
  version: number;
  roomKinds: readonly RoomKind[];
  players: { min: number; max: number };
  settingsSchema: ZodType<Settings>;
  actionSchema: ZodType<Action>; // chaque message d'un joueur est validé par le jeu lui-même
  contentSchema?: ZodType<unknown>;
  setup(ctx: SetupContext<Settings>): State;
  onAction(state: State, player: PlayerRef, action: Action, ctx: RuleContext): State;
  onTimer?(state: State, timerId: string, ctx: RuleContext): State;
  /** Vue propre à chacun : ce qui doit rester secret (bonne réponse…) n'en sort jamais. */
  view(state: State, viewer: Viewer): View;
  /** Non null = partie terminée. */
  result(state: State): GameResult | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- registre hétérogène, typé jeu par jeu
export type AnyGameDefinition = GameDefinition<any, any, any, any>;

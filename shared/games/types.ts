// Contrat entre le moteur de jeux et un jeu. Le moteur (server/games/engine/) ne connaît aucun jeu ;
// un jeu ne connaît ni les WebSockets ni la base. Ajouter un jeu = ses règles (server/games/<id>/)
// + son composant d'affichage (client/src/games/<id>/client.ts), sans toucher au moteur.
//
// Les règles sont des fonctions déterministes : horloge et tirage au sort sont INJECTÉS (RuleContext),
// une partie entière se teste donc sans socket ni navigateur. L'état appartient au jeu : une règle peut
// le modifier et le renvoyer.
import type { Locale, Localized } from '../locales.ts';

/** Une partie se joue à une table, ou dans toute la salle (une équipe par table). */
export type RoomKind = 'table' | 'venue';

export interface PlayerRef {
  id: string;
  pseudo: string;
  locale: Locale; // chaque joueur reçoit sa vue dans sa langue
  teamId?: string; // partie de salle : identifiant de la table du joueur
}

/** Qui regarde : un joueur, ou l'écran du bar (classement), dans une langue donnée. */
export type Viewer = { role: 'player'; player: PlayerRef } | { role: 'display'; locale: Locale };

/** Bon de réduction ou gain, à présenter au comptoir. Enregistré en base par le moteur. */
export interface VoucherEffect {
  kind: 'voucher';
  code: string;
  reward: Localized;
  expiresAt: number; // ms, horloge du serveur
  playerId?: string; // absent = gagné par toute la table
  productId?: string;
}

export type GameEffect = VoucherEffect;

export interface RuleContext {
  now: number; // horloge du serveur (ms)
  random(maxExclusive: number): number; // entier dans [0, maxExclusive) — crypto.randomInt en vrai
  setTimer(id: string, delayMs: number): void; // remplace un minuteur du même id
  clearTimer(id: string): void;
  emit(effect: GameEffect): void; // traité par le moteur après la règle (écriture en base)
}

export interface SetupContext<Settings, Content> {
  settings: Settings;
  content: Content;
  players: readonly PlayerRef[];
  rules: RuleContext;
}

export interface GameResult {
  ranking: { playerId: string; score: number }[]; // du meilleur au moins bon ; vide = jeu sans score
  vouchers: VoucherEffect[];
}

/** Ce dont un jeu a besoin pour décider s'il peut être lancé maintenant. */
export interface AvailabilityContext {
  happyHourActive: boolean;
}

export interface LobbyFacts {
  rounds?: number;
  roundSeconds?: number;
  maxPoints?: number;
}

/** Validation d'une entrée inconnue (un schéma Zod convient tel quel). */
export interface Schema<T> {
  safeParse(input: unknown): { success: true; data: T } | { success: false };
}

export interface GameDefinition<Settings, Content, State, Action, View> {
  id: string; // 'quiz-comptoir'… jamais réutilisé pour un autre jeu
  version: number;
  name: Localized;
  tagline: Localized;
  roomKinds: readonly RoomKind[];
  players: { min: number; max: number };
  ranked: boolean; // true = le meilleur joueur peut entrer au tableau d'honneur
  defaultEnabled: boolean; // activé pour un établissement qui n'a rien réglé
  oncePerTablePerDay?: boolean; // levier commercial : une seule partie par table et par jour
  settingsSchema: Schema<Settings>; // valeurs par défaut comprises : safeParse({}) doit réussir
  contentSchema: Schema<Content>;
  defaultContent?: unknown; // contenu fourni par Menupulse quand l'établissement n'a pas de pack
  actionSchema: Schema<Action>; // chaque message d'un joueur est validé par le jeu lui-même
  isAvailable?(context: AvailabilityContext): boolean;
  /** Repères affichés sur la carte du jeu dans le salon (nombre de questions, points possibles…). */
  facts?(settings: Settings): LobbyFacts;
  setup(ctx: SetupContext<Settings, Content>): State;
  onAction(state: State, player: PlayerRef, action: Action, ctx: RuleContext): State;
  onTimer?(state: State, timerId: string, ctx: RuleContext): State;
  /** Vue propre à chacun : ce qui doit rester secret (bonne réponse, mot à faire deviner…) n'en sort jamais. */
  view(state: State, viewer: Viewer): View;
  /** Non null = partie terminée. */
  result(state: State): GameResult | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- registre hétérogène, typé jeu par jeu
export type AnyGameDefinition = GameDefinition<any, any, any, any, any>;

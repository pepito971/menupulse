// Salle de jeu d'une table : places (10 au plus), reconnexion, partie en cours, minuteurs. Elle fait
// AUTORITÉ : les téléphones n'envoient que des intentions, validées par le jeu, et ne reçoivent que leur
// propre vue. Aucune dépendance au réseau ni à la base (crochets `hooks`) : testée avec une horloge
// simulée (test/game-room.test.ts).
import type { AnyGameDefinition, GameEffect, GameResult, PlayerRef, RuleContext } from '../../../shared/games/types.ts';

export interface Scheduler {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const systemScheduler: Scheduler = {
  now: () => Date.now(),
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface Seat {
  player: PlayerRef;
  connected: boolean;
  hallOfFameConsent: boolean;
  expired: boolean; // délai de reconnexion écoulé pendant une partie : place libérée à la fin
  grace: unknown;
}

export interface RunningGame {
  definition: AnyGameDefinition;
  state: unknown;
  rev: number;
  players: PlayerRef[];
  timers: Map<string, unknown>;
}

export interface FinishedGame {
  gameId: string;
  result: GameResult;
  pseudos: Map<string, string>;
}

export interface RoomHooks {
  /** Après chaque changement : le moteur renvoie à chaque joueur connecté sa propre vue. */
  changed(room: Room): void;
  effect(room: Room, game: RunningGame, effect: GameEffect): void;
  gameStarted(room: Room, game: RunningGame): void;
  gameEnded(room: Room, game: RunningGame, result: GameResult | null, reason: 'finished' | 'abandoned'): void;
  /** Plus aucune place : la salle peut être détruite. */
  emptied(room: Room): void;
}

export type JoinOutcome = 'ok' | 'full' | 'pseudo_taken';
export type StartOutcome = 'ok' | 'game_running' | 'too_few_players' | 'too_many_players';
export type ActOutcome = 'ok' | 'no_game' | 'not_player' | 'invalid_action';

export const MAX_PLAYERS = 10;
export const RECONNECT_GRACE_MS = 45_000;

export class Room {
  readonly id: string;
  readonly maxPlayers: number;
  readonly seats = new Map<string, Seat>();
  game: RunningGame | null = null;
  lastResult: FinishedGame | null = null;
  /** Points cumulés de la soirée, par joueur (gardés après son départ : la table reste une équipe). */
  readonly standings = new Map<string, { pseudo: string; score: number; games: number }>();

  readonly #scheduler: Scheduler;
  readonly #random: (maxExclusive: number) => number;
  readonly #hooks: RoomHooks;
  readonly #graceMs: number;
  #destroyed = false;

  constructor(options: {
    id: string;
    hooks: RoomHooks;
    random: (maxExclusive: number) => number;
    scheduler?: Scheduler;
    maxPlayers?: number;
    graceMs?: number;
  }) {
    this.id = options.id;
    this.#hooks = options.hooks;
    this.#random = options.random;
    this.#scheduler = options.scheduler ?? systemScheduler;
    this.maxPlayers = options.maxPlayers ?? MAX_PLAYERS;
    this.#graceMs = options.graceMs ?? RECONNECT_GRACE_MS;
  }

  /** Réserve une place. Elle se libère d'elle-même si personne ne s'y connecte dans le délai. */
  addSeat(player: PlayerRef, hallOfFameConsent: boolean): JoinOutcome {
    if (this.seats.size >= this.maxPlayers) return 'full';
    const pseudo = player.pseudo.toLocaleLowerCase();
    if ([...this.seats.values()].some((seat) => seat.player.pseudo.toLocaleLowerCase() === pseudo)) return 'pseudo_taken';
    const seat: Seat = { player, connected: false, hallOfFameConsent, expired: false, grace: null };
    this.seats.set(player.id, seat);
    this.#armGrace(seat);
    this.#hooks.changed(this);
    return 'ok';
  }

  connect(playerId: string): boolean {
    const seat = this.seats.get(playerId);
    if (!seat || this.#destroyed) return false;
    this.#clearGrace(seat);
    seat.connected = true;
    seat.expired = false;
    this.#hooks.changed(this);
    return true;
  }

  disconnect(playerId: string): void {
    const seat = this.seats.get(playerId);
    if (!seat || !seat.connected) return;
    seat.connected = false;
    this.#armGrace(seat);
    this.#hooks.changed(this);
  }

  /** Départ volontaire : la place se libère tout de suite (la partie continue sans le joueur). */
  leave(playerId: string): void {
    const seat = this.seats.get(playerId);
    if (!seat) return;
    this.#clearGrace(seat);
    this.seats.delete(playerId);
    this.#afterSeatRemoved();
  }

  startGame(definition: AnyGameDefinition, settings: unknown, content: unknown): StartOutcome {
    if (this.game) return 'game_running';
    const players = [...this.seats.values()].filter((seat) => seat.connected).map((seat) => seat.player);
    if (players.length < definition.players.min) return 'too_few_players';
    if (players.length > definition.players.max) return 'too_many_players';
    const game: RunningGame = { definition, state: undefined, rev: 0, players, timers: new Map() };
    this.game = game;
    this.lastResult = null;
    this.#hooks.gameStarted(this, game);
    this.#run(game, (ctx) => definition.setup({ settings, content, players, rules: ctx }));
    return 'ok';
  }

  act(playerId: string, payload: unknown): ActOutcome {
    const game = this.game;
    if (!game) return 'no_game';
    const player = game.players.find((p) => p.id === playerId);
    if (!player) return 'not_player'; // arrivé pendant la partie : il jouera à la suivante
    const parsed = game.definition.actionSchema.safeParse(payload);
    if (!parsed.success) return 'invalid_action';
    this.#run(game, (ctx) => game.definition.onAction(game.state, player, parsed.data, ctx));
    return 'ok';
  }

  /** Vue de la partie en cours pour ce joueur, ou null s'il n'y joue pas. */
  gameView(playerId: string): unknown {
    const game = this.game;
    const player = game?.players.find((p) => p.id === playerId);
    if (!game || !player) return null;
    return game.definition.view(game.state, { role: 'player', player });
  }

  /** Arrête la partie en cours sans résultat (salle vidée, arrêt du serveur). */
  abandonGame(): void {
    if (this.game) this.#finish(this.game, null, 'abandoned');
  }

  destroy(): void {
    this.#destroyed = true;
    if (this.game) {
      this.#clearTimers(this.game);
      this.game = null;
    }
    for (const seat of this.seats.values()) this.#clearGrace(seat);
  }

  #armGrace(seat: Seat): void {
    this.#clearGrace(seat);
    seat.grace = this.#scheduler.setTimeout(() => this.#expire(seat.player.id), this.#graceMs);
  }

  #clearGrace(seat: Seat): void {
    if (seat.grace !== null) this.#scheduler.clearTimeout(seat.grace);
    seat.grace = null;
  }

  #expire(playerId: string): void {
    const seat = this.seats.get(playerId);
    if (!seat || seat.connected) return;
    seat.grace = null;
    if (this.game?.players.some((p) => p.id === playerId)) {
      seat.expired = true; // garde sa place et son score jusqu'à la fin de la partie
      return;
    }
    this.seats.delete(playerId);
    this.#afterSeatRemoved();
  }

  #afterSeatRemoved(): void {
    if (this.seats.size > 0) {
      this.#hooks.changed(this);
      return;
    }
    if (this.game) this.#finish(this.game, null, 'abandoned'); // signale aussi la salle vide
    else this.#hooks.emptied(this);
  }

  #context(game: RunningGame, effects: GameEffect[]): RuleContext {
    return {
      now: this.#scheduler.now(),
      random: this.#random,
      setTimer: (id, delayMs) => {
        const previous = game.timers.get(id);
        if (previous !== undefined) this.#scheduler.clearTimeout(previous);
        game.timers.set(id, this.#scheduler.setTimeout(() => this.#fire(game, id), Math.max(0, delayMs)));
      },
      clearTimer: (id) => {
        const handle = game.timers.get(id);
        if (handle !== undefined) this.#scheduler.clearTimeout(handle);
        game.timers.delete(id);
      },
      emit: (effect) => {
        effects.push(effect);
      },
    };
  }

  #fire(game: RunningGame, timerId: string): void {
    if (this.game !== game) return;
    game.timers.delete(timerId);
    const onTimer = game.definition.onTimer;
    if (onTimer) this.#run(game, (ctx) => onTimer(game.state, timerId, ctx));
  }

  /** Exécute une règle. Une erreur dans un jeu arrête CETTE partie, jamais le serveur ni les autres tables. */
  #run(game: RunningGame, step: (ctx: RuleContext) => unknown): void {
    const effects: GameEffect[] = [];
    let result: GameResult | null;
    try {
      game.state = step(this.#context(game, effects));
      game.rev += 1;
      result = game.definition.result(game.state);
    } catch (error) {
      console.error(`[jeux] erreur dans « ${game.definition.id} », partie arrêtée`, error);
      this.#finish(game, null, 'abandoned');
      return;
    }
    for (const effect of effects) this.#hooks.effect(this, game, effect);
    if (result) this.#finish(game, result, 'finished');
    else this.#hooks.changed(this);
  }

  #clearTimers(game: RunningGame): void {
    for (const handle of game.timers.values()) this.#scheduler.clearTimeout(handle);
    game.timers.clear();
  }

  #finish(game: RunningGame, result: GameResult | null, reason: 'finished' | 'abandoned'): void {
    if (this.game !== game) return;
    this.#clearTimers(game);
    this.game = null;
    if (result) {
      this.lastResult = { gameId: game.definition.id, result, pseudos: new Map(game.players.map((p) => [p.id, p.pseudo])) };
      for (const player of game.players) {
        const line = this.standings.get(player.id) ?? { pseudo: player.pseudo, score: 0, games: 0 };
        line.games += 1;
        line.score += result.ranking.find((entry) => entry.playerId === player.id)?.score ?? 0;
        this.standings.set(player.id, line);
      }
    }
    this.#hooks.gameEnded(this, game, result, reason);
    for (const [id, seat] of this.seats) {
      if (!seat.connected && seat.expired) this.seats.delete(id);
    }
    if (this.seats.size === 0) this.#hooks.emptied(this);
    else this.#hooks.changed(this);
  }
}

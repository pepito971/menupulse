// Gestionnaire des salles de jeu : une salle par table, en mémoire (une seule instance du serveur ; au-delà,
// Redis derrière cette classe). Fait le lien entre la salle (règles, minuteurs), la base (GameStore) et
// les connexions WebSocket. Les pseudos ne quittent pas la mémoire, sauf le meilleur joueur d'une partie
// qui a accepté le tableau d'honneur.
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import type { ClientMessage, ErrorCode, LobbyGame, RoomView, ServerMessage } from '../../shared/games/protocol.ts';
import type { AnyGameDefinition } from '../../shared/games/types.ts';
import { isHappyHourActive } from '../../shared/happy-hour.ts';
import type { Locale } from '../../shared/locales.ts';
import { TEAM_NAMES, teamNameIndex } from '../../shared/games/team-names.ts';
import { localDay, periodStarts } from '../../shared/periods.ts';
import { loadGameContent } from './content-loaders.ts';
import { Room, systemScheduler, type Scheduler } from './engine/room.ts';
import { text } from './helpers.ts';
import type { EstablishmentGameConfig, GameStore, TableInfo } from './store.ts';

export interface Connection {
  send(message: ServerMessage): void;
  close(code: number, reason: string): void;
}

export interface PlayerSession {
  playerId: string;
  handle(message: ClientMessage): void;
  disconnect(): void;
}

export type JoinResult = { ok: true; token: string } | { ok: false; error: 'table_unknown' | 'games_closed' | 'full' | 'pseudo_taken' };

interface Entry {
  room: Room;
  table: TableInfo;
  config: EstablishmentGameConfig;
  sockets: Map<string, Connection>;
  consents: Map<string, boolean>;
  sessionId: Promise<string | null> | null;
  starting: boolean;
  hallOfFame: { gameId: string; pseudo: string; score: number }[];
}

export class GameRooms {
  readonly #store: GameStore;
  readonly #definitions: ReadonlyMap<string, AnyGameDefinition>;
  readonly #scheduler: Scheduler;
  readonly #random: (maxExclusive: number) => number;
  readonly #entries = new Map<string, Entry>(); // par table
  readonly #creating = new Map<string, Promise<Entry>>();
  readonly #tokens = new Map<string, { tableId: string; playerId: string }>();
  readonly #playedToday = new Map<string, string>(); // `${tableId}:${gameId}` → jour local (jeux « une fois par jour »)

  constructor(options: { store: GameStore; definitions: ReadonlyMap<string, AnyGameDefinition>; scheduler?: Scheduler; random?: (maxExclusive: number) => number }) {
    this.#store = options.store;
    this.#definitions = options.definitions;
    this.#scheduler = options.scheduler ?? systemScheduler;
    this.#random = options.random ?? ((maxExclusive) => randomInt(maxExclusive));
  }

  async join(input: { tableToken: string; pseudo: string; locale: Locale; hallOfFameConsent: boolean }): Promise<JoinResult> {
    const table = await this.#store.findTable(input.tableToken);
    if (!table || !table.tapsyActive) return { ok: false, error: 'table_unknown' };
    if (!table.gamesOpen) return { ok: false, error: 'games_closed' };
    const entry = await this.#entry(table);
    const playerId = randomUUID();
    const locale = table.locales.includes(input.locale) ? input.locale : table.defaultLocale;
    const outcome = entry.room.addSeat({ id: playerId, pseudo: input.pseudo, locale }, input.hallOfFameConsent);
    if (outcome !== 'ok') return { ok: false, error: outcome };
    entry.consents.set(playerId, input.hallOfFameConsent);
    const token = randomBytes(24).toString('base64url');
    this.#tokens.set(token, { tableId: table.tableId, playerId });
    return { ok: true, token };
  }

  /** Rattache une connexion à une place (message « hello »). null : place inconnue ou expirée. */
  connect(token: string, connection: Connection): PlayerSession | null {
    const seatRef = this.#tokens.get(token);
    const entry = seatRef ? this.#entries.get(seatRef.tableId) : undefined;
    if (!seatRef || !entry || !entry.room.seats.has(seatRef.playerId)) {
      this.#tokens.delete(token);
      return null;
    }
    const { playerId } = seatRef;
    const previous = entry.sockets.get(playerId);
    if (previous && previous !== connection) {
      previous.send({ t: 'error', code: 'replaced' });
      previous.close(4002, 'Place reprise ailleurs');
    }
    entry.sockets.set(playerId, connection);
    connection.send({ t: 'welcome', playerId, serverTime: this.#scheduler.now() });
    entry.room.connect(playerId);

    return {
      playerId,
      handle: (message) => this.#handle(entry, token, playerId, connection, message),
      disconnect: () => {
        if (entry.sockets.get(playerId) !== connection) return;
        entry.sockets.delete(playerId);
        entry.room.disconnect(playerId);
      },
    };
  }

  /** Arrêt du serveur : les parties en cours sont abandonnées proprement. */
  shutdown(): void {
    for (const entry of this.#entries.values()) {
      entry.room.abandonGame();
      entry.room.destroy();
    }
    this.#entries.clear();
  }

  get tableCount(): number {
    return this.#entries.size;
  }

  async #entry(table: TableInfo): Promise<Entry> {
    const existing = this.#entries.get(table.tableId);
    if (existing) {
      existing.table = table;
      return existing;
    }
    let creating = this.#creating.get(table.tableId);
    if (!creating) {
      creating = this.#store.loadConfig(table.establishmentId).then((config) => {
        const entry: Entry = { room: undefined as unknown as Room, table, config, sockets: new Map(), consents: new Map(), sessionId: null, starting: false, hallOfFame: [] };
        entry.room = this.#createRoom(entry);
        this.#entries.set(table.tableId, entry);
        void this.#refreshHallOfFame(entry);
        return entry;
      });
      this.#creating.set(table.tableId, creating);
      creating.finally(() => this.#creating.delete(table.tableId)).catch(() => {});
    }
    return creating;
  }

  #createRoom(entry: Entry): Room {
    return new Room({
      id: entry.table.tableId,
      scheduler: this.#scheduler,
      random: this.#random,
      hooks: {
        changed: () => this.#publish(entry),
        effect: (_room, game, effect) => {
          this.#store
            .saveVoucher({ establishmentId: entry.table.establishmentId, tableId: entry.table.tableId, gameId: game.definition.id, voucher: effect })
            .catch((error: unknown) => console.error('[jeux] bon non enregistré', error));
        },
        gameStarted: (_room, game) => {
          const { definition } = game;
          if (definition.oncePerTablePerDay) this.#playedToday.set(`${entry.table.tableId}:${definition.id}`, this.#today(entry));
          entry.sessionId = this.#store
            .sessionStarted({ establishmentId: entry.table.establishmentId, tableId: entry.table.tableId, gameId: definition.id, gameVersion: definition.version, playerCount: game.players.length })
            .catch((error: unknown) => {
              console.error('[jeux] partie non enregistrée', error);
              return null;
            });
        },
        gameEnded: (_room, game, result, reason) => {
          const sessionId = entry.sessionId;
          entry.sessionId = null;
          void sessionId
            ?.then((id) => (id ? this.#store.sessionEnded(id, game.players.length, reason) : undefined))
            .catch((error: unknown) => console.error('[jeux] fin de partie non enregistrée', error));
          const best = result?.ranking[0];
          const pseudo = best ? game.players.find((p) => p.id === best.playerId)?.pseudo : undefined;
          if (game.definition.ranked && best && best.score > 0 && pseudo && entry.consents.get(best.playerId)) {
            this.#store
              .recordHallOfFame({ establishmentId: entry.table.establishmentId, gameId: game.definition.id, pseudo, score: best.score, timezone: entry.config.timezone, now: new Date(this.#scheduler.now()) })
              .then(() => this.#refreshHallOfFame(entry))
              .catch((error: unknown) => console.error('[jeux] tableau d’honneur non enregistré', error));
          }
        },
        emptied: () => this.#destroy(entry),
      },
    });
  }

  /** Records du mois, relus à l'ouverture de la table et après chaque nouveau record. */
  async #refreshHallOfFame(entry: Entry): Promise<void> {
    try {
      const month = periodStarts(new Date(this.#scheduler.now()), entry.config.timezone).month;
      entry.hallOfFame = await this.#store.loadHallOfFame(entry.table.establishmentId, 'month', month);
      if (this.#entries.get(entry.table.tableId) === entry) this.#publish(entry);
    } catch (error) {
      console.error('[jeux] tableau d’honneur illisible', error);
    }
  }

  #destroy(entry: Entry): void {
    entry.room.destroy();
    this.#entries.delete(entry.table.tableId);
    for (const [token, ref] of this.#tokens) if (ref.tableId === entry.table.tableId) this.#tokens.delete(token);
    for (const connection of entry.sockets.values()) connection.close(4004, 'Table fermée');
    entry.sockets.clear();
  }

  #handle(entry: Entry, token: string, playerId: string, connection: Connection, message: ClientMessage): void {
    switch (message.t) {
      case 'start':
        void this.#start(entry, playerId, message.gameId).then((error) => {
          if (error) connection.send({ t: 'error', code: error });
        });
        break;
      case 'action':
        if (entry.room.act(playerId, message.payload) === 'invalid_action') connection.send({ t: 'error', code: 'invalid_message' });
        break;
      case 'leave':
        this.#tokens.delete(token);
        entry.sockets.delete(playerId);
        entry.room.leave(playerId);
        connection.close(4000, 'Partie quittée');
        break;
      case 'sync':
        connection.send({ t: 'sync', clientTime: message.clientTime, serverTime: this.#scheduler.now() });
        break;
      case 'hello':
        break;
    }
  }

  async #start(entry: Entry, playerId: string, gameId: string): Promise<ErrorCode | null> {
    const definition = this.#definitions.get(gameId);
    if (!definition) return 'game_unknown';
    if (entry.starting || entry.room.game) return 'game_running';
    if (!entry.room.seats.get(playerId)?.connected) return 'invalid_token';
    entry.starting = true;
    try {
      entry.config = await this.#store.loadConfig(entry.table.establishmentId); // réglages à jour à chaque partie
      const lobby = this.#lobbyGames(entry, 'fr').find((game) => game.id === gameId);
      if (!lobby) return 'game_unknown';
      if (!lobby.available) return definition.oncePerTablePerDay && this.#alreadyPlayed(entry, definition) ? 'already_played' : 'game_unavailable';
      const settings = this.#settings(entry, definition);
      const content = definition.contentSchema.safeParse(
        await loadGameContent(definition, settings as Record<string, unknown>, { store: this.#store, establishmentId: entry.table.establishmentId, timezone: entry.config.timezone }),
      );
      if (!content.success) return 'game_unavailable'; // ex. moins de 4 boissons pour la Boisson Mystère
      const outcome = entry.room.startGame(definition, settings, content.data);
      return outcome === 'ok' ? null : outcome;
    } catch (error) {
      console.error(`[jeux] lancement de « ${gameId} » impossible`, error);
      return 'game_unavailable';
    } finally {
      entry.starting = false;
    }
  }

  #settings(entry: Entry, definition: AnyGameDefinition): unknown {
    const stored = entry.config.games.get(definition.id)?.settings ?? {};
    const parsed = definition.settingsSchema.safeParse(stored);
    if (parsed.success) return parsed.data;
    console.warn(`[jeux] réglages invalides pour « ${definition.id} » (${entry.table.establishmentId}) : valeurs par défaut`);
    const defaults = definition.settingsSchema.safeParse({});
    return defaults.success ? defaults.data : {};
  }

  #today(entry: Entry): string {
    return localDay(new Date(this.#scheduler.now()), entry.config.timezone);
  }

  #alreadyPlayed(entry: Entry, definition: AnyGameDefinition): boolean {
    return this.#playedToday.get(`${entry.table.tableId}:${definition.id}`) === this.#today(entry);
  }

  #lobbyGames(entry: Entry, locale: Locale): LobbyGame[] {
    const happyHourActive = isHappyHourActive(entry.config.happyHours, new Date(this.#scheduler.now()), entry.config.timezone);
    const games: LobbyGame[] = [];
    for (const definition of this.#definitions.values()) {
      const enabled = entry.config.games.get(definition.id)?.enabled ?? definition.defaultEnabled;
      if (!enabled) continue;
      const available =
        (definition.isAvailable?.({ happyHourActive }) ?? true) && !(definition.oncePerTablePerDay && this.#alreadyPlayed(entry, definition));
      games.push({
        id: definition.id,
        name: text(definition.name, locale),
        tagline: text(definition.tagline, locale),
        minPlayers: definition.players.min,
        maxPlayers: definition.players.max,
        available,
        facts: definition.facts?.(this.#settings(entry, definition)),
      });
    }
    return games;
  }

  #view(entry: Entry, playerId: string): RoomView | null {
    const seat = entry.room.seats.get(playerId);
    if (!seat) return null;
    const { locale } = seat.player;
    const game = entry.room.game;
    const last = entry.room.lastResult;
    return {
      serverTime: this.#scheduler.now(),
      you: playerId,
      locale,
      tableLabel: entry.table.label,
      players: [...entry.room.seats.values()].map((s) => ({ id: s.player.id, pseudo: s.player.pseudo, connected: s.connected })),
      team: {
        name: text(TEAM_NAMES[teamNameIndex(entry.table.tableId, this.#today(entry))]!, locale),
        points: [...entry.room.standings.values()].reduce((sum, line) => sum + line.score, 0),
      },
      standings: [...entry.room.standings]
        .map(([id, line]) => ({ pseudo: line.pseudo, score: line.score, games: line.games, you: id === playerId }))
        .sort((a, b) => b.score - a.score),
      hallOfFame: entry.hallOfFame.flatMap((record) => {
        const definition = this.#definitions.get(record.gameId);
        return definition ? [{ gameId: record.gameId, game: text(definition.name, locale), pseudo: record.pseudo, score: record.score }] : [];
      }),
      games: this.#lobbyGames(entry, locale),
      current: game ? { gameId: game.definition.id, rev: game.rev, view: entry.room.gameView(playerId) } : null,
      lastResult: last
        ? {
            gameId: last.gameId,
            ranking: last.result.ranking.map((line) => ({ pseudo: last.pseudos.get(line.playerId) ?? '?', score: line.score })),
            vouchers: last.result.vouchers
              .filter((voucher) => !voucher.playerId || voucher.playerId === playerId) // un bon nominatif ne s'affiche que chez son gagnant
              .map((voucher) => ({ code: voucher.code, reward: text(voucher.reward, locale), expiresAt: voucher.expiresAt })),
          }
        : null,
    };
  }

  #publish(entry: Entry): void {
    for (const [playerId, connection] of entry.sockets) {
      const view = this.#view(entry, playerId);
      if (view) connection.send({ t: 'room', room: view });
    }
  }
}

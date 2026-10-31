// Outils de test du moteur de jeux : horloge simulée, hasard reproductible, salle instrumentée.
import type { Scheduler } from '../../server/games/engine/room.ts';
import { Room, type RunningGame } from '../../server/games/engine/room.ts';
import type { AnyGameDefinition, GameEffect, GameResult, PlayerRef } from '../../shared/games/types.ts';

export class FakeClock implements Scheduler {
  time = 1_000_000;
  #seq = 0;
  readonly #timers = new Map<number, { at: number; callback: () => void }>();

  now(): number {
    return this.time;
  }
  setTimeout(callback: () => void, delayMs: number): unknown {
    const id = ++this.#seq;
    this.#timers.set(id, { at: this.time + delayMs, callback });
    return id;
  }
  clearTimeout(handle: unknown): void {
    this.#timers.delete(handle as number);
  }
  /** Avance le temps en déclenchant, dans l'ordre, les minuteurs échus. */
  advance(ms: number): void {
    const target = this.time + ms;
    for (;;) {
      const next = [...this.#timers.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) break;
      this.#timers.delete(next[0]);
      this.time = next[1].at;
      next[1].callback();
    }
    this.time = target;
  }
  get pending(): number {
    return this.#timers.size;
  }
}

/** Hasard reproductible (mulberry32). */
export function seededRandom(seed = 42): (maxExclusive: number) => number {
  let a = seed;
  return (maxExclusive) => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * maxExclusive);
  };
}

export function players(...pseudos: string[]): PlayerRef[] {
  return pseudos.map((pseudo, i) => ({ id: `p${i + 1}`, pseudo, locale: 'fr' }));
}

export interface Harness {
  room: Room;
  clock: FakeClock;
  effects: GameEffect[];
  ended: { result: GameResult | null; reason: string }[];
  emptied: number;
  view<T>(playerId: string): T;
  act(playerId: string, payload: unknown): string;
  start(definition: AnyGameDefinition, settings?: unknown, content?: unknown): string;
}

export function harness(seats: PlayerRef[], options: { seed?: number; random?: (n: number) => number } = {}): Harness {
  const clock = new FakeClock();
  const effects: GameEffect[] = [];
  const ended: { result: GameResult | null; reason: string }[] = [];
  const counters = { emptied: 0 };
  const room = new Room({
    id: 'table-test',
    scheduler: clock,
    random: options.random ?? seededRandom(options.seed),
    hooks: {
      changed: () => {},
      effect: (_room, _game: RunningGame, effect) => effects.push(effect),
      gameStarted: () => {},
      gameEnded: (_room, _game, result, reason) => ended.push({ result, reason }),
      emptied: () => {
        counters.emptied += 1;
      },
    },
  });
  for (const player of seats) {
    room.addSeat(player, true);
    room.connect(player.id);
  }
  return {
    room,
    clock,
    effects,
    ended,
    get emptied() {
      return counters.emptied;
    },
    view: <T>(playerId: string) => room.gameView(playerId) as T,
    act: (playerId, payload) => room.act(playerId, payload),
    start: (definition, settings = {}, content = definition.defaultContent) => {
      const parsedSettings = definition.settingsSchema.safeParse(settings);
      const parsedContent = definition.contentSchema.safeParse(content);
      if (!parsedSettings.success || !parsedContent.success) throw new Error('réglages ou contenu de test invalides');
      return room.startGame(definition, parsedSettings.data, parsedContent.data);
    },
  };
}

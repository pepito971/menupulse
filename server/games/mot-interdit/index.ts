// Le Mot Interdit (Taboo Flash) : chaque joueur, à son tour, fait deviner un maximum de mots en 30 s
// sans prononcer les 3 mots bannis. Le mot et les mots bannis ne s'affichent QUE sur son écran. Il
// appuie sur « Deviné ! » ou « Passer » ; les autres peuvent « Buzzer » s'il dit un mot interdit
// (la carte saute sans point).
import { z } from 'zod';
import type { GameDefinition, PlayerRef, RuleContext } from '../../../shared/games/types.ts';
import type { MotInterditView } from '../../../shared/games/views.ts';
import { localizedSchema, pseudoOf, rankingOf, scoreboard, shuffle, text } from '../helpers.ts';

const settingsSchema = z.object({
  turnsPerPlayer: z.number().int().min(1).max(3).default(1),
  roundSeconds: z.number().int().min(15).max(120).default(30),
});
const contentSchema = z.object({ cards: z.array(z.object({ word: localizedSchema, forbidden: z.array(localizedSchema).length(3) })).min(5).max(1000) });
const actionSchema = z.object({ t: z.enum(['guessed', 'pass', 'buzz']) });

type Settings = z.infer<typeof settingsSchema>;
type Content = z.infer<typeof contentSchema>;
type Action = z.infer<typeof actionSchema>;

interface State {
  players: PlayerRef[];
  cards: Content['cards'];
  deck: number[];
  card: number;
  cardShownAt: number;
  order: string[];
  round: number;
  phase: 'ready' | 'play' | 'reveal' | 'done';
  roundMs: number;
  deadline: number;
  guessed: number;
  lastEvent: { type: 'guessed' | 'pass' | 'buzz'; by: string; at: number } | null;
  scores: Record<string, number>;
}

export const READY_MS = 5000;
export const REVEAL_MS = 4000;
export const POINTS_PER_WORD = 100;
export const MIN_MS_BETWEEN_WORDS = 700; // un « Deviné ! » répété à toute vitesse ne rapporte rien

function nextCard(state: State, ctx: RuleContext): void {
  if (state.deck.length === 0) state.deck = shuffle([...state.cards.keys()], ctx.random);
  state.card = state.deck.pop()!;
  state.cardShownAt = ctx.now;
}

function startTurn(state: State, round: number, ctx: RuleContext): State {
  state.round = round;
  state.phase = 'ready';
  state.guessed = 0;
  state.lastEvent = null;
  state.deadline = ctx.now + READY_MS;
  ctx.setTimer('go', READY_MS);
  return state;
}

const L = (fr: string, en: string) => ({ fr, en });
const card = (word: [string, string], forbidden: [string, string][]) => ({ word: L(...word), forbidden: forbidden.map((f) => L(...f)) });

const CARDS: Content = {
  cards: [
    card(['Plage', 'Beach'], [['sable', 'sand'], ['mer', 'sea'], ['soleil', 'sun']]),
    card(['Pizza', 'Pizza'], [['Italie', 'Italy'], ['fromage', 'cheese'], ['four', 'oven']]),
    card(['Guitare', 'Guitar'], [['cordes', 'strings'], ['musique', 'music'], ['jouer', 'play']]),
    card(['Football', 'Football'], [['ballon', 'ball'], ['but', 'goal'], ['équipe', 'team']]),
    card(['Anniversaire', 'Birthday'], [['gâteau', 'cake'], ['bougies', 'candles'], ['fête', 'party']]),
    card(['Téléphone', 'Phone'], [['appeler', 'call'], ['portable', 'mobile'], ['écran', 'screen']]),
    card(['Vacances', 'Holidays'], [['voyage', 'trip'], ['été', 'summer'], ['repos', 'rest']]),
    card(['Chocolat', 'Chocolate'], [['cacao', 'cocoa'], ['sucré', 'sweet'], ['noir', 'dark']]),
    card(['Cinéma', 'Cinema'], [['film', 'film'], ['écran', 'screen'], ['salle', 'theatre']]),
    card(['Café', 'Coffee'], [['tasse', 'cup'], ['matin', 'morning'], ['expresso', 'espresso']]),
    card(['Chat', 'Cat'], [['animal', 'animal'], ['miauler', 'meow'], ['souris', 'mouse']]),
    card(['Avion', 'Plane'], [['voler', 'fly'], ['aéroport', 'airport'], ['pilote', 'pilot']]),
    card(['Neige', 'Snow'], [['froid', 'cold'], ['blanc', 'white'], ['ski', 'ski']]),
    card(['Dentiste', 'Dentist'], [['dents', 'teeth'], ['docteur', 'doctor'], ['cabinet', 'surgery']]),
    card(['Pompier', 'Firefighter'], [['feu', 'fire'], ['camion', 'truck'], ['sirène', 'siren']]),
  ],
};

export const motInterdit: GameDefinition<Settings, Content, State, Action, MotInterditView> = {
  id: 'mot-interdit',
  version: 1,
  name: { fr: 'Le Mot Interdit', en: 'Taboo Flash' },
  tagline: { fr: '30 secondes pour faire deviner, sans les mots bannis.', en: '30 seconds to get them guessing, without the banned words.' },
  roomKinds: ['table'],
  players: { min: 2, max: 10 },
  ranked: true,
  defaultEnabled: true,
  settingsSchema,
  contentSchema,
  defaultContent: CARDS,
  actionSchema,

  setup({ settings, content, players, rules }) {
    const order: string[] = [];
    for (let turn = 0; turn < settings.turnsPerPlayer; turn++) order.push(...shuffle(players.map((p) => p.id), rules.random));
    const state: State = {
      players: [...players],
      cards: content.cards,
      deck: [],
      card: 0,
      cardShownAt: 0,
      order,
      round: 0,
      phase: 'ready',
      roundMs: settings.roundSeconds * 1000,
      deadline: 0,
      guessed: 0,
      lastEvent: null,
      scores: {},
    };
    return startTurn(state, 0, rules);
  },

  onAction(state, player, action, ctx) {
    if (state.phase !== 'play') return state;
    const speaker = state.order[state.round]!;
    if (action.t === 'buzz') {
      if (player.id === speaker) return state;
    } else if (player.id !== speaker) {
      return state;
    }
    if (action.t === 'guessed') {
      if (ctx.now - state.cardShownAt < MIN_MS_BETWEEN_WORDS) return state;
      state.guessed += 1;
      state.scores[speaker] = (state.scores[speaker] ?? 0) + POINTS_PER_WORD;
    }
    state.lastEvent = { type: action.t, by: player.pseudo, at: ctx.now };
    nextCard(state, ctx);
    return state;
  },

  onTimer(state, timerId, ctx) {
    if (timerId === 'go' && state.phase === 'ready') {
      state.phase = 'play';
      nextCard(state, ctx);
      state.deadline = ctx.now + state.roundMs;
      ctx.setTimer('end', state.roundMs);
    } else if (timerId === 'end' && state.phase === 'play') {
      state.phase = 'reveal';
      state.deadline = ctx.now + REVEAL_MS;
      ctx.setTimer('next', REVEAL_MS);
    } else if (timerId === 'next' && state.phase === 'reveal') {
      if (state.round + 1 < state.order.length) return startTurn(state, state.round + 1, ctx);
      state.phase = 'done';
    }
    return state;
  },

  view(state, viewer) {
    const locale = viewer.role === 'player' ? viewer.player.locale : viewer.locale;
    const viewerId = viewer.role === 'player' ? viewer.player.id : null;
    const speaker = state.order[state.round]!;
    const isSpeaker = viewerId === speaker;
    const current = state.cards[state.card]!;
    const phase = state.phase === 'done' ? 'reveal' : state.phase;
    return {
      kind: 'mot-interdit',
      phase,
      round: state.round,
      total: state.order.length,
      speaker: pseudoOf(state.players, speaker),
      isSpeaker,
      card: isSpeaker && phase === 'play' ? { word: text(current.word, locale), forbidden: current.forbidden.map((f) => text(f, locale)) } : null,
      guessed: state.guessed,
      lastEvent: state.lastEvent,
      deadline: state.deadline,
      durationMs: phase === 'ready' ? READY_MS : phase === 'play' ? state.roundMs : REVEAL_MS,
      scoreboard: scoreboard(state.scores, state.players, viewerId),
    };
  },

  result(state) {
    return state.phase === 'done' ? { ranking: rankingOf(state.scores, state.players), vouchers: [] } : null;
  },
};

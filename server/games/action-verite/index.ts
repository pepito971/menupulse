// Action ou Vérité « Spécial Bar » : un joueur est désigné au hasard, choisit Action ou Vérité, une carte
// est piochée (pack de l'établissement en base, sinon celui de Menupulse). La table valide : la
// majorité des AUTRES joueurs doit appuyer sur « Validé ! » pour que le joueur marque les points.
// Contenu fourni : aucune action liée à l'alcool (public jeune, loi Évin) ni humiliante.
import { z } from 'zod';
import type { GameDefinition, PlayerRef, RuleContext } from '../../../shared/games/types.ts';
import type { ActionVeriteView } from '../../../shared/games/views.ts';
import { localizedSchema, pseudoOf, rankingOf, scoreboard, shuffle, text } from '../helpers.ts';

const settingsSchema = z.object({
  turnsPerPlayer: z.number().int().min(1).max(3).default(1),
  chooseSeconds: z.number().int().min(5).max(60).default(15),
  performSeconds: z.number().int().min(15).max(180).default(60),
});
const contentSchema = z.object({ actions: z.array(localizedSchema).min(3).max(500), truths: z.array(localizedSchema).min(3).max(500) });
const actionSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('choose'), choice: z.enum(['action', 'verite']) }),
  z.object({ t: z.literal('validate') }),
  z.object({ t: z.literal('skip') }),
]);

type Settings = z.infer<typeof settingsSchema>;
type Content = z.infer<typeof contentSchema>;
type Action = z.infer<typeof actionSchema>;
type Kind = 'action' | 'verite';

interface State {
  players: PlayerRef[];
  content: Content;
  decks: Record<Kind, number[]>; // pioche sans remise, remélangée quand elle est vide
  order: string[];
  round: number;
  phase: 'choose' | 'perform' | 'reveal' | 'done';
  choice: Kind | null;
  card: number | null;
  validations: string[];
  validated: boolean | null;
  chooseMs: number;
  performMs: number;
  deadline: number;
  scores: Record<string, number>;
}

export const POINTS = 100;
export const REVEAL_MS = 3000;

/** Nombre de « Validé ! » nécessaires : la moitié des autres joueurs, arrondie au-dessus (au moins 1). */
export function validationsNeeded(playerCount: number): number {
  return Math.max(1, Math.ceil((playerCount - 1) / 2));
}

function designated(state: State): string {
  return state.order[state.round]!;
}

function startRound(state: State, round: number, ctx: RuleContext): State {
  state.round = round;
  state.phase = 'choose';
  state.choice = null;
  state.card = null;
  state.validations = [];
  state.validated = null;
  state.deadline = ctx.now + state.chooseMs;
  ctx.setTimer('choose-end', state.chooseMs);
  return state;
}

function draw(state: State, kind: Kind, ctx: RuleContext): number {
  if (state.decks[kind].length === 0) {
    const size = kind === 'action' ? state.content.actions.length : state.content.truths.length;
    state.decks[kind] = shuffle([...Array(size).keys()], ctx.random);
  }
  return state.decks[kind].pop()!;
}

function perform(state: State, kind: Kind, ctx: RuleContext): State {
  ctx.clearTimer('choose-end');
  state.phase = 'perform';
  state.choice = kind;
  state.card = draw(state, kind, ctx);
  state.deadline = ctx.now + state.performMs;
  ctx.setTimer('perform-end', state.performMs);
  return state;
}

function finishRound(state: State, validated: boolean, ctx: RuleContext): State {
  ctx.clearTimer('perform-end');
  state.phase = 'reveal';
  state.validated = validated;
  if (validated) state.scores[designated(state)] = (state.scores[designated(state)] ?? 0) + POINTS;
  state.deadline = ctx.now + REVEAL_MS;
  ctx.setTimer('next', REVEAL_MS);
  return state;
}

const L = (fr: string, en: string) => ({ fr, en });

const CARDS: Content = {
  actions: [
    L('Imitez un animal choisi par la table pendant 10 secondes.', 'Imitate an animal chosen by the table for 10 seconds.'),
    L('Racontez une blague. Si personne ne rit, recommencez.', 'Tell a joke. If nobody laughs, try again.'),
    L('Faites un compliment sincère à chaque personne de la table.', 'Pay a sincere compliment to everyone at the table.'),
    L('Chantez le refrain d’une chanson choisie par votre voisin de droite.', 'Sing the chorus of a song chosen by the person on your right.'),
    L('Parlez avec un accent choisi par la table jusqu’à votre prochain tour.', 'Speak with an accent chosen by the table until your next turn.'),
    L('Faites votre meilleure imitation d’un serveur débordé.', 'Do your best impression of an overwhelmed waiter.'),
    L('Mimez un film : la table a 30 secondes pour deviner.', 'Mime a film: the table has 30 seconds to guess.'),
    L('Inventez un cocktail sans alcool et présentez-le comme à la télé.', 'Invent an alcohol-free cocktail and present it like on TV.'),
    L('Dessinez le portrait d’un joueur en 20 secondes.', 'Draw a portrait of a player in 20 seconds.'),
    L('Restez figé comme une statue pendant 15 secondes, même si on vous fait rire.', 'Freeze like a statue for 15 seconds, even if people make you laugh.'),
  ],
  truths: [
    L('Quel est votre pire souvenir de vacances ?', 'What is your worst holiday memory?'),
    L('Quelle chanson écoutez-vous en secret ?', 'Which song do you listen to in secret?'),
    L('Quel plat avez-vous fait semblant d’aimer ?', 'Which dish have you pretended to like?'),
    L('Quel est votre talent le plus inutile ?', 'What is your most useless talent?'),
    L('Quelle est la dernière chose qui vous a fait rire aux larmes ?', 'What was the last thing that made you cry with laughter?'),
    L('Avec quelle célébrité aimeriez-vous dîner ?', 'Which celebrity would you like to have dinner with?'),
    L('Quelle est votre plus grosse gaffe au travail ?', 'What is your biggest blunder at work?'),
    L('Quel surnom aviez-vous enfant ?', 'What nickname did you have as a child?'),
    L('Quel est le cadeau le plus bizarre que vous ayez reçu ?', 'What is the strangest gift you have ever received?'),
    L('Quelle application ouvrez-vous le plus souvent ?', 'Which app do you open most often?'),
  ],
};

export const actionVerite: GameDefinition<Settings, Content, State, Action, ActionVeriteView> = {
  id: 'action-verite',
  version: 1,
  name: { fr: 'Action ou Vérité', en: 'Truth or Dare' },
  tagline: { fr: 'Un joueur tiré au sort, la table décide s’il a mérité ses points.', en: 'A random player, the table decides if they earned the points.' },
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
      content,
      decks: { action: [], verite: [] },
      order,
      round: 0,
      phase: 'choose',
      choice: null,
      card: null,
      validations: [],
      validated: null,
      chooseMs: settings.chooseSeconds * 1000,
      performMs: settings.performSeconds * 1000,
      deadline: 0,
      scores: {},
    };
    return startRound(state, 0, rules);
  },

  onAction(state, player, action, ctx) {
    const isDesignated = player.id === designated(state);
    if (action.t === 'choose') {
      if (state.phase === 'choose' && isDesignated) return perform(state, action.choice, ctx);
    } else if (action.t === 'skip') {
      if (state.phase === 'perform' && isDesignated) return finishRound(state, false, ctx);
    } else if (state.phase === 'perform' && !isDesignated && !state.validations.includes(player.id)) {
      state.validations.push(player.id);
      if (state.validations.length >= validationsNeeded(state.players.length)) return finishRound(state, true, ctx);
    }
    return state;
  },

  onTimer(state, timerId, ctx) {
    if (timerId === 'choose-end' && state.phase === 'choose') return perform(state, ctx.random(2) === 0 ? 'action' : 'verite', ctx);
    if (timerId === 'perform-end' && state.phase === 'perform') return finishRound(state, false, ctx);
    if (timerId === 'next' && state.phase === 'reveal') {
      if (state.round + 1 < state.order.length) return startRound(state, state.round + 1, ctx);
      state.phase = 'done';
    }
    return state;
  },

  view(state, viewer) {
    const locale = viewer.role === 'player' ? viewer.player.locale : viewer.locale;
    const viewerId = viewer.role === 'player' ? viewer.player.id : null;
    const cards = state.choice === 'action' ? state.content.actions : state.content.truths;
    const durationMs = state.phase === 'choose' ? state.chooseMs : state.phase === 'perform' ? state.performMs : REVEAL_MS;
    return {
      kind: 'action-verite',
      phase: state.phase === 'done' ? 'reveal' : state.phase,
      round: state.round,
      total: state.order.length,
      designated: pseudoOf(state.players, designated(state)),
      isYou: viewerId === designated(state),
      choice: state.choice,
      card: state.card === null ? null : text(cards[state.card]!, locale),
      validations: state.validations.length,
      needed: validationsNeeded(state.players.length),
      youValidated: viewerId !== null && state.validations.includes(viewerId),
      validated: state.validated,
      deadline: state.deadline,
      durationMs,
      scoreboard: scoreboard(state.scores, state.players, viewerId),
    };
  },

  result(state) {
    return state.phase === 'done' ? { ranking: rankingOf(state.scores, state.players), vouchers: [] } : null;
  },
};

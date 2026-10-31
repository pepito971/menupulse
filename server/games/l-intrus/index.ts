// L'Intrus : 4 propositions, une seule n'a rien à faire là. Course au premier clic correct : le serveur
// traite les messages dans leur ordre d'arrivée, le premier bon clic gagne la manche et verrouille les
// écrans de la table sur la réponse. Un mauvais clic élimine le joueur pour la manche (sinon il
// suffirait de tout cliquer).
import { z } from 'zod';
import type { GameDefinition, PlayerRef, RuleContext } from '../../../shared/games/types.ts';
import type { IntrusView } from '../../../shared/games/views.ts';
import { localizedSchema, pseudoOf, rankingOf, scoreboard, shuffle, text } from '../helpers.ts';

const settingsSchema = z.object({
  roundCount: z.number().int().min(3).max(10).default(5),
  roundSeconds: z.number().int().min(5).max(60).default(20),
});
const contentSchema = z.object({
  grids: z
    .array(z.object({ items: z.array(localizedSchema).length(4), intruder: z.number().int().min(0).max(3), explanation: localizedSchema.optional() }))
    .min(3)
    .max(500),
});
const actionSchema = z.object({ t: z.literal('pick'), index: z.number().int().min(0).max(3) });

type Settings = z.infer<typeof settingsSchema>;
type Content = z.infer<typeof contentSchema>;
type Grid = Content['grids'][number];
type Action = z.infer<typeof actionSchema>;

interface State {
  players: PlayerRef[];
  grids: Grid[];
  index: number;
  phase: 'race' | 'reveal' | 'done';
  roundMs: number;
  deadline: number;
  wrongPicks: Record<string, number>;
  winner: string | null;
  scores: Record<string, number>;
}

export const WIN_POINTS = 100;
export const REVEAL_MS = 4000;

function startRound(state: State, index: number, ctx: RuleContext): State {
  state.index = index;
  state.phase = 'race';
  state.wrongPicks = {};
  state.winner = null;
  state.deadline = ctx.now + state.roundMs;
  ctx.setTimer('end', state.roundMs);
  return state;
}

function reveal(state: State, ctx: RuleContext): State {
  ctx.clearTimer('end');
  state.phase = 'reveal';
  state.deadline = ctx.now + REVEAL_MS;
  ctx.setTimer('next', REVEAL_MS);
  return state;
}

const L = (fr: string, en: string) => ({ fr, en });

const GRIDS: Content = {
  grids: [
    { items: [L('Mercure', 'Mercury'), L('Vénus', 'Venus'), L('La Lune', 'The Moon'), L('Mars', 'Mars')], intruder: 2, explanation: L('La Lune est un satellite, pas une planète.', 'The Moon is a satellite, not a planet.') },
    { items: [L('Tomate', 'Tomato'), L('Fraise', 'Strawberry'), L('Carotte', 'Carrot'), L('Cerise', 'Cherry')], intruder: 2, explanation: L('La carotte est une racine ; les autres sont des fruits (oui, la tomate aussi).', 'The carrot is a root; the others are fruits (yes, the tomato too).') },
    { items: [L('Paris', 'Paris'), L('Lyon', 'Lyon'), L('Genève', 'Geneva'), L('Marseille', 'Marseille')], intruder: 2, explanation: L('Genève est en Suisse.', 'Geneva is in Switzerland.') },
    { items: [L('Violon', 'Violin'), L('Violoncelle', 'Cello'), L('Trompette', 'Trumpet'), L('Contrebasse', 'Double bass')], intruder: 2, explanation: L('La trompette n’a pas de cordes.', 'The trumpet has no strings.') },
    { items: [L('Expresso', 'Espresso'), L('Cappuccino', 'Cappuccino'), L('Thé vert', 'Green tea'), L('Latte', 'Latte')], intruder: 2, explanation: L('Le thé vert n’est pas fait avec du café.', 'Green tea is not made with coffee.') },
    { items: [L('Mojito', 'Mojito'), L('Caïpirinha', 'Caipirinha'), L('Margarita', 'Margarita'), L('Ti’ punch', 'Ti’ punch')], intruder: 2, explanation: L('La margarita se fait avec de la tequila (agave) ; les trois autres avec un alcool de canne à sucre.', 'The margarita uses tequila (agave); the other three use a sugar cane spirit.') },
    { items: [L('Baleine', 'Whale'), L('Dauphin', 'Dolphin'), L('Requin', 'Shark'), L('Orque', 'Orca')], intruder: 2, explanation: L('Le requin est un poisson ; les autres sont des mammifères.', 'The shark is a fish; the others are mammals.') },
    { items: [L('Mozart', 'Mozart'), L('Beethoven', 'Beethoven'), L('Picasso', 'Picasso'), L('Chopin', 'Chopin')], intruder: 2, explanation: L('Picasso était peintre, les autres compositeurs.', 'Picasso was a painter, the others composers.') },
    { items: [L('Lager', 'Lager'), L('Stout', 'Stout'), L('Cidre', 'Cider'), L('IPA', 'IPA')], intruder: 2, explanation: L('Le cidre est fait de pommes : ce n’est pas une bière.', 'Cider is made from apples: it is not a beer.') },
    { items: [L('Football', 'Football'), L('Rugby', 'Rugby'), L('Tennis', 'Tennis'), L('Handball', 'Handball')], intruder: 2, explanation: L('Le tennis n’est pas un sport collectif.', 'Tennis is not a team sport.') },
  ],
};

export const lIntrus: GameDefinition<Settings, Content, State, Action, IntrusView> = {
  id: 'l-intrus',
  version: 1,
  name: { fr: 'L’Intrus', en: 'Odd One Out' },
  tagline: { fr: 'Trouvez l’intrus avant les autres. Une seule chance par grille.', en: 'Spot the odd one out first. One try per grid.' },
  roomKinds: ['table'],
  players: { min: 2, max: 10 },
  ranked: true,
  defaultEnabled: true,
  settingsSchema,
  contentSchema,
  defaultContent: GRIDS,
  actionSchema,

  setup({ settings, content, players, rules }) {
    const grids = shuffle(content.grids, rules.random)
      .slice(0, settings.roundCount)
      .map((grid) => {
        const order = shuffle([0, 1, 2, 3], rules.random);
        return { items: order.map((i) => grid.items[i]!), intruder: order.indexOf(grid.intruder), explanation: grid.explanation };
      });
    const state: State = { players: [...players], grids, index: 0, phase: 'race', roundMs: settings.roundSeconds * 1000, deadline: 0, wrongPicks: {}, winner: null, scores: {} };
    return startRound(state, 0, rules);
  },

  onAction(state, player, action, ctx) {
    if (state.phase !== 'race' || player.id in state.wrongPicks) return state;
    if (action.index === state.grids[state.index]!.intruder) {
      state.winner = player.id;
      state.scores[player.id] = (state.scores[player.id] ?? 0) + WIN_POINTS;
      return reveal(state, ctx);
    }
    state.wrongPicks[player.id] = action.index;
    if (state.players.every((p) => p.id in state.wrongPicks)) return reveal(state, ctx); // personne n'a trouvé
    return state;
  },

  onTimer(state, timerId, ctx) {
    if (timerId === 'end' && state.phase === 'race') return reveal(state, ctx);
    if (timerId === 'next' && state.phase === 'reveal') {
      if (state.index + 1 < state.grids.length) return startRound(state, state.index + 1, ctx);
      state.phase = 'done';
    }
    return state;
  },

  view(state, viewer) {
    const locale = viewer.role === 'player' ? viewer.player.locale : viewer.locale;
    const viewerId = viewer.role === 'player' ? viewer.player.id : null;
    const grid = state.grids[state.index]!;
    const revealed = state.phase !== 'race';
    const wrongPick = viewerId ? state.wrongPicks[viewerId] : undefined;
    return {
      kind: 'l-intrus',
      phase: revealed ? 'reveal' : 'race',
      index: state.index,
      total: state.grids.length,
      items: grid.items.map((item) => text(item, locale)),
      deadline: state.deadline,
      durationMs: revealed ? REVEAL_MS : state.roundMs,
      lockedOut: wrongPick !== undefined,
      wrongPick: wrongPick ?? null,
      winner: state.winner ? pseudoOf(state.players, state.winner) : null,
      intruder: revealed ? grid.intruder : null,
      explanation: revealed && grid.explanation ? text(grid.explanation, locale) : null,
      scoreboard: scoreboard(state.scores, state.players, viewerId),
    };
  },

  result(state) {
    return state.phase === 'done' ? { ranking: rankingOf(state.scores, state.players), vouchers: [] } : null;
  },
};

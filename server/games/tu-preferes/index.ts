// Tu Préfères ? : dilemmes à deux choix. Les votes restent SECRETS jusqu'à la fin du temps imparti
// (seul leur nombre est visible ; on peut changer d'avis jusque-là), puis révélation simultanée en
// pourcentages. Pas de score : c'est un jeu de débat.
import { z } from 'zod';
import type { GameDefinition, PlayerRef, RuleContext } from '../../../shared/games/types.ts';
import type { WouldYouRatherView } from '../../../shared/games/views.ts';
import { localizedSchema, shuffle, text } from '../helpers.ts';

const settingsSchema = z.object({
  dilemmaCount: z.number().int().min(3).max(10).default(5),
  voteSeconds: z.number().int().min(5).max(60).default(20),
});
const contentSchema = z.object({ dilemmas: z.array(z.object({ a: localizedSchema, b: localizedSchema })).min(3).max(500) });
const actionSchema = z.object({ t: z.literal('vote'), choice: z.enum(['a', 'b']) });

type Settings = z.infer<typeof settingsSchema>;
type Content = z.infer<typeof contentSchema>;
type Action = z.infer<typeof actionSchema>;

interface State {
  players: PlayerRef[];
  dilemmas: Content['dilemmas'];
  index: number;
  phase: 'vote' | 'reveal' | 'done';
  voteMs: number;
  deadline: number;
  votes: Record<string, 'a' | 'b'>;
}

export const REVEAL_MS = 6000;

export function votePercentages(votes: readonly ('a' | 'b')[]): { a: number; b: number; aCount: number; bCount: number } {
  const aCount = votes.filter((v) => v === 'a').length;
  const bCount = votes.length - aCount;
  if (votes.length === 0) return { a: 0, b: 0, aCount, bCount };
  const a = Math.round((aCount / votes.length) * 100);
  return { a, b: 100 - a, aCount, bCount };
}

function startVote(state: State, index: number, ctx: RuleContext): State {
  state.index = index;
  state.phase = 'vote';
  state.votes = {};
  state.deadline = ctx.now + state.voteMs;
  ctx.setTimer('end', state.voteMs);
  return state;
}

const DILEMMAS: Content = {
  dilemmas: [
    { a: { fr: 'Avoir des doigts en spaghetti', en: 'Have spaghetti fingers' }, b: { fr: 'Avoir des cheveux en guimauve', en: 'Have marshmallow hair' } },
    { a: { fr: 'Ne plus jamais manger de fromage', en: 'Never eat cheese again' }, b: { fr: 'Ne plus jamais manger de chocolat', en: 'Never eat chocolate again' } },
    { a: { fr: 'Ne parler qu’en chantant', en: 'Only speak by singing' }, b: { fr: 'Ne pouvoir que chuchoter', en: 'Only be able to whisper' } },
    { a: { fr: 'Avoir un rire de dauphin', en: 'Have a dolphin laugh' }, b: { fr: 'Éternuer comme une trompette', en: 'Sneeze like a trumpet' } },
    { a: { fr: 'Voyager dans le passé', en: 'Travel to the past' }, b: { fr: 'Voyager dans le futur', en: 'Travel to the future' } },
    { a: { fr: 'Toujours avoir 10 minutes de retard', en: 'Always be 10 minutes late' }, b: { fr: 'Toujours avoir une heure d’avance', en: 'Always be an hour early' } },
    { a: { fr: 'Une pizza offerte chaque jour à vie', en: 'A free pizza every day for life' }, b: { fr: 'Un voyage offert chaque année', en: 'A free trip every year' } },
    { a: { fr: 'Parler aux animaux', en: 'Talk to animals' }, b: { fr: 'Parler toutes les langues', en: 'Speak every language' } },
    { a: { fr: 'Que vos pensées s’affichent sur votre front', en: 'Have your thoughts shown on your forehead' }, b: { fr: 'Être doublé en direct par une voix de dessin animé', en: 'Be dubbed live by a cartoon voice' } },
    { a: { fr: 'Ne porter que des chaussettes dépareillées', en: 'Only wear odd socks' }, b: { fr: 'Ne porter que des chemises à fleurs', en: 'Only wear flowery shirts' } },
    { a: { fr: 'Avoir une musique de générique à chaque entrée dans une pièce', en: 'Get theme music whenever you enter a room' }, b: { fr: 'Avoir des rires enregistrés après chacune de vos phrases', en: 'Get a laugh track after everything you say' } },
  ],
};

export const tuPreferes: GameDefinition<Settings, Content, State, Action, WouldYouRatherView> = {
  id: 'tu-preferes',
  version: 1,
  name: { fr: 'Tu préfères ?', en: 'Would You Rather?' },
  tagline: { fr: 'Votez en secret, découvrez qui pense comme vous.', en: 'Vote in secret, see who thinks like you.' },
  roomKinds: ['table'],
  players: { min: 2, max: 10 },
  ranked: false,
  defaultEnabled: true,
  settingsSchema,
  contentSchema,
  defaultContent: DILEMMAS,
  actionSchema,

  setup({ settings, content, players, rules }) {
    const state: State = {
      players: [...players],
      dilemmas: shuffle(content.dilemmas, rules.random).slice(0, settings.dilemmaCount),
      index: 0,
      phase: 'vote',
      voteMs: settings.voteSeconds * 1000,
      deadline: 0,
      votes: {},
    };
    return startVote(state, 0, rules);
  },

  onAction(state, player, action) {
    if (state.phase === 'vote') state.votes[player.id] = action.choice; // on peut changer d'avis jusqu'à la fin
    return state;
  },

  onTimer(state, timerId, ctx) {
    if (timerId === 'end' && state.phase === 'vote') {
      state.phase = 'reveal';
      state.deadline = ctx.now + REVEAL_MS;
      ctx.setTimer('next', REVEAL_MS);
    } else if (timerId === 'next' && state.phase === 'reveal') {
      if (state.index + 1 < state.dilemmas.length) return startVote(state, state.index + 1, ctx);
      state.phase = 'done';
    }
    return state;
  },

  view(state, viewer) {
    const locale = viewer.role === 'player' ? viewer.player.locale : viewer.locale;
    const viewerId = viewer.role === 'player' ? viewer.player.id : null;
    const dilemma = state.dilemmas[state.index]!;
    const revealed = state.phase !== 'vote';
    return {
      kind: 'tu-preferes',
      phase: revealed ? 'reveal' : 'vote',
      index: state.index,
      total: state.dilemmas.length,
      a: text(dilemma.a, locale),
      b: text(dilemma.b, locale),
      deadline: state.deadline,
      durationMs: revealed ? REVEAL_MS : state.voteMs,
      yourVote: viewerId ? (state.votes[viewerId] ?? null) : null,
      voted: Object.keys(state.votes).length,
      playerCount: state.players.length,
      results: revealed ? votePercentages(Object.values(state.votes)) : null,
    };
  },

  result(state) {
    return state.phase === 'done' ? { ranking: [], vouchers: [] } : null;
  },
};

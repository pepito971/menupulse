// Quiz du Comptoir : questions à choix multiple, chronométrées. Le serveur compte les points à la
// RÉCEPTION de la réponse : 100 points + un bonus de vitesse proportionnel au temps restant (100 au
// maximum). La bonne réponse ne quitte le serveur qu'à la révélation.
import { z } from 'zod';
import type { GameDefinition, PlayerRef, RuleContext } from '../../../shared/games/types.ts';
import type { QuizView } from '../../../shared/games/views.ts';
import { localizedSchema, rankingOf, scoreboard, shuffle, text } from '../helpers.ts';
import { QUIZ_CONTENT } from './content.ts';

const settingsSchema = z.object({
  questionCount: z.number().int().min(3).max(10).default(5),
  questionSeconds: z.number().int().min(5).max(60).default(15),
});
const contentSchema = z.object({
  questions: z
    .array(z.object({ prompt: localizedSchema, choices: z.array(localizedSchema).length(4), correct: z.number().int().min(0).max(3) }))
    .min(3)
    .max(500),
});
const actionSchema = z.object({ t: z.literal('answer'), choice: z.number().int().min(0).max(3) });

type Settings = z.infer<typeof settingsSchema>;
type Content = z.infer<typeof contentSchema>;
type Question = Content['questions'][number];
type Action = z.infer<typeof actionSchema>;

interface State {
  players: PlayerRef[];
  questions: Question[];
  index: number;
  phase: 'question' | 'reveal' | 'done';
  questionMs: number;
  deadline: number;
  answers: Record<string, { choice: number; points: number }>;
  scores: Record<string, number>;
}

export const BASE_POINTS = 100;
export const MAX_SPEED_BONUS = 100;
export const REVEAL_MS = 4000;

export function quizPoints(correct: boolean, remainingMs: number, questionMs: number): number {
  if (!correct) return 0;
  const ratio = Math.min(1, Math.max(0, remainingMs / questionMs));
  return BASE_POINTS + Math.round(MAX_SPEED_BONUS * ratio);
}

function startQuestion(state: State, index: number, ctx: RuleContext): State {
  state.index = index;
  state.phase = 'question';
  state.answers = {};
  state.deadline = ctx.now + state.questionMs;
  ctx.setTimer('end', state.questionMs);
  return state;
}

function reveal(state: State, ctx: RuleContext): State {
  ctx.clearTimer('end');
  state.phase = 'reveal';
  for (const [playerId, answer] of Object.entries(state.answers)) {
    state.scores[playerId] = (state.scores[playerId] ?? 0) + answer.points;
  }
  state.deadline = ctx.now + REVEAL_MS;
  ctx.setTimer('next', REVEAL_MS);
  return state;
}

export const quizComptoir: GameDefinition<Settings, Content, State, Action, QuizView> = {
  id: 'quiz-comptoir',
  version: 1,
  name: { fr: 'Quiz du Comptoir', en: 'Bar Quiz' },
  tagline: { fr: 'Questions de culture bar : le plus rapide marque le plus.', en: 'Bar trivia: the fastest scores the most.' },
  roomKinds: ['table'],
  players: { min: 1, max: 10 },
  ranked: true,
  defaultEnabled: true,
  settingsSchema,
  contentSchema,
  defaultContent: QUIZ_CONTENT,
  actionSchema,

  setup({ settings, content, players, rules }) {
    const picked = shuffle(content.questions, rules.random).slice(0, settings.questionCount);
    const questions = picked.map((question) => {
      const order = shuffle([0, 1, 2, 3], rules.random);
      return { prompt: question.prompt, choices: order.map((i) => question.choices[i]!), correct: order.indexOf(question.correct) };
    });
    const state: State = {
      players: [...players],
      questions,
      index: 0,
      phase: 'question',
      questionMs: settings.questionSeconds * 1000,
      deadline: 0,
      answers: {},
      scores: {},
    };
    return startQuestion(state, 0, rules);
  },

  onAction(state, player, action, ctx) {
    if (state.phase !== 'question' || state.answers[player.id]) return state; // une seule réponse, pas de retard
    const question = state.questions[state.index]!;
    state.answers[player.id] = { choice: action.choice, points: quizPoints(action.choice === question.correct, state.deadline - ctx.now, state.questionMs) };
    if (state.players.every((p) => state.answers[p.id])) return reveal(state, ctx); // tout le monde a répondu
    return state;
  },

  onTimer(state, timerId, ctx) {
    if (timerId === 'end' && state.phase === 'question') return reveal(state, ctx);
    if (timerId === 'next' && state.phase === 'reveal') {
      if (state.index + 1 < state.questions.length) return startQuestion(state, state.index + 1, ctx);
      state.phase = 'done';
    }
    return state;
  },

  view(state, viewer) {
    const locale = viewer.role === 'player' ? viewer.player.locale : viewer.locale;
    const viewerId = viewer.role === 'player' ? viewer.player.id : null;
    const question = state.questions[state.index]!;
    const answer = viewerId ? state.answers[viewerId] : undefined;
    const revealed = state.phase !== 'question';
    return {
      kind: 'quiz-comptoir',
      phase: revealed ? 'reveal' : 'question',
      index: state.index,
      total: state.questions.length,
      prompt: text(question.prompt, locale),
      choices: question.choices.map((choice) => text(choice, locale)),
      deadline: state.deadline,
      durationMs: revealed ? REVEAL_MS : state.questionMs,
      yourChoice: answer?.choice ?? null,
      answered: Object.keys(state.answers).length,
      playerCount: state.players.length,
      correct: revealed ? question.correct : null,
      yourPoints: revealed ? (answer?.points ?? 0) : null,
      scoreboard: scoreboard(state.scores, state.players, viewerId),
    };
  },

  result(state) {
    return state.phase === 'done' ? { ranking: rankingOf(state.scores, state.players), vouchers: [] } : null;
  },
};

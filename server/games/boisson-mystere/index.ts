// La Boisson Mystère (levier commercial) : énigme en 3 indices sur un produit du catalogue Tapsy. La
// table a 3 essais COLLECTIFS (n'importe quel joueur propose, chaque mauvaise réponse coûte un essai et
// dévoile l'indice suivant). Gagné : un bon de réduction éphémère sur ce produit, pour la table.
// Par défaut, seules les boissons sans alcool sont proposées (réduction gagnée à un jeu, public jeune :
// à faire valider par un juriste avant d'ouvrir aux boissons alcoolisées — réglage allowAlcoholicDrinks).
import { z } from 'zod';
import type { GameDefinition, PlayerRef, RuleContext, VoucherEffect } from '../../../shared/games/types.ts';
import type { BoissonMystereView } from '../../../shared/games/views.ts';
import { localizedSchema, shuffle, text, voucherCode } from '../helpers.ts';
import { rewardLabel } from './hints.ts';

export const settingsSchema = z.object({
  discountPercent: z.number().int().min(5).max(50).default(20),
  voucherMinutes: z.number().int().min(10).max(240).default(30),
  hintSeconds: z.number().int().min(10).max(60).default(20),
  allowAlcoholicDrinks: z.boolean().default(false), // lu par le chargement du contenu (server/games/content-loaders.ts)
});
const contentSchema = z.object({
  products: z
    .array(z.object({ id: z.string().min(1).max(64), name: localizedSchema, hints: z.array(localizedSchema).length(3) }))
    .min(4)
    .max(300),
});
const actionSchema = z.object({ t: z.literal('guess'), productId: z.string().min(1).max(64) });

type Settings = z.infer<typeof settingsSchema>;
type Content = z.infer<typeof contentSchema>;
type Product = Content['products'][number];
type Action = z.infer<typeof actionSchema>;

interface State {
  players: PlayerRef[];
  target: Product;
  options: Product[];
  hintsShown: number;
  attemptsLeft: number;
  wrong: string[];
  lastGuess: { by: string; productId: string; correct: boolean } | null;
  phase: 'play' | 'won' | 'lost' | 'done';
  hintMs: number;
  nextHintAt: number | null;
  settings: Settings;
  voucher: VoucherEffect | null;
}

export const ATTEMPTS = 3;
export const MAX_OPTIONS = 12;
export const END_MS = 10_000;

function revealNextHint(state: State, ctx: RuleContext): void {
  state.hintsShown = Math.min(3, state.hintsShown + 1);
  if (state.hintsShown < 3) {
    state.nextHintAt = ctx.now + state.hintMs;
    ctx.setTimer('hint', state.hintMs);
  } else {
    // dernier indice : encore un peu de temps, puis la réponse
    state.nextHintAt = null;
    ctx.clearTimer('hint');
    ctx.setTimer('timeout', state.hintMs * 2);
  }
}

function end(state: State, phase: 'won' | 'lost', ctx: RuleContext): State {
  ctx.clearTimer('hint');
  ctx.clearTimer('timeout');
  state.phase = phase;
  state.nextHintAt = null;
  ctx.setTimer('end', END_MS);
  return state;
}

export const boissonMystere: GameDefinition<Settings, Content, State, Action, BoissonMystereView> = {
  id: 'boisson-mystere',
  version: 1,
  name: { fr: 'La Boisson Mystère', en: 'Mystery Drink' },
  tagline: { fr: 'Trois indices, trois essais : trouvez la boisson et gagnez une réduction.', en: 'Three clues, three tries: guess the drink and win a discount.' },
  roomKinds: ['table'],
  players: { min: 1, max: 10 },
  ranked: false,
  defaultEnabled: false, // levier commercial : l'établissement l'active et règle la réduction
  settingsSchema,
  contentSchema,
  actionSchema,

  setup({ settings, content, players, rules }) {
    const target = content.products[rules.random(content.products.length)]!;
    const others = shuffle(
      content.products.filter((p) => p.id !== target.id),
      rules.random,
    ).slice(0, MAX_OPTIONS - 1);
    const state: State = {
      players: [...players],
      target,
      options: shuffle([target, ...others], rules.random),
      hintsShown: 0,
      attemptsLeft: ATTEMPTS,
      wrong: [],
      lastGuess: null,
      phase: 'play',
      hintMs: settings.hintSeconds * 1000,
      nextHintAt: null,
      settings,
      voucher: null,
    };
    revealNextHint(state, rules);
    return state;
  },

  onAction(state, player, action, ctx) {
    if (state.phase !== 'play' || state.wrong.includes(action.productId) || !state.options.some((p) => p.id === action.productId)) return state;
    const correct = action.productId === state.target.id;
    state.lastGuess = { by: player.pseudo, productId: action.productId, correct };
    if (correct) {
      state.voucher = {
        kind: 'voucher',
        code: voucherCode(ctx.random),
        reward: rewardLabel(state.target.name, state.settings.discountPercent),
        expiresAt: ctx.now + state.settings.voucherMinutes * 60_000,
        productId: state.target.id,
      };
      ctx.emit(state.voucher);
      return end(state, 'won', ctx);
    }
    state.wrong.push(action.productId);
    state.attemptsLeft -= 1;
    if (state.attemptsLeft === 0) return end(state, 'lost', ctx);
    if (state.hintsShown < 3) revealNextHint(state, ctx);
    return state;
  },

  onTimer(state, timerId, ctx) {
    if (timerId === 'hint' && state.phase === 'play') revealNextHint(state, ctx);
    else if (timerId === 'timeout' && state.phase === 'play') return end(state, 'lost', ctx);
    else if (timerId === 'end' && (state.phase === 'won' || state.phase === 'lost')) state.phase = 'done';
    return state;
  },

  view(state, viewer) {
    const locale = viewer.role === 'player' ? viewer.player.locale : viewer.locale;
    const phase = state.phase === 'done' ? (state.voucher ? 'won' : 'lost') : state.phase;
    const guessed = state.lastGuess ? state.options.find((p) => p.id === state.lastGuess!.productId) : undefined;
    return {
      kind: 'boisson-mystere',
      phase,
      hints: state.target.hints.slice(0, state.hintsShown).map((hint) => text(hint, locale)),
      totalHints: 3,
      options: state.options.map((p) => ({ id: p.id, name: text(p.name, locale), wrong: state.wrong.includes(p.id) })),
      attemptsLeft: state.attemptsLeft,
      lastGuess: state.lastGuess && guessed ? { by: state.lastGuess.by, name: text(guessed.name, locale), correct: state.lastGuess.correct } : null,
      answer: phase === 'play' ? null : text(state.target.name, locale),
      voucher: state.voucher ? { code: state.voucher.code, reward: text(state.voucher.reward, locale), expiresAt: state.voucher.expiresAt } : null,
      nextHintAt: state.nextHintAt,
    };
  },

  result(state) {
    return state.phase === 'done' ? { ranking: [], vouchers: state.voucher ? [state.voucher] : [] } : null;
  },
};

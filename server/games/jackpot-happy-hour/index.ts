// Le Jack-Pot de l'Happy Hour (levier commercial) : machine à sous virtuelle, un essai par joueur, jouable
// SEULEMENT pendant une Happy Hour de l'établissement (calculée depuis ses règles, shared/happy-hour.ts).
// Le résultat est tiré par le serveur (taux de gain réglable) ; les rouleaux ne font qu'afficher ce
// résultat. Garde-fous contre les essais répétés (rejoindre sous un autre pseudo) : une partie par table
// et par jour, et un plafond de gains par jour pour tout l'établissement (contenu `remainingWins`,
// calculé par le moteur depuis la base).
// Gains par défaut sans alcool (public jeune, loi Évin) : à faire valider par un juriste avant d'en
// proposer d'autres. Participation gratuite, sans achat : condition pour ne pas tomber sous
// l'interdiction des loteries.
import { z } from 'zod';
import type { GameDefinition, PlayerRef, RuleContext, VoucherEffect } from '../../../shared/games/types.ts';
import { JACKPOT_SYMBOLS, type JackpotSymbol, type JackpotView } from '../../../shared/games/views.ts';
import { localizedSchema, pseudoOf, text, voucherCode } from '../helpers.ts';

const settingsSchema = z.object({
  winRate: z.number().min(0).max(1).default(0.1),
  maxWinsPerDay: z.number().int().min(0).max(500).default(10), // lu par le chargement du contenu
  voucherMinutes: z.number().int().min(10).max(240).default(30),
  playSeconds: z.number().int().min(20).max(300).default(60),
  prizes: z
    .array(localizedSchema)
    .min(1)
    .max(10)
    .default([
      { fr: 'Un soft offert', en: 'A free soft drink' },
      { fr: '-10 % sur votre prochaine commande', en: '10% off your next order' },
    ]),
});
const contentSchema = z.object({ remainingWins: z.number().int().min(0) });
const actionSchema = z.object({ t: z.literal('spin') });

type Settings = z.infer<typeof settingsSchema>;
type Content = z.infer<typeof contentSchema>;
type Action = z.infer<typeof actionSchema>;
type Reels = [JackpotSymbol, JackpotSymbol, JackpotSymbol];

interface Spin {
  reels: Reels;
  voucher: VoucherEffect | null;
}

interface State {
  players: PlayerRef[];
  settings: Settings;
  remainingWins: number;
  spins: Record<string, Spin>;
  deadline: number;
  playMs: number;
  phase: 'spin' | 'done';
}

export const RESOLUTION = 1_000_000;
export const END_MS = 6000; // laisse les rouleaux s'arrêter sur le dernier essai

/** Tirage : gagné si le quota le permet et que le hasard tombe sous le taux de gain. */
export function drawSpin(winRate: number, remainingWins: number, random: (maxExclusive: number) => number): { win: boolean; reels: Reels } {
  const n = JACKPOT_SYMBOLS.length;
  const win = remainingWins > 0 && random(RESOLUTION) < Math.round(winRate * RESOLUTION);
  if (win) {
    const symbol = JACKPOT_SYMBOLS[random(n)]!;
    return { win, reels: [symbol, symbol, symbol] };
  }
  const indexes = [random(n), random(n), random(n)] as [number, number, number];
  if (indexes[0] === indexes[1] && indexes[1] === indexes[2]) indexes[2] = (indexes[2] + 1) % n; // un perdant n'affiche jamais trois symboles identiques
  return { win, reels: indexes.map((i) => JACKPOT_SYMBOLS[i]!) as Reels };
}

function finishSoon(state: State, ctx: RuleContext): void {
  state.deadline = Math.min(state.deadline, ctx.now + END_MS);
  ctx.setTimer('end', state.deadline - ctx.now);
}

export const jackpotHappyHour: GameDefinition<Settings, Content, State, Action, JackpotView> = {
  id: 'jackpot-happy-hour',
  version: 1,
  name: { fr: 'Le Jack-Pot de l’Happy Hour', en: 'Happy Hour Jackpot' },
  tagline: { fr: 'Un essai chacun pendant l’Happy Hour. Gagné ? Montrez votre code au bar.', en: 'One spin each during Happy Hour. Won? Show your code at the bar.' },
  roomKinds: ['table'],
  players: { min: 1, max: 10 },
  ranked: false,
  defaultEnabled: false, // levier commercial : l'établissement l'active et règle gains et taux
  oncePerTablePerDay: true,
  settingsSchema,
  contentSchema,
  actionSchema,
  isAvailable: ({ happyHourActive }) => happyHourActive,

  setup({ settings, content, players, rules }) {
    const playMs = settings.playSeconds * 1000;
    rules.setTimer('end', playMs);
    return { players: [...players], settings, remainingWins: content.remainingWins, spins: {}, deadline: rules.now + playMs, playMs, phase: 'spin' };
  },

  onAction(state, player, _action, ctx) {
    if (state.phase !== 'spin' || state.spins[player.id]) return state; // un seul essai par joueur
    const { win, reels } = drawSpin(state.settings.winRate, state.remainingWins, ctx.random);
    let voucher: VoucherEffect | null = null;
    if (win) {
      state.remainingWins -= 1;
      voucher = {
        kind: 'voucher',
        code: voucherCode(ctx.random),
        reward: state.settings.prizes[ctx.random(state.settings.prizes.length)]!,
        expiresAt: ctx.now + state.settings.voucherMinutes * 60_000,
        playerId: player.id,
      };
      ctx.emit(voucher);
    }
    state.spins[player.id] = { reels, voucher };
    if (state.players.every((p) => state.spins[p.id])) finishSoon(state, ctx);
    return state;
  },

  onTimer(state, timerId) {
    if (timerId === 'end') state.phase = 'done';
    return state;
  },

  view(state, viewer) {
    const locale = viewer.role === 'player' ? viewer.player.locale : viewer.locale;
    const viewerId = viewer.role === 'player' ? viewer.player.id : null;
    const spin = viewerId ? state.spins[viewerId] : undefined;
    return {
      kind: 'jackpot-happy-hour',
      yourSpin: spin
        ? {
            reels: spin.reels,
            win: spin.voucher !== null,
            prize: spin.voucher ? text(spin.voucher.reward, locale) : null,
            voucher: spin.voucher ? { code: spin.voucher.code, reward: text(spin.voucher.reward, locale), expiresAt: spin.voucher.expiresAt } : null,
          }
        : null,
      spun: Object.keys(state.spins).length,
      playerCount: state.players.length,
      winners: Object.entries(state.spins)
        .filter(([, s]) => s.voucher)
        .map(([id]) => pseudoOf(state.players, id)),
      deadline: state.deadline,
      durationMs: state.playMs,
    };
  },

  result(state) {
    if (state.phase !== 'done') return null;
    return { ranking: [], vouchers: Object.values(state.spins).flatMap((s) => (s.voucher ? [s.voucher] : [])) };
  },
};

// Outils communs aux règles des jeux (purs : le hasard vient toujours du RuleContext).
import { z } from 'zod';
import type { PlayerRef } from '../../shared/games/types.ts';
import type { Scoreline } from '../../shared/games/views.ts';
import { localized, type Locale, type Localized } from '../../shared/locales.ts';

/** Texte localisé d'un contenu de jeu : { fr, en }, au moins une langue. */
export const localizedSchema = z
  .object({ fr: z.string().trim().min(1).max(300).optional(), en: z.string().trim().min(1).max(300).optional() })
  .refine((value) => Boolean(value.fr || value.en), { message: 'Au moins une langue.' });

export function text(value: Localized, locale: Locale): string {
  return localized(value, locale, 'fr')?.text ?? localized(value, locale, 'en')?.text ?? '';
}

/** Mélange de Fisher-Yates (copie). */
export function shuffle<T>(items: readonly T[], random: (maxExclusive: number) => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

/** Classement final : du meilleur score au moins bon, ordre d'arrivée à égalité. */
export function rankingOf(scores: Record<string, number>, players: readonly PlayerRef[]): { playerId: string; score: number }[] {
  return players.map((p) => ({ playerId: p.id, score: scores[p.id] ?? 0 })).sort((a, b) => b.score - a.score);
}

export function scoreboard(scores: Record<string, number>, players: readonly PlayerRef[], viewerId: string | null): Scoreline[] {
  const pseudos = new Map(players.map((p) => [p.id, p.pseudo]));
  return rankingOf(scores, players).map((line) => ({ pseudo: pseudos.get(line.playerId) ?? '?', score: line.score, you: line.playerId === viewerId }));
}

export function pseudoOf(players: readonly PlayerRef[], playerId: string | null): string {
  return players.find((p) => p.id === playerId)?.pseudo ?? '';
}

// Sans 0/O ni 1/I : un code se lit à voix haute au comptoir sans confusion
export const VOUCHER_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function voucherCode(random: (maxExclusive: number) => number): string {
  let code = '';
  for (let i = 0; i < 6; i++) code += VOUCHER_ALPHABET[random(VOUCHER_ALPHABET.length)];
  return code;
}

// Éléments d'interface communs aux jeux : classement, bon à présenter au comptoir, en-tête de manche.
import type { RoomVoucher } from '../../../../shared/games/protocol.ts';
import type { Scoreline } from '../../../../shared/games/views.ts';
import type { Locale } from '../../../../shared/locales.ts';
import type { Translator } from '../../core/page-data.ts';
import { toLocalTime } from './clock.ts';
import { h } from './dom.ts';

export function scoreboard(lines: readonly Scoreline[], t: Translator): HTMLElement | null {
  if (lines.length === 0) return null;
  return h(
    'section',
    { class: 'scoreboard', 'aria-label': t('game.scoreboard') },
    h('h3', { class: 'game-label' }, t('game.scoreboard')),
    h(
      'ol',
      {},
      lines.map((line) =>
        h('li', { class: line.you ? 'is-you' : null }, h('span', { class: 'scoreboard-name' }, line.pseudo, line.you ? ` (${t('game.you')})` : ''), h('span', { class: 'scoreboard-score' }, t('game.points', { points: line.score }))),
      ),
    ),
  );
}

export function voucherCard(voucher: RoomVoucher, t: Translator, locale: Locale): HTMLElement {
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(toLocalTime(voucher.expiresAt));
  return h(
    'section',
    { class: 'voucher', 'aria-label': t('game.voucherTitle') },
    h('p', { class: 'game-label' }, t('game.voucherTitle')),
    h('p', { class: 'voucher-reward' }, voucher.reward),
    h('p', { class: 'voucher-code' }, voucher.code),
    h('p', { class: 'game-sub' }, t('game.voucherShow', { time })),
  );
}

/** « Question 2/5 » + titre du jeu courant. */
export function stepHeader(text: string): HTMLElement {
  return h('p', { class: 'game-step' }, text);
}

/** Liste de nœuds sans les éléments absents (null/false), pour BaseGame.render. */
export function nodes(...items: (Node | null | false | undefined)[]): Node[] {
  return items.filter((item): item is Node => Boolean(item));
}

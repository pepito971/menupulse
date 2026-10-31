// Le Jack-Pot de l'Happy Hour : le résultat est déjà décidé par le serveur quand les rouleaux tournent ;
// l'animation ne fait que le mettre en scène, puis affiche le gain et le bon.
import type { JackpotSymbol, JackpotView } from '../../../../shared/games/views.ts';
import { timerBar } from '../engine/clock.ts';
import { button, h } from '../engine/dom.ts';
import { BaseGame } from '../engine/types.ts';
import { nodes, voucherCard } from '../engine/widgets.ts';

const SYMBOLS: Record<JackpotSymbol, string> = { cerise: '🍒', citron: '🍋', etoile: '⭐', cloche: '🔔', sept: '7️⃣', diamant: '💎' };
const SPIN_MS = 1600;

export default class JackpotGame extends BaseGame<JackpotView> {
  #spinning = false;
  #revealed = false;
  #latest: JackpotView | null = null;
  #spinTimer: ReturnType<typeof setTimeout> | null = null;

  override update(view: JackpotView): void {
    this.#latest = view;
    if (view.yourSpin && !this.#revealed && !this.#spinning) {
      this.#spinning = true;
      this.#spinTimer = setTimeout(() => {
        this.#spinning = false;
        this.#revealed = true;
        if (this.#latest) super.update(this.#latest);
      }, SPIN_MS);
    }
    super.update(view);
  }

  override unmount(): void {
    if (this.#spinTimer) clearTimeout(this.#spinTimer);
    super.unmount();
  }

  protected render(view: JackpotView): Node[] {
    const { t, send, locale } = this.context;
    const spin = this.#revealed ? view.yourSpin : null;
    const faces = spin ? spin.reels.map((symbol) => SYMBOLS[symbol]) : ['❔', '❔', '❔'];
    const reels = h('div', { class: `reels${this.#spinning ? ' is-spinning' : ''}`, 'aria-hidden': 'true' }, faces.map((face) => h('div', { class: 'reel' }, h('span', {}, this.#spinning ? '🎰' : face))));

    const card = h(
      'section',
      { class: 'game-card' },
      reels,
      view.yourSpin
        ? null
        : button(t('game.spin'), () => send({ t: 'spin' }), { class: 'ui-btn ui-btn--primary game-wide' }),
      spin ? h('p', { class: `game-feedback ${spin.win ? 'is-good' : 'is-bad'}`, role: 'status' }, spin.win ? t('game.jackpotWin', { prize: spin.prize ?? '' }) : t('game.jackpotLose')) : null,
      h('p', { class: 'game-sub' }, t('game.spinOnce'), ' · ', t('game.spun', { count: view.spun, total: view.playerCount })),
      view.winners.length > 0 && this.#revealed ? h('p', { class: 'game-sub' }, t('game.winners', { names: view.winners.join(', ') })) : null,
    );

    return nodes(timerBar(view.deadline, view.durationMs), card, spin?.voucher ? voucherCard(spin.voucher, t, locale) : null);
  }
}

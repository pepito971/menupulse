// La Boisson Mystère : indices progressifs, propositions tirées de la carte, bon de réduction gagné.
import type { BoissonMystereView } from '../../../../shared/games/views.ts';
import { countdown } from '../engine/clock.ts';
import { h } from '../engine/dom.ts';
import { BaseGame } from '../engine/types.ts';
import { nodes, voucherCard } from '../engine/widgets.ts';

export default class BoissonMystereGame extends BaseGame<BoissonMystereView> {
  protected render(view: BoissonMystereView): Node[] {
    const { t, send, locale } = this.context;
    const playing = view.phase === 'play';

    const hints = h(
      'section',
      { class: 'game-card' },
      h('h2', { class: 'game-title' }, t('game.pickDrink')),
      h('ol', { class: 'hint-list' }, view.hints.map((hint, index) => h('li', {}, h('strong', {}, `${t('game.hint', { index: index + 1 })} : `), hint))),
      playing && view.nextHintAt ? countdown(view.nextHintAt, t('game.nextHint')) : null,
      playing ? h('p', { class: 'game-sub' }, t('game.attemptsLeft', { count: view.attemptsLeft })) : null,
      view.lastGuess && !view.lastGuess.correct && playing ? h('p', { class: 'game-feedback is-bad' }, t('game.guessBy', { pseudo: view.lastGuess.by, name: view.lastGuess.name })) : null,
    );

    if (!playing) {
      const won = view.phase === 'won';
      return nodes(
        hints,
        h('p', { class: `game-feedback ${won ? 'is-good' : 'is-bad'}` }, won ? t('game.found', { name: view.answer ?? '' }) : t('game.notFound', { name: view.answer ?? '' })),
        view.voucher ? voucherCard(view.voucher, t, locale) : null,
      );
    }

    const options = view.options.map((option) =>
      h('button', { type: 'button', class: `game-choice${option.wrong ? ' is-wrong' : ''}`, disabled: option.wrong, onClick: () => send({ t: 'guess', productId: option.id }) }, option.name),
    );
    return nodes(hints, h('div', { class: 'game-choices game-choices--grid' }, options));
  }
}

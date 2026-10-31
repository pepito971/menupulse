// Tu préfères ? : deux grosses touches, votes secrets jusqu'à la fin, puis barres en pourcentage.
import type { WouldYouRatherView } from '../../../../shared/games/views.ts';
import { timerBar } from '../engine/clock.ts';
import { h } from '../engine/dom.ts';
import { BaseGame } from '../engine/types.ts';
import { nodes, stepHeader } from '../engine/widgets.ts';

export default class WouldYouRatherGame extends BaseGame<WouldYouRatherView> {
  protected render(view: WouldYouRatherView): Node[] {
    const { t, send } = this.context;
    const revealed = view.results !== null;

    const option = (choice: 'a' | 'b', label: string) => {
      const percent = view.results ? view.results[choice] : 0;
      const count = view.results ? view.results[choice === 'a' ? 'aCount' : 'bCount'] : 0;
      return h(
        'button',
        { type: 'button', class: 'game-choice', 'aria-pressed': String(view.yourVote === choice), disabled: revealed, onClick: () => send({ t: 'vote', choice }) },
        h('span', {}, label),
        revealed
          ? h(
              'span',
              { class: 'vote-result' },
              h('strong', {}, `${percent} %`, count > 0 ? ` · ${count}` : ''),
              h('span', { class: 'vote-bar', 'aria-hidden': 'true' }, h('span', { style: `inline-size: ${percent}%` })),
            )
          : null,
      );
    };

    return nodes(
      stepHeader(t('game.round', { index: view.index + 1, total: view.total })),
      timerBar(view.deadline, view.durationMs),
      h(
        'section',
        { class: 'game-card' },
        h('div', { class: 'game-choices' }, option('a', view.a), h('p', { class: 'game-sub', style: 'text-align: center' }, t('game.or')), option('b', view.b)),
        revealed ? null : h('p', { class: 'game-sub' }, t('game.voted', { count: view.voted, total: view.playerCount }), ' · ', t('game.secretVote')),
      ),
    );
  }
}

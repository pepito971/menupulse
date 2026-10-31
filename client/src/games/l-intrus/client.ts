// L'Intrus : grille de 4 propositions, course au premier bon clic.
import type { IntrusView } from '../../../../shared/games/views.ts';
import { timerBar } from '../engine/clock.ts';
import { h } from '../engine/dom.ts';
import { BaseGame } from '../engine/types.ts';
import { nodes, scoreboard, stepHeader } from '../engine/widgets.ts';

export default class IntrusGame extends BaseGame<IntrusView> {
  protected render(view: IntrusView): Node[] {
    const { t, send } = this.context;
    const revealed = view.phase === 'reveal';
    const items = view.items.map((item, index) => {
      const classes = ['game-choice'];
      if (revealed && index === view.intruder) classes.push('is-correct');
      else if (index === view.wrongPick) classes.push('is-wrong');
      return h('button', { type: 'button', class: classes.join(' '), disabled: revealed || view.lockedOut, onClick: () => send({ t: 'pick', index }) }, item);
    });

    let feedback: HTMLElement | null = null;
    if (revealed) feedback = h('p', { class: `game-feedback ${view.winner ? 'is-good' : 'is-bad'}` }, view.winner ? t('game.intrusWinner', { pseudo: view.winner }) : t('game.intrusNobody'));
    else if (view.lockedOut) feedback = h('p', { class: 'game-feedback is-bad' }, t('game.lockedOut'));

    return nodes(
      stepHeader(t('game.round', { index: view.index + 1, total: view.total })),
      timerBar(view.deadline, view.durationMs),
      h('section', { class: 'game-card' }, h('div', { class: 'game-choices game-choices--grid' }, items), feedback, view.explanation ? h('p', { class: 'game-sub' }, view.explanation) : null),
      scoreboard(view.scoreboard, t),
    );
  }
}

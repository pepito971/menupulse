// Quiz du Comptoir : 4 réponses en grosses touches, minuteur, classement en direct.
import type { QuizView } from '../../../../shared/games/views.ts';
import { timerBar } from '../engine/clock.ts';
import { h } from '../engine/dom.ts';
import { BaseGame } from '../engine/types.ts';
import { nodes, scoreboard, stepHeader } from '../engine/widgets.ts';

export default class QuizGame extends BaseGame<QuizView> {
  protected render(view: QuizView): Node[] {
    const { t, send } = this.context;
    const revealed = view.phase === 'reveal';
    const choices = view.choices.map((choice, index) => {
      const classes = ['game-choice'];
      if (revealed && index === view.correct) classes.push('is-correct');
      else if (revealed && index === view.yourChoice) classes.push('is-wrong');
      return h(
        'button',
        {
          type: 'button',
          class: classes.join(' '),
          'aria-pressed': String(view.yourChoice === index),
          disabled: revealed || view.yourChoice !== null,
          onClick: () => send({ t: 'answer', choice: index }),
        },
        choice,
      );
    });

    let feedback: HTMLElement;
    if (!revealed) feedback = h('p', { class: 'game-sub' }, t('game.answered', { count: view.answered, total: view.playerCount }));
    else if (view.yourChoice === null) feedback = h('p', { class: 'game-feedback is-bad' }, t('game.noAnswer'));
    else if ((view.yourPoints ?? 0) > 0) feedback = h('p', { class: 'game-feedback is-good' }, t('game.correctAnswer', { points: view.yourPoints ?? 0 }));
    else feedback = h('p', { class: 'game-feedback is-bad' }, t('game.wrongAnswer'));

    return nodes(
      stepHeader(t('game.question', { index: view.index + 1, total: view.total })),
      timerBar(view.deadline, view.durationMs),
      h('section', { class: 'game-card' }, h('p', { class: 'game-prompt' }, view.prompt), h('div', { class: 'game-choices game-choices--grid' }, choices), feedback),
      scoreboard(view.scoreboard, t),
    );
  }
}

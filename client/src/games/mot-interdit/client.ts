// Le Mot Interdit : le mot et les mots bannis n'apparaissent que chez celui qui fait deviner.
import type { MotInterditView } from '../../../../shared/games/views.ts';
import { serverNow, timerBar } from '../engine/clock.ts';
import { button, h } from '../engine/dom.ts';
import { BaseGame } from '../engine/types.ts';
import { nodes, scoreboard, stepHeader } from '../engine/widgets.ts';

const EVENT_VISIBLE_MS = 2500;

export default class MotInterditGame extends BaseGame<MotInterditView> {
  protected render(view: MotInterditView): Node[] {
    const { t, send } = this.context;
    const card = h('section', { class: 'game-card' });

    if (view.phase === 'ready') {
      card.append(h('h2', { class: 'game-title' }, view.isSpeaker ? t('game.yourTurn') : t('game.getReady', { pseudo: view.speaker })));
    } else if (view.phase === 'play' && view.isSpeaker && view.card) {
      card.append(
        h('p', { class: 'game-sub' }, t('game.makeThemGuess')),
        h('p', { class: 'taboo-word' }, view.card.word),
        h('p', { class: 'game-label' }, t('game.forbidden')),
        h('ul', { class: 'taboo-forbidden' }, view.card.forbidden.map((word) => h('li', {}, word))),
        h(
          'div',
          { class: 'game-actions' },
          button(t('game.guessed'), () => send({ t: 'guessed' }), { class: 'ui-btn ui-btn--primary' }),
          button(t('game.pass'), () => send({ t: 'pass' })),
        ),
      );
    } else if (view.phase === 'play') {
      card.append(
        h('p', { class: 'game-prompt' }, t('game.guessAloud', { pseudo: view.speaker })),
        h('p', { class: 'game-big-number', 'aria-label': t('game.guessedCount', { count: view.guessed }) }, String(view.guessed)),
        button(t('game.buzz'), () => send({ t: 'buzz' }), { class: 'ui-btn game-wide' }),
      );
    } else {
      card.append(h('p', { class: 'game-label' }, t('game.turnOf', { pseudo: view.speaker })), h('p', { class: 'game-big-number' }, String(view.guessed)), h('p', { class: 'game-sub', style: 'text-align: center' }, t('game.guessedCount', { count: view.guessed })));
    }

    const event = view.lastEvent;
    if (event?.type === 'buzz' && serverNow() - event.at < EVENT_VISIBLE_MS) card.append(h('p', { class: 'game-feedback is-bad' }, t('game.buzzed', { pseudo: event.by })));

    return nodes(stepHeader(t('game.round', { index: view.round + 1, total: view.total })), timerBar(view.deadline, view.durationMs), card, scoreboard(view.scoreboard, t));
  }
}

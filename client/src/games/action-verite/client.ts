// Action ou Vérité : le joueur désigné choisit et joue, la table valide.
import type { ActionVeriteView } from '../../../../shared/games/views.ts';
import { timerBar } from '../engine/clock.ts';
import { button, h } from '../engine/dom.ts';
import { BaseGame } from '../engine/types.ts';
import { nodes, scoreboard, stepHeader } from '../engine/widgets.ts';

export default class ActionVeriteGame extends BaseGame<ActionVeriteView> {
  protected render(view: ActionVeriteView): Node[] {
    const { t, send } = this.context;
    const card = h('section', { class: 'game-card' });

    if (view.phase === 'choose') {
      if (view.isYou) {
        card.append(
          h('h2', { class: 'game-title' }, t('game.yourTurn')),
          h(
            'div',
            { class: 'game-actions' },
            button(t('game.action'), () => send({ t: 'choose', choice: 'action' }), { class: 'ui-btn ui-btn--primary' }),
            button(t('game.verite'), () => send({ t: 'choose', choice: 'verite' }), { class: 'ui-btn ui-btn--primary' }),
          ),
        );
      } else {
        card.append(h('h2', { class: 'game-title' }, t('game.turnOf', { pseudo: view.designated })), h('p', { class: 'game-sub' }, t('game.chooseWaiting', { pseudo: view.designated })));
      }
    } else {
      card.append(
        h('p', { class: 'game-label' }, view.isYou ? t('game.yourTurn') : t('game.turnOf', { pseudo: view.designated }), ' · ', view.choice === 'action' ? t('game.action') : t('game.verite')),
        h('p', { class: 'game-prompt' }, view.card ?? ''),
      );
      if (view.phase === 'perform') {
        card.append(
          view.isYou
            ? button(t('game.skip'), () => send({ t: 'skip' }), { class: 'ui-btn game-wide' })
            : button(t('game.validate'), () => send({ t: 'validate' }), { class: 'ui-btn ui-btn--primary game-wide', disabled: view.youValidated, 'aria-pressed': String(view.youValidated) }),
          h('p', { class: 'game-sub' }, t('game.validations', { count: view.validations, needed: view.needed })),
        );
      } else {
        card.append(h('p', { class: `game-feedback ${view.validated ? 'is-good' : 'is-bad'}` }, view.validated ? t('game.validated') : t('game.notValidated')));
      }
    }

    return nodes(stepHeader(t('game.round', { index: view.round + 1, total: view.total })), timerBar(view.deadline, view.durationMs), card, scoreboard(view.scoreboard, t));
  }
}

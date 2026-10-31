// Application des jeux de table (Tapsy) : rejoindre la table, salon (joueurs, choix du jeu, dernier
// résultat et bons), partie en cours. Chargée à la demande depuis tapsy/main.ts.
//
// Reprise automatique : le jeton de place est gardé dans sessionStorage (propre à l'onglet). Au
// rechargement de la page, ou après une coupure, le joueur retrouve sa place sans retaper son pseudo.
import type { ErrorCode, RoomView } from '../../../../shared/games/protocol.ts';
import type { Locale } from '../../../../shared/locales.ts';
import type { Dict } from '../../../../shared/i18n/translate.ts';
import { createTranslator, type Translator } from '../../core/page-data.ts';
import { setSecondsLabel } from './clock.ts';
import { GameConnection, type EndReason } from './connection.ts';
import { h } from './dom.ts';
import { loadGameComponent } from './registry.ts';
import type { GameComponent } from './types.ts';
import { hero, renderLobby, type LobbyTab } from './lobby.ts';
import '../../../css/games.css';

export interface GamePageData {
  locale: Locale;
  messages: Dict;
  table: string;
  tableLabel: string;
  venue?: string;
}

const MAX_PLAYERS = 10;
const TAB_KEY = 'menupulse.tab';
const TABS: readonly LobbyTab[] = ['play', 'ranking', 'team'];
const END_MESSAGES: Record<EndReason, 'game.seatLost' | 'game.replaced' | 'game.tableClosed' | null> = {
  seat_lost: 'game.seatLost',
  replaced: 'game.replaced',
  table_closed: 'game.tableClosed',
  left: null,
};

export function startGameApp(root: HTMLElement, data: GamePageData): void {
  new GameApp(root, data).start();
}

class GameApp {
  readonly #root: HTMLElement;
  readonly #data: GamePageData;
  readonly #t: Translator;
  readonly #seatKey: string;
  readonly #banner = h('p', { class: 'game-banner hidden', role: 'status' });
  readonly #toast = h('p', { class: 'game-toast hidden', role: 'alert' });
  readonly #main = h('div', { class: 'game-main' });
  #connection: GameConnection | null = null;
  #room: RoomView | null = null;
  #component: { gameId: string; instance: GameComponent; area: HTMLElement } | null = null;
  #loadingGame: string | null = null;
  #toastTimer: ReturnType<typeof setTimeout> | null = null;
  #tab: LobbyTab = TABS.find((tab) => tab === sessionStorage.getItem(TAB_KEY)) ?? 'play';

  constructor(root: HTMLElement, data: GamePageData) {
    this.#root = root;
    this.#data = data;
    this.#t = createTranslator(data.messages);
    this.#seatKey = `menupulse.seat.${data.table}`;
    setSecondsLabel((seconds) => this.#t('game.secondsLeft', { seconds }));
  }

  start(): void {
    this.#root.replaceChildren(this.#banner, this.#main, this.#toast);
    const token = sessionStorage.getItem(this.#seatKey);
    if (token) this.#connect(token);
    else this.#renderJoin();
  }

  // ─── Rejoindre ───────────────────────────────────────────────────────────────────

  #renderJoin(message?: string): void {
    this.#unmountGame();
    const t = this.#t;
    const error = h('p', { class: 'game-error', role: 'alert' }, message ?? '');
    const pseudo = h('input', { class: 'ui-input', name: 'pseudo', autocomplete: 'nickname', maxlength: 20, minlength: 2, required: true, enterkeyhint: 'go', value: sessionStorage.getItem('menupulse.pseudo') ?? '' });
    const consent = h('input', { type: 'checkbox', name: 'consent' }); // décoché par défaut : accord explicite
    const submit = h('button', { type: 'submit', class: 'tp-cta game-wide' }, t('game.join'));
    const form = h(
      'form',
      { class: 'tp-panel game-form', novalidate: true },
      h('h2', { class: 'tp-panel-title' }, t('game.joinTitle')),
      h('label', { class: 'game-field' }, h('span', { class: 'game-label' }, t('game.pseudo')), pseudo, h('span', { class: 'game-sub' }, t('game.pseudoHint'))),
      h('label', { class: 'game-check' }, consent, h('span', {}, t('game.hallOfFameConsent'), h('span', { class: 'game-sub' }, ` ${t('game.hallOfFameHint')}`))),
      error,
      submit,
    );
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      submit.disabled = true;
      submit.textContent = t('game.joining');
      void this.#join(pseudo.value, consent.checked).then((failure) => {
        if (!failure) return;
        error.textContent = failure;
        submit.disabled = false;
        submit.textContent = t('game.join');
        pseudo.focus();
      });
    });
    this.#main.replaceChildren(hero(t('game.joinEyebrow'), t('game.heroTitle'), t('game.heroSub')), form);
  }

  async #join(pseudo: string, hallOfFameConsent: boolean): Promise<string | null> {
    try {
      const response = await fetch('/api/play/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: this.#data.table, pseudo, locale: this.#data.locale, hallOfFameConsent }),
      });
      const body = (await response.json().catch(() => ({}))) as { token?: string; error?: string };
      if (!response.ok || !body.token) return body.error ?? this.#t('game.error.generic');
      sessionStorage.setItem(this.#seatKey, body.token);
      sessionStorage.setItem('menupulse.pseudo', pseudo.trim());
      this.#connect(body.token);
      return null;
    } catch {
      return this.#t('game.error.generic');
    }
  }

  #connect(token: string): void {
    this.#main.replaceChildren(h('p', { class: 'game-loading' }, this.#t('game.joining')));
    this.#connection = new GameConnection(token, {
      room: (view) => this.#onRoom(view),
      error: (code) => this.#showError(code),
      status: (status) => this.#showBanner(status === 'reconnecting' ? this.#t('game.reconnecting') : null),
      ended: (reason) => this.#onEnded(reason),
    });
    this.#connection.open();
  }

  #onEnded(reason: EndReason): void {
    sessionStorage.removeItem(this.#seatKey);
    this.#connection = null;
    this.#room = null;
    this.#showBanner(null);
    const key = END_MESSAGES[reason];
    this.#renderJoin(key ? this.#t(key) : undefined);
  }

  #leave(): void {
    this.#connection?.send({ t: 'leave' });
    this.#connection?.stop();
    this.#onEnded('left');
  }

  // ─── Salle ───────────────────────────────────────────────────────────────────────

  #onRoom(view: RoomView): void {
    this.#room = view;
    if (view.current) void this.#renderGame(view);
    else this.#renderLobby(view);
  }

  async #renderGame(view: RoomView): Promise<void> {
    const current = view.current!;
    if (current.view === null) {
      // arrivé pendant la partie : il regarde la table et jouera à la suivante
      this.#unmountGame();
      this.#main.replaceChildren(h('section', { class: 'tp-panel' }, h('p', { class: 'game-notice' }, this.#t('game.inProgress'))));
      return;
    }
    if (this.#component?.gameId !== current.gameId) {
      if (this.#loadingGame === current.gameId) return; // déjà en chargement : la vue la plus récente sera appliquée
      this.#unmountGame();
      this.#loadingGame = current.gameId;
      this.#main.replaceChildren(h('p', { class: 'game-loading' }, this.#t('game.loading')));
      const Component = await loadGameComponent(current.gameId);
      this.#loadingGame = null;
      if (this.#room?.current?.gameId !== current.gameId) {
        // la partie s'est terminée pendant le chargement
        if (this.#room) this.#onRoom(this.#room);
        return;
      }
      if (!Component) {
        this.#showError('game_unavailable');
        return;
      }
      const area = h('div', { class: 'game-area', 'data-game': current.gameId });
      const instance = new Component({ t: this.#t, locale: view.locale, send: (payload) => this.#connection?.send({ t: 'action', payload }) });
      instance.mount(area);
      this.#component = { gameId: current.gameId, instance, area };
      this.#main.replaceChildren(area);
    }
    const latest = this.#room?.current;
    if (latest && latest.gameId === this.#component.gameId && latest.view !== null) this.#component.instance.update(latest.view);
  }

  #unmountGame(): void {
    this.#component?.instance.unmount();
    this.#component = null;
  }

  #renderLobby(view: RoomView): void {
    this.#unmountGame();
    this.#main.replaceChildren(
      ...renderLobby({
        t: this.#t,
        locale: view.locale,
        venue: this.#data.venue ?? '',
        view,
        tab: this.#tab,
        maxPlayers: MAX_PLAYERS,
        setTab: (tab) => this.#setTab(tab),
        start: (gameId) => this.#connection?.send({ t: 'start', gameId }),
        leave: () => this.#leave(),
      }),
    );
  }

  #setTab(tab: LobbyTab): void {
    this.#tab = tab;
    sessionStorage.setItem(TAB_KEY, tab);
    if (this.#room && !this.#room.current) {
      this.#renderLobby(this.#room);
      window.scrollTo({ top: 0 });
      this.#main.querySelector<HTMLElement>('.tp-nav [aria-current="page"]')?.focus();
    }
  }

  // ─── Messages ────────────────────────────────────────────────────────────────────

  #showBanner(text: string | null): void {
    this.#banner.textContent = text ?? '';
    this.#banner.classList.toggle('hidden', !text);
  }

  #showError(code: ErrorCode): void {
    const known = ['game_unavailable', 'too_few_players', 'too_many_players', 'already_played', 'game_running', 'rate_limited'] as const;
    const key = (known as readonly string[]).includes(code) ? (`game.error.${code}` as `game.error.${(typeof known)[number]}`) : 'game.error.generic';
    this.#toast.textContent = this.#t(key);
    this.#toast.classList.remove('hidden');
    if (this.#toastTimer) clearTimeout(this.#toastTimer);
    this.#toastTimer = setTimeout(() => this.#toast.classList.add('hidden'), 4000);
  }
}

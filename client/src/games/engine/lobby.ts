// Salon des jeux : trois onglets (Jouer, Classement, Équipe) et la barre de navigation du bas.
// Le quiz est mis en avant, le Jack-Pot a sa carte « hasard », les autres jeux forment une grille.
import type { LobbyGame, RoomView } from '../../../../shared/games/protocol.ts';
import type { Locale } from '../../../../shared/locales.ts';
import type { Translator } from '../../core/page-data.ts';
import { button, h } from './dom.ts';
import { GAME_ICONS, icon, svg, svgNode, type IconName } from './icons.ts';
import { voucherCard } from './widgets.ts';
import '../../../css/lobby.css';

export type LobbyTab = 'play' | 'ranking' | 'team';

export interface LobbyContext {
  t: Translator;
  locale: Locale;
  venue: string;
  view: RoomView;
  tab: LobbyTab;
  maxPlayers: number;
  setTab(tab: LobbyTab): void;
  start(gameId: string): void;
  leave(): void;
}

const FEATURED_ID = 'quiz-comptoir';
const LUCK_ID = 'jackpot-happy-hour';
const AVATAR_HUES = 6; // couleurs des avatars : voir .tp-avatar[data-hue] dans tapsy.css
const SKIPPED_WORDS = new Set(['les', 'le', 'la', 'the', 'des', 'du']);

export function renderLobby(ctx: LobbyContext): Node[] {
  const content = ctx.tab === 'ranking' ? rankingTab(ctx) : ctx.tab === 'team' ? teamTab(ctx) : playTab(ctx);
  return [h('div', { class: 'tp-tab', 'data-tab': ctx.tab }, content), bottomNav(ctx)];
}

// ─── Jouer ──────────────────────────────────────────────────────────────────────────

function playTab(ctx: LobbyContext): Node[] {
  const { t, view } = ctx;
  const featured = view.games.find((game) => game.id === FEATURED_ID) ?? view.games.find((game) => game.id !== LUCK_ID);
  const luck = view.games.find((game) => game.id === LUCK_ID);
  const others = view.games.filter((game) => game !== featured && game !== luck);
  const connected = view.players.filter((player) => player.connected).length;
  return [
    hero(t('game.heroEyebrow'), t('game.heroTitle'), t('game.heroSub')),
    teamCard(ctx),
    ...lastResultSummary(ctx),
    view.games.length === 0
      ? h('p', { class: 'game-notice' }, t('game.noGames'))
      : h(
          'section',
          { class: 'tp-section', 'aria-labelledby': 'tp-play-title' },
          sectionHead('tp-play-title', t('game.whatToPlay'), t('game.atYourPace')),
          featured ? featuredCard(ctx, featured) : null,
          luck ? luckCard(ctx, luck) : null,
        ),
    others.length > 0
      ? h(
          'section',
          { class: 'tp-section', 'aria-labelledby': 'tp-more-title' },
          sectionHead('tp-more-title', t('game.moreGames'), t('game.atTable', { count: connected }), 'tp-section-aside--plain'),
          h('ul', { class: 'tp-grid' }, others.map((game) => h('li', {}, gridCard(ctx, game)))),
        )
      : null,
  ].filter((node): node is HTMLElement => node !== null);
}

export function hero(eyebrow: string, title: string, sub: string): HTMLElement {
  return h(
    'div',
    { class: 'tp-hero' },
    h('p', { class: 'tp-eyebrow' }, eyebrow),
    h('h1', { class: 'tp-hero-title' }, title, h('span', { class: 'tp-dot', 'aria-hidden': 'true' }, '.')),
    h('p', { class: 'tp-hero-sub' }, sub),
  );
}

function sectionHead(id: string, title: string, aside: string, asideClass = ''): HTMLElement {
  return h('div', { class: 'tp-section-head' }, h('h2', { id, class: 'tp-section-title' }, title), h('p', { class: `tp-section-aside ${asideClass}`.trim() }, aside));
}

function teamCard(ctx: LobbyContext): HTMLElement {
  const { t, view } = ctx;
  return h(
    'div',
    { class: 'tp-team' },
    h('span', { class: 'tp-team-avatar', 'aria-hidden': 'true' }, teamInitials(view.team.name)),
    h('div', { class: 'tp-team-text' }, h('p', { class: 'tp-team-name' }, view.team.name), h('p', { class: 'tp-team-sub' }, t('game.teamTonight', { venue: ctx.venue }))),
    h('p', { class: 'tp-team-points' }, h('strong', {}, formatNumber(view.team.points, ctx.locale)), ' ', h('span', {}, 'pts')),
  );
}

/** Pourquoi un jeu ne peut pas être lancé (null : il peut l'être). */
function blockedReason(ctx: LobbyContext, game: LobbyGame): string | null {
  const connected = ctx.view.players.filter((player) => player.connected).length;
  if (!game.available) return ctx.t('game.unavailable');
  if (connected < game.minPlayers) return ctx.t('game.minPlayers', { min: game.minPlayers });
  return null;
}

function featuredCard(ctx: LobbyContext, game: LobbyGame): HTMLElement {
  const { t } = ctx;
  const reason = blockedReason(ctx, game);
  const badge = game.id === FEATURED_ID ? t('game.featured.quiz-comptoir') : t('game.featured');
  const cta = game.id === FEATURED_ID ? t('game.cta.quiz-comptoir') : `${t('game.play')} : ${game.name}`;
  const facts = game.facts;
  const factItems: Node[] = [];
  if (facts?.rounds && facts.roundSeconds) {
    const minutes = Math.max(1, Math.round((facts.rounds * (facts.roundSeconds + 4)) / 60));
    factItems.push(h('li', {}, icon('clock', 'tp-icon tp-icon--sm'), t('game.factMinutes', { minutes })));
  }
  if (facts?.rounds) factItems.push(h('li', {}, t('game.factRounds', { rounds: facts.rounds })));
  if (facts?.maxPoints) factItems.push(h('li', {}, t('game.factMaxPoints', { points: formatNumber(facts.maxPoints, ctx.locale) })));
  return h(
    'article',
    { class: ['tp-featured', reason ? 'is-blocked' : ''].filter(Boolean).join(' '), 'aria-labelledby': `tp-game-${game.id}` },
    quizArt(),
    h('p', { class: 'tp-badge' }, badge),
    h('h3', { id: `tp-game-${game.id}`, class: 'tp-featured-title' }, game.name),
    h('p', { class: 'tp-featured-sub' }, reason ?? game.tagline),
    button([cta, icon('arrow', 'tp-icon tp-icon--sm')], () => ctx.start(game.id), { class: 'tp-cta', disabled: Boolean(reason) }),
    factItems.length > 0 ? h('ul', { class: 'tp-facts' }, factItems) : null,
  );
}

function luckCard(ctx: LobbyContext, game: LobbyGame): HTMLElement {
  const { t } = ctx;
  const reason = blockedReason(ctx, game);
  return h(
    'article',
    { class: ['tp-luck', reason ? 'is-blocked' : ''].filter(Boolean).join(' '), 'aria-labelledby': `tp-game-${game.id}` },
    h(
      'div',
      { class: 'tp-luck-text' },
      h('p', { class: 'tp-eyebrow tp-eyebrow--lime' }, t('game.luckEyebrow')),
      h('h3', { id: `tp-game-${game.id}`, class: 'tp-luck-title' }, game.name),
      h('p', { class: 'tp-luck-sub' }, reason ?? game.tagline),
      button([t('game.cta.jackpot-happy-hour'), icon('arrow', 'tp-icon tp-icon--sm')], () => ctx.start(game.id), { class: 'tp-link-cta', disabled: Boolean(reason) }),
    ),
    slotArt(),
  );
}

function gridCard(ctx: LobbyContext, game: LobbyGame): HTMLElement {
  const { t } = ctx;
  const reason = blockedReason(ctx, game);
  // jeu ajouté sans sa catégorie dans les dictionnaires : pas de surtitre
  const kind = (t(`game.kind.${game.id}` as Parameters<Translator>[0]) as string | undefined) ?? '';
  const iconName: IconName = GAME_ICONS[game.id] ?? 'sparkles';
  return button(
    [
      h('span', { class: 'tp-card-top' }, h('span', { class: 'tp-card-kind' }, kind), icon(iconName, 'tp-icon tp-card-icon')),
      h('span', { class: 'tp-card-name' }, game.name),
      h('span', { class: 'tp-card-sub' }, reason ?? game.tagline),
    ],
    () => ctx.start(game.id),
    { class: 'tp-card', 'data-game': game.id, disabled: Boolean(reason), 'aria-label': `${t('game.play')} : ${game.name}${reason ? ` (${reason})` : ''}` },
  );
}

function lastResultSummary(ctx: LobbyContext): HTMLElement[] {
  const { t, view } = ctx;
  const result = view.lastResult;
  if (!result) return [];
  const nodes: HTMLElement[] = result.vouchers.map((voucher) => voucherCard(voucher, t, view.locale));
  const winner = result.ranking[0];
  const game = view.games.find((item) => item.id === result.gameId)?.name;
  if (winner && winner.score > 0 && game) {
    nodes.push(
      h(
        'div',
        { class: 'tp-winner' },
        icon('trophy', 'tp-icon'),
        h('p', {}, t('game.lastWinner', { pseudo: winner.pseudo, game })),
        button(t('game.seeRanking'), () => ctx.setTab('ranking'), { class: 'tp-link-cta tp-link-cta--small' }),
      ),
    );
  }
  return nodes;
}

// ─── Classement ─────────────────────────────────────────────────────────────────────

function rankingTab(ctx: LobbyContext): Node[] {
  const { t, view } = ctx;
  const nodes: Node[] = [hero(t('game.nav.ranking'), view.team.name, t('game.teamTonight', { venue: ctx.venue }))];
  if (view.lastResult) {
    const name = view.games.find((game) => game.id === view.lastResult!.gameId)?.name ?? '';
    nodes.push(
      panel(
        `${t('game.lastResult')}${name ? ` · ${name}` : ''}`,
        view.lastResult.vouchers.map((voucher) => voucherCard(voucher, t, view.locale)),
        view.lastResult.ranking.length > 0 ? rankList(view.lastResult.ranking.map((line) => ({ label: line.pseudo, value: line.score, you: false })), ctx) : null,
      ),
    );
  }
  nodes.push(
    panel(
      t('game.tonight'),
      view.standings.length === 0
        ? h('p', { class: 'tp-empty' }, t('game.noScoresYet'))
        : rankList(view.standings.map((line) => ({ label: line.pseudo, value: line.score, you: line.you, sub: line.games === 1 ? t('game.gamesPlayedOne') : t('game.gamesPlayed', { games: line.games }) })), ctx),
    ),
    panel(
      t('game.records'),
      view.hallOfFame.length === 0
        ? h('p', { class: 'tp-empty' }, t('game.noRecords'))
        : rankList(view.hallOfFame.map((record) => ({ label: record.pseudo, value: record.score, you: false, sub: record.game })), ctx, false),
      h('p', { class: 'tp-hint' }, t('game.recordsHint')),
    ),
  );
  return nodes;
}

function rankList(lines: { label: string; value: number; you: boolean; sub?: string }[], ctx: LobbyContext, numbered = true): HTMLElement {
  return h(
    numbered ? 'ol' : 'ul',
    { class: 'tp-rank' },
    lines.map((line, index) =>
      h(
        'li',
        { class: line.you ? 'is-you' : null },
        numbered ? h('span', { class: 'tp-rank-pos' }, String(index + 1)) : icon('trophy', 'tp-icon tp-rank-icon'),
        h('span', { class: 'tp-rank-text' }, h('span', { class: 'tp-rank-name' }, line.label, line.you ? ` (${ctx.t('game.you')})` : ''), line.sub ? h('span', { class: 'tp-rank-sub' }, line.sub) : null),
        h('span', { class: 'tp-rank-score' }, ctx.t('game.points', { points: formatNumber(line.value, ctx.locale) })),
      ),
    ),
  );
}

// ─── Équipe ─────────────────────────────────────────────────────────────────────────

function teamTab(ctx: LobbyContext): Node[] {
  const { t, view } = ctx;
  return [
    hero(t('game.nav.team'), view.team.name, t('game.teamTonight', { venue: ctx.venue })),
    teamCard(ctx),
    panel(
      t('game.playersTitle', { count: view.players.length, max: ctx.maxPlayers }),
      h(
        'ul',
        { class: 'tp-players' },
        view.players.map((player) =>
          h(
            'li',
            { class: ['tp-player', player.id === view.you ? 'is-you' : '', player.connected ? '' : 'is-offline'].filter(Boolean).join(' ') },
            h('span', { class: 'tp-avatar', 'data-hue': String(hue(player.pseudo)), 'aria-hidden': 'true' }, initials(player.pseudo)),
            h('span', { class: 'tp-player-name' }, player.pseudo, player.id === view.you ? ` (${t('game.you')})` : ''),
            player.connected ? null : h('span', { class: 'tp-player-status' }, t('game.offline')),
          ),
        ),
      ),
      h('p', { class: 'tp-hint' }, t('game.inviteHint')),
    ),
    button([icon('logout', 'tp-icon tp-icon--sm'), t('game.leave')], () => ctx.leave(), { class: 'ui-btn game-wide game-leave' }),
  ];
}

// ─── Communs ────────────────────────────────────────────────────────────────────────

function panel(title: string, ...children: (Node | Node[] | null)[]): HTMLElement {
  return h('section', { class: 'tp-panel' }, h('h2', { class: 'tp-panel-title' }, title), ...children);
}

function bottomNav(ctx: LobbyContext): HTMLElement {
  const items: { tab: LobbyTab; label: string; icon: IconName }[] = [
    { tab: 'play', label: ctx.t('game.nav.play'), icon: 'play' },
    { tab: 'ranking', label: ctx.t('game.nav.ranking'), icon: 'trophy' },
    { tab: 'team', label: ctx.t('game.nav.team'), icon: 'users' },
  ];
  return h(
    'nav',
    { class: 'tp-nav', 'aria-label': ctx.t('game.nav') },
    items.map((item) =>
      button([icon(item.icon, 'tp-icon tp-nav-icon'), h('span', {}, item.label)], () => ctx.setTab(item.tab), {
        class: 'tp-nav-btn',
        'aria-current': item.tab === ctx.tab ? 'page' : null,
      }),
    ),
  );
}

function quizArt(): SVGSVGElement {
  return svg(
    '0 0 140 140',
    'tp-art tp-art--quiz',
    svgNode('ellipse', { cx: 76, cy: 74, rx: 54, ry: 40, transform: 'rotate(-28 76 74)' }),
    svgNode('ellipse', { cx: 80, cy: 78, rx: 50, ry: 44, transform: 'rotate(18 80 78)' }),
    svgNode('text', { x: 78, y: 104, 'text-anchor': 'middle', class: 'tp-art-glyph' }, '?'),
    svgNode('path', { class: 'tp-art-star', d: 'M20 20l3 9 9 3-9 3-3 9-3-9-9-3 9-3z' }),
    svgNode('path', { class: 'tp-art-star', d: 'M120 118l2 5 5 2-5 2-2 5-2-5-5-2 5-2z' }),
  );
}

function slotArt(): SVGSVGElement {
  const reels = [0, 1, 2].map((index) => svgNode('rect', { x: 14 + index * 30, y: 34, width: 24, height: 36, rx: 6, class: 'tp-art-reel' }));
  const sevens = [0, 1, 2].map((index) => svgNode('text', { x: 26 + index * 30, y: 60, 'text-anchor': 'middle', class: 'tp-art-seven' }, '7'));
  return svg(
    '0 0 112 104',
    'tp-art tp-art--slot',
    svgNode('rect', { x: 6, y: 24, width: 100, height: 56, rx: 14, class: 'tp-art-frame' }),
    ...reels,
    ...sevens,
    svgNode('path', { class: 'tp-art-star', d: 'M56 4l2 6 6 2-6 2-2 6-2-6-6-2 6-2z' }),
    svgNode('path', { d: 'M30 92h52', class: 'tp-art-base' }),
  );
}

function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale).format(value);
}

function teamInitials(name: string): string {
  const words = name.split(/\s+/).filter((word) => word && !SKIPPED_WORDS.has(word.toLocaleLowerCase()));
  return (words.slice(0, 2).map((word) => [...word][0] ?? '').join('') || '?').toLocaleUpperCase();
}

function initials(pseudo: string): string {
  const words = pseudo.split(/[\s._-]+/).filter(Boolean);
  const letters = words.length > 1 ? [...words[0]!][0]! + [...words[1]!][0]! : [...pseudo].slice(0, 2).join('');
  return letters.toLocaleUpperCase();
}

function hue(pseudo: string): number {
  let sum = 0;
  for (const char of pseudo) sum = (sum + char.codePointAt(0)!) % 997;
  return sum % AVATAR_HUES;
}

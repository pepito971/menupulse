import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Room, RECONNECT_GRACE_MS } from '../server/games/engine/room.ts';
import { GAMES } from '../server/games/registry.ts';
import { quizComptoir } from '../server/games/quiz-comptoir/index.ts';
import type { AnyGameDefinition } from '../shared/games/types.ts';
import { FakeClock, harness, players, seededRandom } from './support/game-harness.ts';

const noHooks = { changed() {}, effect() {}, gameStarted() {}, gameEnded() {}, emptied() {} };

test('une table accueille 10 joueurs au plus, avec des pseudos distincts', () => {
  const room = new Room({ id: 't', hooks: noHooks, random: seededRandom(), scheduler: new FakeClock() });
  for (let i = 1; i <= 10; i++) assert.equal(room.addSeat({ id: `p${i}`, pseudo: `Joueur ${i}`, locale: 'fr' }, false), 'ok');
  assert.equal(room.addSeat({ id: 'p11', pseudo: 'Onzième', locale: 'fr' }, false), 'full');
  const other = new Room({ id: 't2', hooks: noHooks, random: seededRandom(), scheduler: new FakeClock() });
  other.addSeat({ id: 'a', pseudo: 'Léa', locale: 'fr' }, false);
  assert.equal(other.addSeat({ id: 'b', pseudo: 'LÉA', locale: 'fr' }, false), 'pseudo_taken');
});

test('une place déconnectée se libère après le délai, sauf reconnexion à temps', () => {
  const h = harness(players('Léa', 'Tom'));
  h.room.disconnect('p1');
  h.clock.advance(RECONNECT_GRACE_MS - 1000);
  assert.ok(h.room.connect('p1'), 'reconnexion dans le délai');
  h.room.disconnect('p2');
  h.clock.advance(RECONNECT_GRACE_MS + 1);
  assert.deepEqual([...h.room.seats.keys()], ['p1']);
  h.room.leave('p1');
  assert.equal(h.emptied, 1, 'salle vide signalée une seule fois');
});

test('un joueur déconnecté pendant une partie garde sa place et son score jusqu’à la fin', () => {
  const h = harness(players('Léa', 'Tom'));
  h.start(quizComptoir, { questionCount: 3 });
  h.room.disconnect('p2');
  h.clock.advance(RECONNECT_GRACE_MS + 1);
  assert.ok(h.room.seats.has('p2'));
  h.clock.advance(10 * 60_000); // fin de la partie (personne ne répond)
  assert.equal(h.ended.length, 1);
  assert.ok(!h.room.seats.has('p2'), 'place libérée à la fin de la partie');
  assert.ok(h.room.seats.has('p1'));
});

test('une action invalide ou d’un spectateur est refusée sans toucher à la partie', () => {
  const h = harness(players('Léa'));
  h.start(quizComptoir);
  const rev = h.room.game!.rev;
  assert.equal(h.act('p1', { t: 'answer', choice: 7 }), 'invalid_action');
  assert.equal(h.act('p1', { t: 'tricher' }), 'invalid_action');
  assert.equal(h.room.game!.rev, rev);
  h.room.addSeat({ id: 'late', pseudo: 'Retard', locale: 'fr' }, false);
  h.room.connect('late');
  assert.equal(h.act('late', { t: 'answer', choice: 0 }), 'not_player');
  assert.equal(h.room.gameView('late'), null, 'un arrivant regarde, il jouera à la suivante');
});

test('une erreur dans un jeu arrête la partie sans faire tomber le serveur', () => {
  const broken: AnyGameDefinition = {
    ...quizComptoir,
    id: 'casse',
    onAction() {
      throw new Error('bug volontaire');
    },
  };
  const h = harness(players('Léa'));
  const originalError = console.error;
  console.error = () => {};
  try {
    h.start(broken);
    assert.equal(h.act('p1', { t: 'answer', choice: 0 }), 'ok');
  } finally {
    console.error = originalError;
  }
  assert.equal(h.room.game, null);
  assert.deepEqual(h.ended.at(-1), { result: null, reason: 'abandoned' });
  assert.equal(h.clock.pending, 0, 'aucun minuteur orphelin');
});

test('une partie ne démarre qu’avec assez de joueurs connectés, et une seule à la fois', () => {
  const h = harness(players('Léa'));
  const twoPlayers: AnyGameDefinition = { ...quizComptoir, players: { min: 2, max: 10 } };
  assert.equal(h.start(twoPlayers), 'too_few_players');
  assert.equal(h.start(quizComptoir), 'ok');
  assert.equal(h.start(quizComptoir), 'game_running');
});

test('chaque jeu se lance avec ses réglages par défaut et son contenu fourni', () => {
  const ids = new Set<string>();
  for (const game of GAMES) {
    assert.ok(!ids.has(game.id), `identifiant unique : ${game.id}`);
    ids.add(game.id);
    assert.match(game.id, /^[a-z][a-z0-9-]{1,31}$/);
    assert.ok(game.settingsSchema.safeParse({}).success, `réglages par défaut : ${game.id}`);
    if (game.defaultContent !== undefined) assert.ok(game.contentSchema.safeParse(game.defaultContent).success, `contenu fourni : ${game.id}`);
    assert.ok(game.players.max <= 10 && game.players.min >= 1);
    assert.ok(game.name.fr && game.name.en && game.tagline.fr && game.tagline.en, `nom traduit : ${game.id}`);
  }
  assert.equal(GAMES.length, 7);
});

test('un réglage hors limites est refusé', () => {
  assert.equal(quizComptoir.settingsSchema.safeParse({ questionSeconds: 2 }).success, false);
});

test('les points de la soirée se cumulent par joueur, y compris après son départ', () => {
  const scored: AnyGameDefinition = {
    ...quizComptoir,
    id: 'points',
    setup: () => ({ done: false }),
    onAction: () => ({ done: true }),
    result: (state: { done: boolean }) => (state.done ? { ranking: [{ playerId: 'p1', score: 120 }, { playerId: 'p2', score: 30 }], vouchers: [] } : null),
  };
  const h = harness(players('Léa', 'Tom'));
  h.start(scored);
  h.act('p1', { t: 'answer', choice: 0 });
  h.room.leave('p2');
  h.start(scored);
  h.act('p1', { t: 'answer', choice: 0 });
  assert.deepEqual(h.room.standings.get('p1'), { pseudo: 'Léa', score: 240, games: 2 });
  assert.deepEqual(h.room.standings.get('p2'), { pseudo: 'Tom', score: 30, games: 1 }, 'Tom est parti mais ses points restent à l’équipe');
});

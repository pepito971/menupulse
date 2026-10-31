import assert from 'node:assert/strict';
import { test } from 'node:test';
import { actionVerite, validationsNeeded } from '../server/games/action-verite/index.ts';
import { buildHints } from '../server/games/boisson-mystere/hints.ts';
import { boissonMystere } from '../server/games/boisson-mystere/index.ts';
import { drawSpin, jackpotHappyHour } from '../server/games/jackpot-happy-hour/index.ts';
import { lIntrus } from '../server/games/l-intrus/index.ts';
import { motInterdit, MIN_MS_BETWEEN_WORDS, READY_MS } from '../server/games/mot-interdit/index.ts';
import { quizComptoir, quizPoints } from '../server/games/quiz-comptoir/index.ts';
import { tuPreferes, votePercentages } from '../server/games/tu-preferes/index.ts';
import { VOUCHER_ALPHABET } from '../server/games/helpers.ts';
import type {
  ActionVeriteView,
  BoissonMystereView,
  IntrusView,
  JackpotView,
  MotInterditView,
  QuizView,
  WouldYouRatherView,
} from '../shared/games/views.ts';
import { harness, players } from './support/game-harness.ts';

const VOUCHER_RE = new RegExp(`^[${VOUCHER_ALPHABET}]{6}$`);

// ─── Quiz du Comptoir ────────────────────────────────────────────────────────────────

test('quiz : 100 points + bonus proportionnel au temps restant', () => {
  assert.equal(quizPoints(true, 15_000, 15_000), 200);
  assert.equal(quizPoints(true, 7_500, 15_000), 150);
  assert.equal(quizPoints(true, -20, 15_000), 100);
  assert.equal(quizPoints(false, 15_000, 15_000), 0);
});

test('quiz : la bonne réponse reste secrète, les points se comptent à la réception', () => {
  const h = harness(players('Léa', 'Tom'));
  h.start(quizComptoir);
  const question = h.view<QuizView>('p1');
  assert.equal(question.correct, null);
  assert.equal(question.total, 5);
  const correct = (h.room.game!.state as { questions: { correct: number }[] }).questions[0]!.correct;
  h.clock.advance(3000); // Léa répond juste après 3 s
  h.act('p1', { t: 'answer', choice: correct });
  h.act('p1', { t: 'answer', choice: (correct + 1) % 4 }); // pas de seconde chance
  assert.equal(h.view<QuizView>('p1').yourChoice, correct);
  assert.equal(h.view<QuizView>('p2').correct, null, 'toujours secret tant que Tom n’a pas répondu');
  h.act('p2', { t: 'answer', choice: (correct + 1) % 4 });
  const revealed = h.view<QuizView>('p1');
  assert.equal(revealed.phase, 'reveal', 'tout le monde a répondu : révélation immédiate');
  assert.equal(revealed.correct, correct);
  assert.equal(revealed.yourPoints, 180); // 100 + 100 × 12/15
  assert.deepEqual(revealed.scoreboard[0], { pseudo: 'Léa', score: 180, you: true });
});

test('quiz : partie complète, classement final trié', () => {
  const h = harness(players('Léa', 'Tom', 'Zoé'));
  h.start(quizComptoir, { questionCount: 3 });
  for (let q = 0; q < 3; q++) {
    const correct = (h.room.game!.state as { questions: { correct: number }[] }).questions[q]!.correct;
    h.act('p3', { t: 'answer', choice: correct });
    h.clock.advance(16_000 + 4_000);
  }
  const result = h.ended.at(-1)!.result!;
  assert.equal(result.ranking[0]!.playerId, 'p3');
  assert.ok(result.ranking[0]!.score >= 300);
  assert.equal(h.clock.pending, 0);
});

// ─── Tu préfères ? ───────────────────────────────────────────────────────────────────

test('tu préfères : votes secrets jusqu’à la fin du temps, puis pourcentages', () => {
  const h = harness(players('Léa', 'Tom', 'Zoé'));
  h.start(tuPreferes);
  h.act('p1', { t: 'vote', choice: 'a' });
  h.act('p2', { t: 'vote', choice: 'b' });
  h.act('p2', { t: 'vote', choice: 'a' }); // change d'avis
  h.act('p3', { t: 'vote', choice: 'b' });
  const during = h.view<WouldYouRatherView>('p1');
  assert.equal(during.results, null, 'rien ne fuit avant la fin, même si tout le monde a voté');
  assert.equal(during.voted, 3);
  h.act('p3', { t: 'vote', choice: 'a' });
  assert.deepEqual(h.view<WouldYouRatherView>('p1'), during, 'le vote d’un autre joueur ne change rien à ma vue');
  h.act('p3', { t: 'vote', choice: 'b' });
  h.clock.advance(20_000);
  assert.deepEqual(h.view<WouldYouRatherView>('p1').results, { a: 67, b: 33, aCount: 2, bCount: 1 });
  assert.deepEqual(votePercentages([]), { a: 0, b: 0, aCount: 0, bCount: 0 });
});

// ─── L'Intrus ────────────────────────────────────────────────────────────────────────

test('l’intrus : le premier bon clic gagne et verrouille, un mauvais clic élimine', () => {
  const h = harness(players('Léa', 'Tom', 'Zoé'));
  h.start(lIntrus);
  const intruder = (h.room.game!.state as { grids: { intruder: number }[] }).grids[0]!.intruder;
  const wrong = (intruder + 1) % 4;
  h.act('p1', { t: 'pick', index: wrong });
  assert.equal(h.view<IntrusView>('p1').lockedOut, true);
  h.act('p1', { t: 'pick', index: intruder }); // éliminé : ignoré
  assert.equal(h.view<IntrusView>('p1').phase, 'race');
  assert.equal(h.view<IntrusView>('p2').intruder, null, 'réponse secrète pendant la course');
  h.act('p2', { t: 'pick', index: intruder });
  h.act('p3', { t: 'pick', index: intruder }); // trop tard
  const view = h.view<IntrusView>('p3');
  assert.equal(view.phase, 'reveal');
  assert.equal(view.winner, 'Tom');
  assert.equal(view.intruder, intruder);
  assert.deepEqual(view.scoreboard[0], { pseudo: 'Tom', score: 100, you: false });
});

test('l’intrus : tout le monde éliminé → révélation sans gagnant', () => {
  const h = harness(players('Léa', 'Tom'));
  h.start(lIntrus);
  const intruder = (h.room.game!.state as { grids: { intruder: number }[] }).grids[0]!.intruder;
  h.act('p1', { t: 'pick', index: (intruder + 1) % 4 });
  h.act('p2', { t: 'pick', index: (intruder + 2) % 4 });
  assert.equal(h.view<IntrusView>('p1').phase, 'reveal');
  assert.equal(h.view<IntrusView>('p1').winner, null);
});

// ─── Action ou Vérité ────────────────────────────────────────────────────────────────

test('action ou vérité : validations nécessaires = moitié des autres joueurs', () => {
  assert.deepEqual([2, 3, 4, 5, 10].map(validationsNeeded), [1, 1, 2, 2, 5]);
});

test('action ou vérité : seul le joueur désigné choisit, la table valide', () => {
  const h = harness(players('Léa', 'Tom', 'Zoé', 'Max'));
  h.start(actionVerite);
  const first = h.view<ActionVeriteView>('p1');
  const designatedId = ['p1', 'p2', 'p3', 'p4'].find((id) => h.view<ActionVeriteView>(id).isYou)!;
  const others = ['p1', 'p2', 'p3', 'p4'].filter((id) => id !== designatedId);
  assert.equal(first.phase, 'choose');
  h.act(others[0]!, { t: 'choose', choice: 'action' }); // pas son tour
  assert.equal(h.view<ActionVeriteView>(designatedId).phase, 'choose');
  h.act(designatedId, { t: 'choose', choice: 'verite' });
  const perform = h.view<ActionVeriteView>(others[0]!);
  assert.equal(perform.phase, 'perform');
  assert.ok(perform.card && perform.card.endsWith('?'), 'une vérité est une question');
  h.act(designatedId, { t: 'validate' }); // ne peut pas se valider lui-même
  h.act(others[0]!, { t: 'validate' });
  h.act(others[0]!, { t: 'validate' }); // un seul vote par joueur
  assert.equal(h.view<ActionVeriteView>(designatedId).validations, 1);
  h.act(others[1]!, { t: 'validate' }); // 2 validations sur 3 autres : validé
  const reveal = h.view<ActionVeriteView>(designatedId);
  assert.equal(reveal.validated, true);
  assert.equal(reveal.scoreboard.find((line) => line.you)!.score, 100);
});

test('action ou vérité : sans choix à temps, le hasard choisit ; sans validation, pas de points', () => {
  const h = harness(players('Léa', 'Tom'));
  h.start(actionVerite);
  h.clock.advance(15_000);
  assert.equal(h.view<ActionVeriteView>('p1').phase, 'perform');
  h.clock.advance(60_000);
  assert.equal(h.view<ActionVeriteView>('p1').validated, false);
});

// ─── Le Mot Interdit ─────────────────────────────────────────────────────────────────

test('mot interdit : le mot ne s’affiche que chez celui qui fait deviner', () => {
  const h = harness(players('Léa', 'Tom', 'Zoé'));
  h.start(motInterdit);
  h.clock.advance(READY_MS);
  const ids = ['p1', 'p2', 'p3'];
  const speaker = ids.find((id) => h.view<MotInterditView>(id).isSpeaker)!;
  const listener = ids.find((id) => id !== speaker)!;
  assert.ok(h.view<MotInterditView>(speaker).card?.forbidden.length === 3);
  assert.equal(h.view<MotInterditView>(listener).card, null);
  const secret = h.view<MotInterditView>(speaker).card!.word;
  assert.ok(!JSON.stringify(h.view<MotInterditView>(listener)).includes(secret));

  h.act(speaker, { t: 'guessed' }); // trop rapide après l'affichage de la carte : ignoré
  assert.equal(h.view<MotInterditView>(speaker).guessed, 0);
  h.clock.advance(MIN_MS_BETWEEN_WORDS);
  h.act(speaker, { t: 'guessed' });
  h.act(listener, { t: 'guessed' }); // seul l'orateur valide un mot deviné
  assert.equal(h.view<MotInterditView>(listener).guessed, 1);
  h.act(speaker, { t: 'buzz' }); // l'orateur ne se buzze pas
  h.clock.advance(MIN_MS_BETWEEN_WORDS);
  h.act(listener, { t: 'buzz' });
  const after = h.view<MotInterditView>(speaker);
  assert.equal(after.guessed, 1, 'un buzz saute la carte sans point');
  assert.equal(after.lastEvent?.type, 'buzz');
  h.clock.advance(30_000);
  assert.equal(h.view<MotInterditView>(speaker).phase, 'reveal');
});

// ─── La Boisson Mystère ──────────────────────────────────────────────────────────────

const DRINKS = [
  { id: 'd1', name: { fr: 'Mango Fizz', en: 'Mango Fizz' }, category: { fr: 'Mocktails', en: 'Mocktails' }, abv: 0 },
  { id: 'd2', name: { fr: 'Thé glacé maison', en: 'Homemade iced tea' }, category: { fr: 'Softs', en: 'Soft drinks' }, abv: 0 },
  { id: 'd3', name: { fr: 'Limonade', en: 'Lemonade' }, category: { fr: 'Softs', en: 'Soft drinks' }, abv: 0, origin: 'Bretagne' },
  { id: 'd4', name: { fr: 'Virgin Mojito', en: 'Virgin Mojito' }, category: { fr: 'Mocktails', en: 'Mocktails' }, abv: 0 },
  { id: 'd5', name: { fr: 'Jus de goyave', en: 'Guava juice' }, category: { fr: 'Jus', en: 'Juices' }, abv: 0 },
];
const MYSTERY_CONTENT = { products: DRINKS.map((d) => ({ id: d.id, name: d.name, hints: buildHints(d) })) };

test('boisson mystère : indices du plus vague au plus précis, dans chaque langue', () => {
  const [first, second, third] = buildHints({ id: 'x', name: { fr: 'Thé glacé', en: 'Iced tea' }, category: { fr: 'Softs', en: 'Soft drinks' }, abv: 0, origin: 'Chine' });
  assert.equal(first.fr, 'On la trouve dans notre carte « Softs ».');
  assert.equal(first.en, 'You will find it in our “Soft drinks” menu.');
  assert.equal(second.fr, 'Elle est sans alcool. Origine : Chine.');
  assert.equal(third.fr, 'Son nom commence par « T » et compte 8 lettres.');
  assert.equal(third.en, 'Its name starts with “I” and has 7 letters.');
  assert.match(buildHints({ id: 'y', name: { fr: 'IPA' }, category: null, abv: 6.5 })[1].fr!, /6,5 % vol\./);
});

test('boisson mystère : 3 essais collectifs, chaque erreur dévoile un indice, la réponse reste secrète', () => {
  const h = harness(players('Léa', 'Tom'));
  h.start(boissonMystere, {}, MYSTERY_CONTENT);
  const target = (h.room.game!.state as { target: { id: string } }).target.id;
  const view = h.view<BoissonMystereView>('p1');
  assert.equal(view.hints.length, 1);
  assert.equal(view.answer, null);
  const wrongIds = view.options.map((o) => o.id).filter((id) => id !== target);
  h.act('p1', { t: 'guess', productId: wrongIds[0] });
  h.act('p2', { t: 'guess', productId: wrongIds[0] }); // déjà proposé : ne coûte rien
  const after = h.view<BoissonMystereView>('p2');
  assert.equal(after.attemptsLeft, 2);
  assert.equal(after.hints.length, 2);
  assert.equal(after.lastGuess?.by, 'Léa');
  h.act('p2', { t: 'guess', productId: wrongIds[1] });
  h.act('p1', { t: 'guess', productId: wrongIds[2] });
  const lost = h.view<BoissonMystereView>('p1');
  assert.equal(lost.phase, 'lost');
  assert.ok(lost.answer);
  assert.equal(h.effects.length, 0);
});

test('boisson mystère : trouvée → un bon éphémère pour toute la table', () => {
  const h = harness(players('Léa', 'Tom'));
  h.start(boissonMystere, { discountPercent: 15 }, MYSTERY_CONTENT);
  const target = (h.room.game!.state as { target: { id: string } }).target.id;
  h.act('p2', { t: 'guess', productId: target });
  const won = h.view<BoissonMystereView>('p1');
  assert.equal(won.phase, 'won');
  assert.match(won.voucher!.code, VOUCHER_RE);
  assert.match(won.voucher!.reward, /^-15 % sur « .+ »$/);
  assert.equal(won.voucher!.expiresAt, h.clock.time + 30 * 60_000);
  assert.equal(h.effects.length, 1);
  assert.equal(h.effects[0]!.playerId, undefined, 'bon de table');
  h.clock.advance(10_000);
  assert.equal(h.ended.at(-1)!.result!.vouchers.length, 1);
});

test('boisson mystère : il faut au moins 4 boissons', () => {
  assert.equal(boissonMystere.contentSchema.safeParse({ products: MYSTERY_CONTENT.products.slice(0, 3) }).success, false);
});

// ─── Le Jack-Pot de l'Happy Hour ─────────────────────────────────────────────────────

test('jack-pot : le taux de gain et le quota décident, un perdant n’a jamais trois symboles identiques', () => {
  let n = 0;
  const cycle = (max: number) => n++ % max;
  assert.equal(drawSpin(0, 10, cycle).win, false);
  assert.equal(drawSpin(1, 10, cycle).win, true);
  assert.equal(drawSpin(1, 0, cycle).win, false, 'quota du jour épuisé');
  const same = () => 0; // le hasard voudrait trois fois le même symbole
  const [a, b, c] = drawSpin(0, 10, same).reels;
  assert.ok(!(a === b && b === c));
  const [x, y, z] = drawSpin(1, 10, same).reels;
  assert.ok(x === y && y === z);
});

test('jack-pot : seulement pendant l’Happy Hour, un essai par joueur, bon nominatif', () => {
  assert.equal(jackpotHappyHour.isAvailable!({ happyHourActive: false }), false);
  assert.equal(jackpotHappyHour.isAvailable!({ happyHourActive: true }), true);
  const h = harness(players('Léa', 'Tom'));
  h.start(jackpotHappyHour, { winRate: 1 }, { remainingWins: 1 });
  h.act('p1', { t: 'spin' });
  h.act('p1', { t: 'spin' }); // un seul essai
  h.act('p2', { t: 'spin' });
  const lea = h.view<JackpotView>('p1');
  const tom = h.view<JackpotView>('p2');
  assert.equal(lea.yourSpin!.win, true);
  assert.equal(tom.yourSpin!.win, false, 'quota d’un seul gain atteint');
  assert.equal(tom.yourSpin!.voucher, null);
  assert.deepEqual(lea.winners, ['Léa']);
  assert.equal(h.effects.length, 1);
  assert.equal(h.effects[0]!.playerId, 'p1');
  h.clock.advance(6000);
  assert.equal(h.ended.at(-1)!.reason, 'finished');
});

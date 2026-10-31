import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { GAMES } from '../server/games/registry.ts';
import { checkPseudo } from '../server/lib/pseudo.ts';
import { parseClientMessage } from '../server/games/engine/protocol.ts';
import { localDay, periodStarts } from '../shared/periods.ts';

const CLIENT_GAMES = new URL('../client/src/games/', import.meta.url);

test('chaque jeu du serveur a son composant côté téléphone, et inversement', () => {
  for (const game of GAMES) assert.ok(existsSync(new URL(`${game.id}/client.ts`, CLIENT_GAMES)), `client manquant : ${game.id}`);
  const clientIds = readdirSync(CLIENT_GAMES, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'engine')
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(clientIds, GAMES.map((game) => game.id).sort());
});

test('pseudo : longueur, caractères, insultes évidentes (mots entiers seulement)', () => {
  assert.deepEqual(checkPseudo('  Léa   la  Bretonne '), { ok: true, pseudo: 'Léa la Bretonne' });
  assert.deepEqual(checkPseudo("Jean-Ma'rc_2"), { ok: true, pseudo: "Jean-Ma'rc_2" });
  assert.deepEqual(checkPseudo('A'), { ok: false, reason: 'length' });
  assert.deepEqual(checkPseudo('x'.repeat(21)), { ok: false, reason: 'length' });
  assert.deepEqual(checkPseudo('<script>'), { ok: false, reason: 'characters' });
  assert.deepEqual(checkPseudo('Connard'), { ok: false, reason: 'blocked' });
  assert.deepEqual(checkPseudo('le Bâtard'), { ok: false, reason: 'blocked' }, 'accents ignorés');
  assert.deepEqual(checkPseudo('C.o.n.n.a.r.d'), { ok: false, reason: 'blocked' });
  assert.equal(checkPseudo('Dispute').ok, true, 'un mot qui en contient un autre reste accepté');
});

test('protocole : seuls les messages attendus passent', () => {
  assert.deepEqual(parseClientMessage('{"t":"hello","token":"abcdefghijklmnopqrstuvwx"}'), { t: 'hello', token: 'abcdefghijklmnopqrstuvwx' });
  assert.equal(parseClientMessage('{"t":"hello","token":"court"}'), null);
  assert.equal(parseClientMessage('{"t":"pirater"}'), null);
  assert.equal(parseClientMessage('pas du json'), null);
  assert.deepEqual(parseClientMessage('{"t":"action","payload":{"t":"answer","choice":2}}'), { t: 'action', payload: { t: 'answer', choice: 2 } });
});

test('périodes du tableau d’honneur à l’heure de l’établissement', () => {
  // 21 h 30 UTC = 23 h 30 à Paris le vendredi 3 ; 22 h 30 UTC = minuit 30 le samedi 4
  assert.equal(localDay(new Date('2026-07-03T21:30:00Z'), 'Europe/Paris'), '2026-07-03');
  assert.equal(localDay(new Date('2026-07-03T22:30:00Z'), 'Europe/Paris'), '2026-07-04');
  assert.equal(localDay(new Date('2026-07-04T02:00:00Z'), 'America/Guadeloupe'), '2026-07-03');
  assert.deepEqual(periodStarts(new Date('2026-07-03T12:00:00Z'), 'Europe/Paris'), { week: '2026-06-29', month: '2026-07-01' });
  assert.deepEqual(periodStarts(new Date('2026-07-05T12:00:00Z'), 'Europe/Paris'), { week: '2026-06-29', month: '2026-07-01' }); // dimanche
  assert.deepEqual(periodStarts(new Date('2026-07-06T12:00:00Z'), 'Europe/Paris'), { week: '2026-07-06', month: '2026-07-01' }); // lundi
});

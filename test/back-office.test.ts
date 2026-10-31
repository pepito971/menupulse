import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canonicalTimezone, establishmentSettingsSchema, newMemberSchema } from '../server/admin/validation.ts';
import { checkPassword, generateTemporaryPassword, hashPassword, verifyPassword } from '../server/lib/passwords.ts';
import { contrastRatio, textColorOn } from '../shared/colors.ts';
import { can, canAccessEstablishment, isWithinScope, manageableRoles } from '../shared/roles.ts';
import { SLUG_PATTERN, slugify } from '../shared/slug.ts';

test('chaque rôle a ses droits : le gérant gère les employés, pas les autres gérants', () => {
  assert.equal(can('owner', 'establishment.editSlug'), true);
  assert.equal(can('manager', 'establishment.edit'), true);
  assert.equal(can('manager', 'establishment.editSlug'), false);
  assert.equal(can('manager', 'establishment.editModules'), false);
  assert.equal(can('staff', 'establishment.view'), true);
  assert.equal(can('staff', 'establishment.edit'), false);
  assert.equal(can('staff', 'team.view'), false);
  assert.deepEqual(manageableRoles('manager'), ['staff']);
  assert.deepEqual(manageableRoles('staff'), []);
});

test('liste blanche des établissements : vide = tous, le propriétaire voit toujours tout', () => {
  assert.equal(canAccessEstablishment('staff', [], 'a'), true);
  assert.equal(canAccessEstablishment('staff', ['a'], 'a'), true);
  assert.equal(canAccessEstablishment('staff', ['a'], 'b'), false);
  assert.equal(canAccessEstablishment('owner', ['a'], 'b'), true);
});

test("un gérant limité à certains établissements ne peut pas ouvrir l'accès au-delà", () => {
  assert.equal(isWithinScope('manager', [], []), true, 'gérant de tous les établissements');
  assert.equal(isWithinScope('manager', ['a', 'b'], ['a']), true);
  assert.equal(isWithinScope('manager', ['a'], []), false, '« tous » dépasse sa propre liste');
  assert.equal(isWithinScope('manager', ['a'], ['a', 'c']), false);
  assert.equal(isWithinScope('owner', ['a'], []), true);
});

test('mots de passe : longueur minimale, provisoires lisibles, hachage Argon2id', async () => {
  assert.equal(checkPassword('court', 'a@b.fr'), 'too_short');
  assert.equal(checkPassword('x'.repeat(129), 'a@b.fr'), 'too_long');
  assert.equal(checkPassword('Camille@Bar.fr ', 'camille@bar.fr'), 'same_as_email');
  assert.equal(checkPassword('une phrase de passe', 'a@b.fr'), null);
  assert.equal(checkPassword('éééééééééééé', 'a@b.fr'), null, 'compté en caractères, pas en octets');

  const temporary = generateTemporaryPassword();
  assert.match(temporary, /^[a-hjkmnp-z2-9]{4}(-[a-hjkmnp-z2-9]{4}){3}$/);
  assert.equal(checkPassword(temporary, 'a@b.fr'), null, 'un mot de passe provisoire respecte la règle');
  assert.notEqual(generateTemporaryPassword(), temporary);

  const hash = await hashPassword('une phrase de passe');
  assert.match(hash, /^\$argon2id\$/);
  assert.equal(await verifyPassword(hash, 'une phrase de passe'), true);
  assert.equal(await verifyPassword(hash, 'une autre phrase'), false);
  assert.equal(await verifyPassword(null, 'une phrase de passe'), false, 'compte inexistant');
  assert.equal(await verifyPassword('pas-un-hachage', 'x'), false, 'hachage illisible refusé sans erreur');
});

test('couleur de marque : texte noir ou blanc, toujours lisible', () => {
  assert.equal(textColorOn('#ffffff'), '#000000');
  assert.equal(textColorOn('#1a1a2e'), '#ffffff');
  assert.equal(textColorOn('#ffd23f'), '#000000');
  assert.ok(Math.abs(contrastRatio('#000000', '#ffffff') - 21) < 1e-9);
  for (const color of ['#777777', '#ff0000', '#00ff00', '#0000ff', '#808000', '#7a7a7a']) {
    assert.ok(contrastRatio(color, textColorOn(color)) >= 4.5, color);
  }
});

test("slug : proposé d'après le nom, même règle que la base", () => {
  assert.equal(slugify("Le Comptoir d'Émile"), 'le-comptoir-d-emile');
  assert.equal(slugify('  Bœuf & Cie !! '), 'boeuf-cie');
  assert.ok(SLUG_PATTERN.test('le-comptoir'));
  for (const bad of ['ab', '-bar', 'bar-', 'bar--port', 'Bar', 'bar_port', 'x'.repeat(49)]) assert.ok(!SLUG_PATTERN.test(bad), bad);
});

test('réglages : fuseau canonique, couleur normalisée, champ inconnu refusé', () => {
  assert.equal(canonicalTimezone('europe/paris'), 'Europe/Paris');
  assert.equal(canonicalTimezone('Mars/Olympus'), null);
  const ok = establishmentSettingsSchema.safeParse({ timezone: 'america/guadeloupe', brandColor: '#FF8800', slug: 'Bar-Du-Port' });
  assert.ok(ok.success);
  assert.deepEqual(ok.data, { timezone: 'America/Guadeloupe', brandColor: '#ff8800', slug: 'bar-du-port' });
  assert.equal(establishmentSettingsSchema.safeParse({ timezone: 'Mars/Olympus' }).success, false);
  assert.equal(establishmentSettingsSchema.safeParse({ locales: ['fr', 'fr'] }).success, false);
  assert.equal(establishmentSettingsSchema.safeParse({ menuVersion: 99 }).success, false);
  assert.equal(newMemberSchema.safeParse({ email: 'pas-une-adresse', displayName: 'Lou', role: 'staff' }).success, false);
});

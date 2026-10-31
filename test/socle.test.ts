import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ALLERGENS } from '../shared/allergens.ts';
import { isHappyHourActive, localClock } from '../shared/happy-hour.ts';
import { DICTIONARIES, translate } from '../shared/i18n/index.ts';
import { LOCALES, localized, pickLocale } from '../shared/locales.ts';
import { formatPrice } from '../shared/money.ts';
import { html, jsonForScript, raw } from '../server/lib/html.ts';

test('les gabarits échappent tout par défaut', () => {
  const name = '<script>alert("x")</script> & co';
  assert.equal(html`<p title="${name}">${name}</p>`.value, '<p title="&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; co">&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; co</p>');
  assert.equal(html`<ul>${['a', 'b'].map((x) => html`<li>${x}</li>`)}</ul>`.value, '<ul><li>a</li><li>b</li></ul>');
  assert.equal(html`${raw('<b>sûr</b>')}${null}${false}`.value, '<b>sûr</b>');
});

test('les données insérées dans la page ne peuvent pas fermer la balise script', () => {
  const json = jsonForScript({ nom: '</script><script>alert(1)</script>' }).value;
  assert.ok(!json.includes('</script>'));
  assert.deepEqual(JSON.parse(json), { nom: '</script><script>alert(1)</script>' });
});

test("l'Happy Hour suit le fuseau de l'établissement", () => {
  const vendredi = [{ weekdays: [5], startsAt: '18:00', endsAt: '20:00' }];
  // vendredi 3 juillet 2026, Paris = UTC+2
  assert.equal(isHappyHourActive(vendredi, new Date('2026-07-03T17:00:00Z'), 'Europe/Paris'), true); // 19 h
  assert.equal(isHappyHourActive(vendredi, new Date('2026-07-03T18:30:00Z'), 'Europe/Paris'), false); // 20 h 30
  // Guadeloupe = UTC-4 : 22 h UTC = 18 h sur place
  assert.equal(isHappyHourActive(vendredi, new Date('2026-07-03T22:00:00Z'), 'America/Guadeloupe'), true);
  assert.deepEqual(localClock(new Date('2026-07-03T22:00:00Z'), 'America/Guadeloupe'), { weekday: 5, minutes: 18 * 60 });
});

test("une Happy Hour qui passe minuit se termine le lendemain", () => {
  const nuit = [{ weekdays: [5], startsAt: '22:00:00', endsAt: '02:00:00' }];
  assert.equal(isHappyHourActive(nuit, new Date('2026-07-03T23:00:00Z'), 'Europe/Paris'), true); // samedi 1 h
  assert.equal(isHappyHourActive(nuit, new Date('2026-07-04T20:30:00Z'), 'Europe/Paris'), false); // samedi 22 h 30
  assert.equal(isHappyHourActive([{ ...nuit[0]!, isActive: false }], new Date('2026-07-03T23:00:00Z'), 'Europe/Paris'), false);
});

test('chaque langue traduit les 14 allergènes', () => {
  for (const locale of LOCALES) {
    for (const code of ALLERGENS) {
      assert.ok(DICTIONARIES[locale][`allergen.${code}`], `${locale} : allergen.${code}`);
    }
  }
  assert.equal(translate(DICTIONARIES.fr, 'game.full', { max: 10 }), 'Cette partie est complète (10 joueurs).');
});

test('la langue servie suit le téléphone, parmi celles proposées', () => {
  assert.equal(pickLocale('en-US,en;q=0.9,fr;q=0.8', ['fr', 'en'], 'fr'), 'en');
  assert.equal(pickLocale('de-DE,en;q=0.5', ['fr', 'en'], 'fr'), 'en');
  assert.equal(pickLocale('en-US', ['fr'], 'fr'), 'fr');
  assert.equal(pickLocale(undefined, ['fr', 'en'], 'fr'), 'fr');
  assert.equal(pickLocale('fr;q=0.2,en;q=0.9', ['fr', 'en'], 'fr'), 'en');
});

test("un texte non traduit s'affiche dans la langue par défaut, avec sa langue réelle", () => {
  assert.deepEqual(localized({ fr: 'Planche mixte' }, 'en', 'fr'), { text: 'Planche mixte', lang: 'fr' });
  assert.deepEqual(localized({ fr: 'Planche', en: 'Platter' }, 'en', 'fr'), { text: 'Platter', lang: 'en' });
  assert.equal(localized({}, 'en', 'fr'), null);
});

test('les prix sont formatés depuis des centimes', () => {
  assert.equal(formatPrice(650, 'fr').replace(/\s/g, ' '), '6,50 €');
  assert.equal(formatPrice(650, 'en'), '€6.50');
});

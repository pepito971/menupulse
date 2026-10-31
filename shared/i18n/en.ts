import type { MessageKey } from './fr.ts';

export const en = {
  'allergen.gluten': 'Cereals containing gluten',
  'allergen.crustaces': 'Crustaceans',
  'allergen.oeufs': 'Eggs',
  'allergen.poissons': 'Fish',
  'allergen.arachides': 'Peanuts',
  'allergen.soja': 'Soybeans',
  'allergen.lait': 'Milk',
  'allergen.fruits_a_coque': 'Nuts',
  'allergen.celeri': 'Celery',
  'allergen.moutarde': 'Mustard',
  'allergen.sesame': 'Sesame seeds',
  'allergen.sulfites': 'Sulphur dioxide and sulphites',
  'allergen.lupin': 'Lupin',
  'allergen.mollusques': 'Molluscs',

  'diet.vegetarien': 'Vegetarian',
  'diet.vegan': 'Vegan',

  'choice.title': 'What would you like to see?',
  'choice.tapsy': 'Bar menu',
  'choice.tableo': 'Restaurant menu',

  'menu.allergens': 'Allergens',
  'menu.mayContain': 'May contain traces of',
  'menu.filters': 'Filters',
  'menu.unavailable': 'Sold out',
  'menu.happyHour': 'Happy Hour',
  'menu.board': "Today's specials",
  'menu.allergenNotice': 'Allergens are listed on each item. If in doubt, please ask our staff.',

  'game.join': 'Join the game',
  'game.pseudo': 'Your nickname',
  'game.full': 'This game is full ({max} players).',
  'game.hallOfFameConsent': 'Show my nickname on the hall of fame if I win',
  'game.hallOfFame': 'Hall of fame',
} satisfies Record<MessageKey, string>;

// Dictionnaire de référence : toute clé ajoutée ici doit exister dans les autres langues
// (sinon `satisfies Dict` y provoque une erreur de compilation). Côté clients : vouvoiement.
export const fr = {
  'allergen.gluten': 'Céréales contenant du gluten',
  'allergen.crustaces': 'Crustacés',
  'allergen.oeufs': 'Œufs',
  'allergen.poissons': 'Poissons',
  'allergen.arachides': 'Arachides',
  'allergen.soja': 'Soja',
  'allergen.lait': 'Lait',
  'allergen.fruits_a_coque': 'Fruits à coque',
  'allergen.celeri': 'Céleri',
  'allergen.moutarde': 'Moutarde',
  'allergen.sesame': 'Graines de sésame',
  'allergen.sulfites': 'Anhydride sulfureux et sulfites',
  'allergen.lupin': 'Lupin',
  'allergen.mollusques': 'Mollusques',

  'diet.vegetarien': 'Végétarien',
  'diet.vegan': 'Végan',

  'choice.title': 'Que souhaitez-vous consulter ?',
  'choice.tapsy': 'La carte du bar',
  'choice.tableo': 'La carte du restaurant',

  'menu.allergens': 'Allergènes',
  'menu.mayContain': 'Peut contenir des traces de',
  'menu.filters': 'Filtres',
  'menu.unavailable': 'Épuisé',
  'menu.happyHour': 'Happy Hour',
  'menu.board': 'Ardoise du jour',
  'menu.allergenNotice': "Les allergènes sont indiqués sur chaque fiche. En cas de doute, demandez à l'équipe.",

  'game.join': 'Rejoindre la partie',
  'game.pseudo': 'Votre pseudo',
  'game.full': 'Cette partie est complète ({max} joueurs).',
  'game.hallOfFameConsent': "Afficher mon pseudo au tableau d'honneur si je gagne",
  'game.hallOfFame': "Tableau d'honneur",
} as const;

export type MessageKey = keyof typeof fr;

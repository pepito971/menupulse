// Les 14 allergènes à déclarer (règlement INCO 1169/2011, annexe II). Ce sont des CODES, jamais du
// texte libre : leur nom affiché vient des dictionnaires (traductions officielles de l'annexe II),
// donc une traduction automatique des descriptions ne peut jamais altérer une information allergène.
export const ALLERGENS = [
  'gluten',
  'crustaces',
  'oeufs',
  'poissons',
  'arachides',
  'soja',
  'lait',
  'fruits_a_coque',
  'celeri',
  'moutarde',
  'sesame',
  'sulfites',
  'lupin',
  'mollusques',
] as const;
export type Allergen = (typeof ALLERGENS)[number];

export const DIETS = ['vegetarien', 'vegan'] as const;
export type Diet = (typeof DIETS)[number];

// Indices de la Boisson Mystère, construits à partir de la fiche du produit (aucun texte à rédiger par
// l'établissement) : du plus vague au plus précis. Pur et testé.
import { LOCALES, localized, type Locale, type Localized } from '../../../shared/locales.ts';

export interface DrinkForGame {
  id: string;
  name: Localized;
  category: Localized | null;
  abv: number | null;
  ibu?: number;
  style?: string;
  origin?: string;
  tastingNotes?: Localized;
}

const MESSAGES = {
  fr: {
    category: 'On la trouve dans notre carte « {category} ».',
    style: 'Style : {style}.',
    generic: 'C’est une boisson de notre carte.',
    alcoholFree: 'Elle est sans alcool.',
    abv: 'Elle titre {abv} % vol.',
    ibu: 'Amertume : {ibu} IBU.',
    origin: 'Origine : {origin}.',
    tasting: 'En bouche : {notes}',
    letters: 'Son nom commence par « {letter} » et compte {count} lettres.',
    reward: '-{percent} % sur « {product} »',
  },
  en: {
    category: 'You will find it in our “{category}” menu.',
    style: 'Style: {style}.',
    generic: 'It is a drink from our menu.',
    alcoholFree: 'It is alcohol-free.',
    abv: 'It is {abv}% ABV.',
    ibu: 'Bitterness: {ibu} IBU.',
    origin: 'Origin: {origin}.',
    tasting: 'Tasting notes: {notes}',
    letters: 'Its name starts with “{letter}” and has {count} letters.',
    reward: '{percent}% off “{product}”',
  },
} satisfies Record<Locale, Record<string, string>>;

type MessageKey = keyof (typeof MESSAGES)['fr'];

function format(locale: Locale, key: MessageKey, params: Record<string, string | number> = {}): string {
  return MESSAGES[locale][key].replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

function nameIn(drink: DrinkForGame, locale: Locale): string {
  return localized(drink.name, locale, 'fr')?.text ?? localized(drink.name, locale, 'en')?.text ?? '';
}

function hintsIn(drink: DrinkForGame, locale: Locale): [string, string, string] {
  const category = drink.category ? localized(drink.category, locale, 'fr')?.text : undefined;
  const first = [category ? format(locale, 'category', { category }) : format(locale, 'generic'), drink.style ? format(locale, 'style', { style: drink.style }) : '']
    .filter(Boolean)
    .join(' ');

  const details: string[] = [];
  if (drink.abv === 0) details.push(format(locale, 'alcoholFree'));
  else if (drink.abv !== null) details.push(format(locale, 'abv', { abv: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(drink.abv) }));
  if (drink.ibu !== undefined) details.push(format(locale, 'ibu', { ibu: drink.ibu }));
  if (drink.origin) details.push(format(locale, 'origin', { origin: drink.origin }));
  const notes = drink.tastingNotes ? localized(drink.tastingNotes, locale, 'fr')?.text : undefined;
  if (notes) details.push(format(locale, 'tasting', { notes }));
  const second = details.length > 0 ? details.join(' ') : format(locale, 'generic');

  const name = nameIn(drink, locale);
  const letters = [...name].filter((char) => /\p{L}/u.test(char));
  const third = format(locale, 'letters', { letter: (letters[0] ?? '?').toLocaleUpperCase(locale), count: letters.length });
  return [first, second, third];
}

/** Les trois indices, dans chaque langue de l'interface. */
export function buildHints(drink: DrinkForGame): [Localized, Localized, Localized] {
  const perLocale = Object.fromEntries(LOCALES.map((locale) => [locale, hintsIn(drink, locale)])) as Record<Locale, [string, string, string]>;
  return [0, 1, 2].map((i) => Object.fromEntries(LOCALES.map((locale) => [locale, perLocale[locale][i]]))) as [Localized, Localized, Localized];
}

/** Libellé du bon gagné : « -20 % sur « Mango Fizz » ». */
export function rewardLabel(name: Localized, percent: number): Localized {
  return Object.fromEntries(
    LOCALES.map((locale) => [locale, format(locale, 'reward', { percent, product: localized(name, locale, 'fr')?.text ?? localized(name, locale, 'en')?.text ?? '' })]),
  );
}

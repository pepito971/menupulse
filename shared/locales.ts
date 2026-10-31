// Langues de l'interface proposées aux clients. Ajouter une langue : l'ajouter ici, écrire son
// dictionnaire (shared/i18n/), puis régénérer les migrations (les contraintes CHECK en dépendent).
export const LOCALES = ['fr', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'fr';

/** Texte saisi par l'établissement, une valeur par langue : { fr: '…', en: '…' }. */
export type Localized = Partial<Record<Locale, string>>;

/** Où en est la traduction d'une langue : 'auto' = traduction automatique pas encore relue. */
export type TranslationStatus = Partial<Record<Locale, 'auto' | 'reviewed'>>;

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * Langue à servir d'après l'en-tête Accept-Language, parmi celles proposées par l'établissement.
 * « en-US » compte comme « en » ; à défaut, la langue par défaut de l'établissement.
 */
export function pickLocale(acceptLanguage: string | undefined, available: readonly Locale[], fallback: Locale): Locale {
  if (!acceptLanguage) return fallback;
  const wanted = acceptLanguage
    .split(',')
    .map((part, index) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      return { lang: tag.toLowerCase().split('-')[0] ?? '', q: q ? Number(q.slice(2)) : 1, index };
    })
    .filter((entry) => entry.lang && Number.isFinite(entry.q) && entry.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  for (const { lang } of wanted) {
    if (isLocale(lang) && available.includes(lang)) return lang;
  }
  return fallback;
}

/**
 * Texte d'un champ localisé dans la langue demandée, sinon dans la langue par défaut.
 * `lang` indique la langue réellement affichée : à poser en attribut lang="" quand elle diffère
 * de celle de la page, pour qu'un lecteur d'écran la prononce correctement.
 */
export function localized(value: Localized | null | undefined, locale: Locale, fallback: Locale): { text: string; lang: Locale } | null {
  const own = value?.[locale]?.trim();
  if (own) return { text: own, lang: locale };
  const other = value?.[fallback]?.trim();
  if (other) return { text: other, lang: fallback };
  return null;
}

// Slug d'un établissement : son adresse publique (/c/<slug>), imprimée en QR code. Même règle que la
// contrainte CHECK de la base, plus ni tiret au début ou à la fin, ni tirets doublés.
export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9]|-(?!-)){1,46}[a-z0-9]$/;

/** Slug proposé d'après le nom (« Le Comptoir d'Émile » → « le-comptoir-d-emile »), à faire valider. */
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '') // accents, détachés des lettres par NFD
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 48)
    .replace(/^-+|-+$/g, '');
}

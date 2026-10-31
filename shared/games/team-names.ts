// Nom d'équipe d'une table pour la soirée (« Les Apéros Futés »). Tiré d'une liste, stable pour une
// table et un jour donnés : recharger la page ou revenir plus tard dans la soirée garde le même nom.
import type { Localized } from '../locales.ts';

export const TEAM_NAMES: readonly Localized[] = [
  { fr: 'Les Apéros Futés', en: 'The Clever Sippers' },
  { fr: 'Les Rois du Zinc', en: 'The Bar Top Kings' },
  { fr: 'Les Bulles Rebelles', en: 'The Rebel Bubbles' },
  { fr: 'Les Tireurs de Pression', en: 'The Draft Pullers' },
  { fr: 'Les Glaçons Givrés', en: 'The Frosty Cubes' },
  { fr: 'Les As du Comptoir', en: 'The Counter Aces' },
  { fr: 'Les Mousses Malicieuses', en: 'The Cheeky Foam' },
  { fr: 'Les Zestes Joyeux', en: 'The Happy Zests' },
  { fr: 'Les Shakers Fous', en: 'The Wild Shakers' },
  { fr: 'Les Tchin Tchin', en: 'The Cheers Crew' },
  { fr: 'Les Cacahuètes Sauvages', en: 'The Wild Peanuts' },
  { fr: 'Les Sous-Bocks', en: 'The Coasters' },
];

/** Index stable (FNV-1a) pour une table et un jour. */
export function teamNameIndex(tableId: string, day: string): number {
  let hash = 0x811c9dc5;
  for (const char of `${tableId}:${day}`) {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % TEAM_NAMES.length;
}

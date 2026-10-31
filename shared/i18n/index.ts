// Tous les dictionnaires de l'interface. Réservé au serveur, qui insère dans la page celui de la
// langue servie (aucune requête de plus) ; le navigateur n'importe que translate.ts.
import type { Locale } from '../locales.ts';
import { en } from './en.ts';
import { fr, type MessageKey } from './fr.ts';
import type { Dict } from './translate.ts';

export type { Dict, MessageKey };
export { translate } from './translate.ts';

export const DICTIONARIES: Record<Locale, Dict> = { fr, en };

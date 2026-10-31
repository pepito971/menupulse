// Séparé des dictionnaires : le navigateur importe cette fonction sans embarquer toutes les langues.
import type { MessageKey } from './fr.ts';

export type Dict = Record<MessageKey, string>;

/** « Cette partie est complète ({max} joueurs). » + { max: 10 } → « … (10 joueurs). » */
export function translate(dict: Dict, key: MessageKey, params?: Record<string, string | number>): string {
  const text = dict[key];
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

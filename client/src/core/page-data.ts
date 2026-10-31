// Données insérées par le serveur dans la page (#page-data) : langue, dictionnaire, et ce que la page
// ajoute. Évite toute requête au chargement.
import { translate, type Dict } from '../../../shared/i18n/translate.ts';
import type { MessageKey } from '../../../shared/i18n/fr.ts';
import type { Locale } from '../../../shared/locales.ts';

export interface PageData {
  locale: Locale;
  messages: Dict;
}

export function readPageData<Extra extends object = object>(): PageData & Extra {
  const element = document.getElementById('page-data');
  return JSON.parse(element?.textContent ?? '{}') as PageData & Extra;
}

export type Translator = (key: MessageKey, params?: Record<string, string | number>) => string;

export function createTranslator(messages: Dict): Translator {
  return (key, params) => translate(messages, key, params);
}

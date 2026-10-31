// Rendu d'une page : le gabarit construit par Vite (client/<page>.html) reçoit la langue, le <head>
// (titre, données de la page, dictionnaire) et le corps rendus ici. En développement, le gabarit est
// relu et transformé par Vite à chaque requête ; en production, lu une fois depuis dist/client.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ViteDevServer } from 'vite';
import { DICTIONARIES } from '../../shared/i18n/index.ts';
import type { Locale } from '../../shared/locales.ts';
import { escapeHtml, html, jsonForScript, type SafeHtml } from './html.ts';

export type PageName = 'tapsy' | 'tableo';

export interface PageParts {
  lang: Locale;
  title: string;
  theme?: 'light' | 'dark' | null;
  head?: SafeHtml;
  body: SafeHtml;
  data?: unknown; // lu côté client dans #page-data
}

export function createPageRenderer(options: { clientDir: string; distDir: string; vite?: ViteDevServer }) {
  const cache = new Map<PageName, string>();

  async function template(name: PageName, url: string): Promise<string> {
    if (options.vite) {
      const source = await readFile(join(options.clientDir, `${name}.html`), 'utf8');
      return options.vite.transformIndexHtml(url, source);
    }
    let cached = cache.get(name);
    if (!cached) {
      cached = await readFile(join(options.distDir, `${name}.html`), 'utf8');
      cache.set(name, cached);
    }
    return cached;
  }

  return async function renderPage(name: PageName, url: string, parts: PageParts): Promise<string> {
    const pageData = { locale: parts.lang, messages: DICTIONARIES[parts.lang], ...((parts.data as object | undefined) ?? {}) };
    const head = html`<title>${parts.title}</title>${parts.head ?? ''}<script type="application/json" id="page-data">${jsonForScript(pageData)}</script>`;
    const htmlAttributes = `<html lang="${escapeHtml(parts.lang)}"${parts.theme ? ` data-theme="${parts.theme}"` : ''}`;
    // remplacements par FONCTION : une chaîne de remplacement interpréterait « $& », « $1 »… contenus
    // dans les données (un prix, un nom de plat) et corromprait la page
    return (await template(name, url))
      .replace('<html lang="fr"', () => htmlAttributes)
      .replace('<!--app-head-->', () => head.value)
      .replace('<!--app-html-->', () => parts.body.value);
  };
}

export type RenderPage = ReturnType<typeof createPageRenderer>;

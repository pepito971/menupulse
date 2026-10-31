import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { ViteDevServer } from 'vite';
import { ALLERGENS } from '../shared/allergens.ts';
import { DICTIONARIES } from '../shared/i18n/index.ts';
import { DEFAULT_LOCALE, isLocale } from '../shared/locales.ts';
import { formatPrice } from '../shared/money.ts';
import { createApp, errorHandler } from './app.ts';
import { runMigrations } from './db/migrate.ts';
import { html } from './lib/html.ts';
import { createPageRenderer } from './lib/pages.ts';

const isProduction = process.env.NODE_ENV === 'production';
const useVite = process.argv.includes('--vite');
const port = Number(process.env.PORT ?? 3100);
const clientDir = fileURLToPath(new URL('../client', import.meta.url));
const distDir = fileURLToPath(new URL('../dist/client', import.meta.url));

const sessionSecret = process.env.SESSION_SECRET;
if (isProduction && !sessionSecret) {
  console.error('SESSION_SECRET manquant : le serveur refuse de démarrer en production sans lui.');
  process.exit(1);
}
if (!useVite && !existsSync(join(distDir, 'tapsy.html'))) {
  console.error("Front non construit (dist/client absent) : lancer `npm run build`, ou `npm run dev` en développement.");
  process.exit(1);
}

await runMigrations();

const app = createApp({
  isProduction,
  sessionSecret: sessionSecret || 'secret-de-developpement-uniquement',
  allowedOrigins: [process.env.APP_ORIGIN ?? `http://localhost:${port}`],
});
const server = createServer(app);

let vite: ViteDevServer | undefined;
if (useVite) {
  const { createServer: createViteServer } = await import('vite');
  vite = await createViteServer({
    configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
    // le rechargement à chaud partage ce serveur HTTP : le futur serveur WebSocket des jeux ne devra
    // traiter QUE /ws et ignorer (sans les fermer) les autres demandes d'upgrade
    server: { middlewareMode: true, hmr: { server } },
    appType: 'custom',
  });
  app.use(vite.middlewares);
} else {
  app.use('/assets', express.static(join(distDir, 'assets'), { immutable: true, maxAge: '1y', index: false }));
  app.get('/sw.js', (_req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(join(distDir, 'sw.js'));
  });
}

const renderPage = createPageRenderer({ clientDir, distDir, vite });

// Aperçu de développement du rendu serveur (gabarit Vite + langue + dictionnaire inséré) ; à retirer
// quand les vraies pages /c/:slug existeront.
if (!isProduction) {
  app.get('/apercu/:module/:lang', async (req, res) => {
    const module = req.params.module;
    if (module !== 'tapsy' && module !== 'tableo') {
      res.status(404).send('Module inconnu.');
      return;
    }
    const lang = isLocale(req.params.lang) ? req.params.lang : DEFAULT_LOCALE;
    const t = DICTIONARIES[lang];
    const allergens = ALLERGENS.slice(0, 3).map((code) => html`<li>${t[`allergen.${code}`]}</li>`);
    const body = html`<main class="page">
      <h1>${module === 'tapsy' ? 'Tapsy' : 'Tableo'}</h1>
      <p>${t['menu.allergenNotice']}</p>
      <h2>${t['menu.allergens']}</h2>
      <ul>${allergens}</ul>
      <p>${formatPrice(650, lang)}</p>
    </main>`;
    res.type('html').send(await renderPage(module, req.originalUrl, { lang, title: `Aperçu ${module}`, body }));
  });
}

app.use(errorHandler);

server.listen(port, () => {
  console.log(`Menupulse sur http://localhost:${port}${useVite ? ' (Vite en développement)' : ''}`);
});

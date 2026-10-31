import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { ViteDevServer } from 'vite';
import { ALLERGENS } from '../shared/allergens.ts';
import { DICTIONARIES } from '../shared/i18n/index.ts';
import { DEFAULT_LOCALE, isLocale, pickLocale } from '../shared/locales.ts';
import { formatPrice } from '../shared/money.ts';
import { createApp, errorHandler } from './app.ts';
import { pool } from './db/client.ts';
import { runMigrations } from './db/migrate.ts';
import { dbGameStore } from './games/db-store.ts';
import { attachGameSocket } from './games/engine/hub.ts';
import { GameRooms } from './games/game-rooms.ts';
import { GAMES_BY_ID } from './games/registry.ts';
import { html } from './lib/html.ts';
import { createPageRenderer } from './lib/pages.ts';
import { createPlayRouter } from './routes/play.ts';

const isProduction = process.env.NODE_ENV === 'production';
const useVite = process.argv.includes('--vite');
const port = Number(process.env.PORT ?? 3100);
const clientDir = fileURLToPath(new URL('../client', import.meta.url));
const distDir = fileURLToPath(new URL('../dist/client', import.meta.url));
const allowedOrigins = [process.env.APP_ORIGIN ?? `http://localhost:${port}`];

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
const interrupted = await dbGameStore.closeInterruptedSessions();
if (interrupted > 0) console.log(`[jeux] ${interrupted} partie(s) interrompue(s) par le dernier arrêt du serveur`);

const rooms = new GameRooms({ store: dbGameStore, definitions: GAMES_BY_ID });

const app = createApp({
  isProduction,
  sessionSecret: sessionSecret || 'secret-de-developpement-uniquement',
  allowedOrigins,
  mountApi: (api) => {
    api.use('/api/play', createPlayRouter(rooms));
  },
});
const server = createServer(app);
const gameSocket = attachGameSocket(server, rooms, { allowedOrigins, leaveOtherUpgrades: useVite });

let vite: ViteDevServer | undefined;
if (useVite) {
  const { createServer: createViteServer } = await import('vite');
  vite = await createViteServer({
    configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
    // le rechargement à chaud partage ce serveur HTTP : le serveur des jeux ne traite que /ws
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

// Jeux d'une table (QR code de la table). La langue est dans l'URL : sans elle, celle du téléphone.
app.get('/jouer/:table', async (req, res) => {
  const table = await dbGameStore.findTable(req.params.table);
  const lang = pickLocale(req.get('accept-language'), table?.locales ?? ['fr'], table?.defaultLocale ?? DEFAULT_LOCALE);
  res.redirect(302, `/jouer/${encodeURIComponent(req.params.table)}/${lang}`);
});

app.get('/jouer/:table/:lang', async (req, res) => {
  const lang = isLocale(req.params.lang) ? req.params.lang : DEFAULT_LOCALE;
  const t = DICTIONARIES[lang];
  const table = await dbGameStore.findTable(req.params.table);
  if (!table || !table.tapsyActive) {
    const body = html`<main class="page"><h1>Tapsy</h1><p>${t['game.tableUnknown']}</p></main>`;
    res.status(404).type('html').send(await renderPage('tapsy', req.originalUrl, { lang, title: 'Tapsy', body }));
    return;
  }
  const body = html`<main class="game-app">
      <header class="game-header">
        <p class="game-venue">${table.establishmentName}</p>
        <p class="game-table">${t['game.table']} ${table.label}</p>
      </header>
      <div id="game-root" class="game-root" aria-live="polite">
        ${table.gamesOpen ? html`<p class="game-loading">${t['game.loading']}</p>` : html`<p class="game-notice">${t['game.closed']}</p>`}
      </div>
      <noscript><p class="game-notice">${t['game.noscript']}</p></noscript>
      <footer class="game-footer">${t['game.poweredBy']}</footer>
    </main>`;
  res.type('html').send(
    await renderPage('tapsy', req.originalUrl, {
      lang,
      title: `${table.establishmentName} — ${t['game.title']}`,
      body,
      data: table.gamesOpen ? { screen: 'game', table: req.params.table, tableLabel: table.label } : { screen: 'closed' },
    }),
  );
});

// Aperçu de développement du rendu serveur ; à retirer quand les vraies pages /c/:slug existeront.
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

// Arrêt propre (redéploiement) : parties abandonnées et enregistrées comme telles, connexions fermées.
let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  console.log(`[serveur] ${signal} reçu : arrêt`);
  rooms.shutdown();
  gameSocket.close();
  await vite?.close();
  server.close(() => {
    void pool.end().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

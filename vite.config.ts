import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  root: fromRoot('./client'),
  // le serveur Express sert lui-même les pages (rendues côté serveur à partir de ces gabarits)
  appType: 'custom',
  build: {
    outDir: fromRoot('./dist/client'),
    emptyOutDir: true,
    target: 'es2022',
    manifest: true, // lu par scripts/check-budget.ts
    modulePreload: { polyfill: false }, // inutile sur les navigateurs ciblés : octets économisés
    rollupOptions: {
      input: {
        tapsy: fromRoot('./client/tapsy.html'),
        tableo: fromRoot('./client/tableo.html'),
        sw: fromRoot('./client/src/sw/sw.ts'),
      },
      output: {
        // le Service Worker garde un nom fixe à la racine (portée « / ») ; le reste est haché et immuable
        entryFileNames: (chunk) => (chunk.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
});

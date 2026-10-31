import { defineConfig } from 'drizzle-kit';

try {
  process.loadEnvFile();
} catch {
  // pas de .env en production : les variables sont injectées par l'hébergeur
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './server/db/schema.ts',
  out: './server/db/migrations',
  casing: 'snake_case', // à garder identique dans drizzle({ casing: 'snake_case' }) (server/db/client.ts)
  strict: true,
  verbose: true,
  tablesFilter: ['!session'], // table de connect-pg-simple, hors du schéma Drizzle
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
});

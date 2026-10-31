// Applique les migrations Drizzle (server/db/migrations/). Appelé au démarrage du serveur, ou seul
// via `npm run db:migrate`.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './client.ts';

const migrationsFolder = fileURLToPath(new URL('./migrations', import.meta.url));

export async function runMigrations(): Promise<void> {
  await migrate(db, { migrationsFolder });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await runMigrations();
    console.log('Migrations appliquées.');
  } finally {
    await pool.end();
  }
}

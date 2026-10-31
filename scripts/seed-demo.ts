// Données de démonstration : « Le Comptoir Démo » (/jouer/demo-table-1), deux tables, quelques boissons,
// Happy Hour toute la journée, jeux commerciaux activés, et trois comptes du back-office (un par rôle).
// Rejouable : l'établissement et les comptes sont recréés.
// Usage : node --env-file-if-exists=.env scripts/seed-demo.ts
import { eq, inArray } from 'drizzle-orm';
import { db, pool } from '../server/db/client.ts';
import { runMigrations } from '../server/db/migrate.ts';
import {
  categories,
  diningTables,
  establishmentGames,
  establishmentModules,
  establishments,
  happyHours,
  memberEstablishments,
  organizationMembers,
  organizations,
  products,
  users,
} from '../server/db/schema.ts';
import { hashPassword } from '../server/lib/passwords.ts';

await runMigrations();

const [existing] = await db.select({ organizationId: establishments.organizationId }).from(establishments).where(eq(establishments.slug, 'demo'));
if (existing) await db.delete(organizations).where(eq(organizations.id, existing.organizationId)); // cascade

// Mot de passe connu de tous : démonstration en local seulement
const DEMO_PASSWORD = 'comptoir-demo';
const DEMO_ACCOUNTS = [
  { email: 'proprietaire@demo.menupulse.fr', displayName: 'Camille (propriétaire)', role: 'owner' },
  { email: 'gerant@demo.menupulse.fr', displayName: 'Sam (gérant)', role: 'manager' },
  { email: 'serveur@demo.menupulse.fr', displayName: 'Lou (serveur)', role: 'staff' },
] as const;
await db.delete(users).where(inArray(users.email, DEMO_ACCOUNTS.map((a) => a.email)));

const [organization] = await db.insert(organizations).values({ name: 'Démo Menupulse' }).returning();
const [venue] = await db
  .insert(establishments)
  .values({
    organizationId: organization!.id,
    slug: 'demo',
    name: 'Le Comptoir Démo',
    timezone: 'Europe/Paris',
    defaultLocale: 'fr',
    locales: ['fr', 'en'],
    gamesOpenUntil: new Date(Date.now() + 365 * 24 * 3600 * 1000),
  })
  .returning();
const establishmentId = venue!.id;

await db.insert(establishmentModules).values([
  { establishmentId, module: 'tapsy' },
  { establishmentId, module: 'tableo' },
]);
await db.insert(diningTables).values([
  { establishmentId, label: 'T1', qrToken: 'demo-table-1' },
  { establishmentId, label: 'T2', qrToken: 'demo-table-2' },
]);

const [softs, beers] = await db
  .insert(categories)
  .values([
    { establishmentId, module: 'tapsy', name: { fr: 'Softs & mocktails', en: 'Soft drinks & mocktails' }, position: 0 },
    { establishmentId, module: 'tapsy', name: { fr: 'Bières pression', en: 'Draught beers' }, position: 1 },
  ])
  .returning();

const drink = (categoryId: string, fr: string, en: string, priceCents: number, abv: number, details = {}) => ({
  establishmentId,
  categoryId,
  kind: 'drink' as const,
  name: { fr, en },
  priceCents,
  abv,
  details,
});

await db.insert(products).values([
  drink(softs!.id, 'Mango Fizz', 'Mango Fizz', 650, 0, { tastingNotes: { fr: 'Mangue, citron vert, bulles.', en: 'Mango, lime, bubbles.' } }),
  drink(softs!.id, 'Virgin Mojito', 'Virgin Mojito', 700, 0, { tastingNotes: { fr: 'Menthe fraîche et citron vert.', en: 'Fresh mint and lime.' } }),
  drink(softs!.id, 'Thé glacé maison', 'Homemade iced tea', 450, 0, { origin: 'Ceylan' }),
  drink(softs!.id, 'Limonade artisanale', 'Craft lemonade', 400, 0, { origin: 'Bretagne' }),
  drink(softs!.id, 'Jus de goyave', 'Guava juice', 450, 0),
  drink(softs!.id, 'Ginger beer', 'Ginger beer', 500, 0, { tastingNotes: { fr: 'Gingembre piquant.', en: 'Spicy ginger.' } }),
  drink(beers!.id, 'Blonde du Comptoir', 'House lager', 600, 5, { ibu: 18, style: 'Lager' }),
  drink(beers!.id, 'IPA Tropicale', 'Tropical IPA', 750, 6.5, { ibu: 55, style: 'IPA' }),
]);

// Démonstration : Happy Hour toute la journée pour pouvoir essayer le Jack-Pot à toute heure
await db.insert(happyHours).values({ establishmentId, weekdays: [1, 2, 3, 4, 5, 6, 7], startsAt: '00:00', endsAt: '23:59' });

await db.insert(establishmentGames).values([
  { establishmentId, gameId: 'boisson-mystere', isEnabled: true, settings: { discountPercent: 20 } },
  { establishmentId, gameId: 'jackpot-happy-hour', isEnabled: true, settings: { winRate: 0.5, maxWinsPerDay: 20 } },
]);

const passwordHash = await hashPassword(DEMO_PASSWORD);
const accounts = await db
  .insert(users)
  .values(DEMO_ACCOUNTS.map(({ email, displayName }) => ({ email, displayName, passwordHash })))
  .returning({ id: users.id, email: users.email });
await db.insert(organizationMembers).values(
  DEMO_ACCOUNTS.map(({ email, role }) => ({ organizationId: organization!.id, userId: accounts.find((a) => a.email === email)!.id, role })),
);
// le serveur n'a accès qu'à cet établissement (liste blanche)
const staff = accounts.find((a) => a.email === 'serveur@demo.menupulse.fr')!;
await db.insert(memberEstablishments).values({ organizationId: organization!.id, userId: staff.id, establishmentId });

console.log('Démonstration prête : http://localhost:3100/jouer/demo-table-1');
console.log(`Back-office : ${DEMO_ACCOUNTS.map((a) => a.email).join(', ')} — mot de passe « ${DEMO_PASSWORD} »`);
await pool.end();

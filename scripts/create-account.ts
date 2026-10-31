// Crée le compte d'un propriétaire, en attendant l'inscription en ligne : une nouvelle organisation, ou
// un propriétaire de plus dans une organisation existante. Affiche le mot de passe provisoire (à changer
// à la première connexion), qui n'est stocké nulle part.
// Usage :
//   npm run account:create -- --email gerant@bar.fr --name "Camille Martin" --organization "Bar du Port"
//   npm run account:create -- --email associe@bar.fr --name "Sam Leroy" --organization-id <uuid>
import { parseArgs } from 'node:util';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, pool } from '../server/db/client.ts';
import { runMigrations } from '../server/db/migrate.ts';
import { organizationMembers, organizations } from '../server/db/schema.ts';
import { createUserWithTemporaryPassword, findUserByEmail } from '../server/admin/accounts.ts';

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    name: { type: 'string' },
    organization: { type: 'string' },
    'organization-id': { type: 'string' },
  },
});

const input = z
  .object({
    email: z.email(),
    name: z.string().trim().min(1).max(60),
    organization: z.string().trim().min(1).max(80).optional(),
    'organization-id': z.uuid().optional(),
  })
  .refine((v) => Boolean(v.organization) !== Boolean(v['organization-id']), 'Indiquer --organization OU --organization-id.')
  .safeParse(values);

if (!input.success) {
  console.error(input.error.issues.map((issue) => `${issue.path.join('.') || 'arguments'} : ${issue.message}`).join('\n'));
  console.error('Usage : npm run account:create -- --email <email> --name "<nom>" (--organization "<nom>" | --organization-id <uuid>)');
  process.exit(1);
}

try {
  await runMigrations();
  if (await findUserByEmail(input.data.email)) throw new Error(`Un compte existe déjà avec l'adresse ${input.data.email}.`);
  const { organizationId, temporaryPassword } = await db.transaction(async (tx) => {
    let organizationId = input.data['organization-id'];
    if (organizationId) {
      const [existing] = await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, organizationId));
      if (!existing) throw new Error(`Organisation inconnue : ${organizationId}.`);
    } else {
      const [created] = await tx.insert(organizations).values({ name: input.data.organization! }).returning({ id: organizations.id });
      organizationId = created!.id;
    }
    const account = await createUserWithTemporaryPassword(tx, { email: input.data.email, displayName: input.data.name });
    await tx.insert(organizationMembers).values({ organizationId, userId: account.user.id, role: 'owner' });
    return { organizationId, temporaryPassword: account.temporaryPassword };
  });
  console.log(`Compte propriétaire créé : ${input.data.email} (organisation ${organizationId})`);
  console.log(`Mot de passe provisoire, à changer à la première connexion : ${temporaryPassword}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}

// Comptes du back-office : utilisateurs, appartenance aux organisations, établissements accessibles.
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { canAccessEstablishment, type Role } from '../../shared/roles.ts';
import { db } from '../db/client.ts';
import { establishmentModules, establishments, memberEstablishments, organizationMembers, organizations, users } from '../db/schema.ts';
import { generateTemporaryPassword, hashPassword } from '../lib/passwords.ts';

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  passwordChangeRequired: boolean;
}

export interface Membership {
  organizationId: string;
  organizationName: string;
  role: Role;
  /** Liste blanche des établissements accessibles ; vide = tous ceux de l'organisation. */
  restrictedTo: string[];
}

const sessionUserColumns = {
  id: users.id,
  email: users.email,
  displayName: users.displayName,
  passwordChangeRequired: users.passwordChangeRequired,
};

export async function loadSessionUser(userId: string): Promise<SessionUser | null> {
  const [user] = await db.select(sessionUserColumns).from(users).where(eq(users.id, userId));
  return user ?? null;
}

export async function loadPasswordHash(userId: string): Promise<string | null> {
  const [user] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, userId));
  return user?.passwordHash ?? null;
}

export async function findUserByEmail(email: string): Promise<(SessionUser & { passwordHash: string }) | null> {
  const [user] = await db
    .select({ ...sessionUserColumns, passwordHash: users.passwordHash })
    .from(users)
    .where(sql`lower(${users.email}) = lower(${email.trim()})`);
  return user ?? null;
}

/** Appartenances d'un utilisateur, à une organisation précise ou à toutes (organisations supprimées exclues). */
export async function loadMemberships(userId: string, organizationId?: string): Promise<Membership[]> {
  const rows = await db
    .select({ organizationId: organizationMembers.organizationId, organizationName: organizations.name, role: organizationMembers.role })
    .from(organizationMembers)
    .innerJoin(organizations, and(eq(organizations.id, organizationMembers.organizationId), isNull(organizations.deletedAt)))
    .where(and(eq(organizationMembers.userId, userId), organizationId ? eq(organizationMembers.organizationId, organizationId) : undefined))
    .orderBy(asc(organizations.name));
  if (rows.length === 0) return [];
  const restrictions = await db
    .select({ organizationId: memberEstablishments.organizationId, establishmentId: memberEstablishments.establishmentId })
    .from(memberEstablishments)
    .where(
      and(
        eq(memberEstablishments.userId, userId),
        inArray(memberEstablishments.organizationId, rows.map((row) => row.organizationId)),
      ),
    );
  return rows.map((row) => ({
    ...row,
    restrictedTo: restrictions.filter((r) => r.organizationId === row.organizationId).map((r) => r.establishmentId),
  }));
}

export interface EstablishmentSummary {
  id: string;
  name: string;
  slug: string;
  modules: { module: 'tapsy' | 'tableo'; status: 'active' | 'paused' }[];
}

/** Ce que voit un utilisateur connecté : ses organisations, son rôle, les établissements qu'il peut ouvrir. */
export async function loadAccount(user: SessionUser) {
  const memberships = await loadMemberships(user.id);
  const venues = memberships.length
    ? await db
        .select({ id: establishments.id, organizationId: establishments.organizationId, name: establishments.name, slug: establishments.slug })
        .from(establishments)
        .where(
          and(
            inArray(establishments.organizationId, memberships.map((m) => m.organizationId)),
            isNull(establishments.deletedAt),
          ),
        )
        .orderBy(asc(establishments.name))
    : [];
  const modules = venues.length
    ? await db
        .select()
        .from(establishmentModules)
        .where(inArray(establishmentModules.establishmentId, venues.map((v) => v.id)))
    : [];
  return {
    user,
    organizations: memberships.map((m) => ({
      id: m.organizationId,
      name: m.organizationName,
      role: m.role,
      establishments: venues
        .filter((v) => v.organizationId === m.organizationId && canAccessEstablishment(m.role, m.restrictedTo, v.id))
        .map(
          (v): EstablishmentSummary => ({
            id: v.id,
            name: v.name,
            slug: v.slug,
            modules: modules.filter((x) => x.establishmentId === v.id).map((x) => ({ module: x.module, status: x.status })),
          }),
        ),
    })),
  };
}

/**
 * Crée un compte avec un mot de passe provisoire, à changer à la première connexion. Le mot de passe
 * en clair n'est renvoyé qu'ici : il n'est stocké nulle part (pas d'envoi d'email pour l'instant).
 */
export async function createUserWithTemporaryPassword(
  executor: Pick<typeof db, 'insert'>,
  input: { email: string; displayName: string },
): Promise<{ user: SessionUser; temporaryPassword: string }> {
  const temporaryPassword = generateTemporaryPassword();
  const [user] = await executor
    .insert(users)
    .values({ email: input.email.trim(), displayName: input.displayName.trim(), passwordHash: await hashPassword(temporaryPassword), passwordChangeRequired: true })
    .returning(sessionUserColumns);
  return { user: user!, temporaryPassword };
}

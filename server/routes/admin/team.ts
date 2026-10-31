// Équipe d'une organisation. Sans envoi d'email pour l'instant : un responsable crée le compte d'un
// membre avec un mot de passe provisoire, affiché une seule fois, qu'il lui transmet de vive voix ; le
// membre le change à sa première connexion. Ajouter un compte qui existe déjà (membre d'une autre
// organisation) attendra les invitations par email, qui demandent l'accord du titulaire.
//
// Un propriétaire gère tout le monde, un gérant seulement les employés, et dans les limites de ses
// propres établissements. Personne ne modifie son propre accès : comme seul un propriétaire peut
// toucher à un autre propriétaire, l'organisation garde donc toujours au moins un propriétaire.
import { Router, type Response } from 'express';
import { and, asc, count, eq, inArray, isNull, ne } from 'drizzle-orm';
import { isWithinScope, manageableRoles, type Role } from '../../../shared/roles.ts';
import { db } from '../../db/client.ts';
import { establishments, memberEstablishments, organizationMembers, users } from '../../db/schema.ts';
import { allow, isUuid, memberAccess, type MemberAccess } from '../../admin/access.ts';
import { createUserWithTemporaryPassword, findUserByEmail } from '../../admin/accounts.ts';
import { memberUpdateSchema, newMemberSchema, validationError } from '../../admin/validation.ts';
import { isUniqueViolation } from '../../lib/db-errors.ts';
import { generateTemporaryPassword, hashPassword } from '../../lib/passwords.ts';
import { revokeUserSessions } from '../../lib/sessions.ts';

interface Target {
  userId: string;
  role: Role;
  restrictedTo: string[];
}

async function loadMembers(access: MemberAccess) {
  const rows = await db
    .select({
      userId: users.id,
      email: users.email,
      displayName: users.displayName,
      role: organizationMembers.role,
      passwordChangeRequired: users.passwordChangeRequired, // n'est pas encore venu choisir son mot de passe
      lastActiveAt: users.lastActiveAt,
    })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .where(eq(organizationMembers.organizationId, access.organizationId))
    .orderBy(asc(users.displayName));
  const restrictions = await db.select().from(memberEstablishments).where(eq(memberEstablishments.organizationId, access.organizationId));
  return rows.map((row) => ({
    ...row,
    establishmentIds: restrictions.filter((r) => r.userId === row.userId).map((r) => r.establishmentId),
    isYou: row.userId === access.user.id,
  }));
}

async function loadTarget(organizationId: string, userId: unknown): Promise<Target | null> {
  if (!isUuid(userId)) return null;
  const [member] = await db
    .select({ role: organizationMembers.role })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, userId)));
  if (!member) return null;
  const restrictions = await db
    .select({ establishmentId: memberEstablishments.establishmentId })
    .from(memberEstablishments)
    .where(and(eq(memberEstablishments.organizationId, organizationId), eq(memberEstablishments.userId, userId)));
  return { userId, role: member.role, restrictedTo: restrictions.map((r) => r.establishmentId) };
}

/** Refus (envoyé) si l'auteur ne peut pas toucher à ce membre ; sinon false. */
function refuseTarget(res: Response, access: MemberAccess, target: Target | null): boolean {
  if (!target) {
    res.status(404).json({ error: 'Membre introuvable.' });
    return true;
  }
  if (target.userId === access.user.id) {
    res.status(403).json({ error: 'Vous ne pouvez pas modifier votre propre accès.', code: 'self' });
    return true;
  }
  if (!manageableRoles(access.role).includes(target.role) || !isWithinScope(access.role, access.restrictedTo, target.restrictedTo)) {
    res.status(403).json({ error: 'Votre rôle ne permet pas de modifier ce membre.', code: 'forbidden' });
    return true;
  }
  return false;
}

/**
 * Vérifie un rôle et une liste d'établissements à attribuer (envoie le refus et renvoie null), et
 * renvoie la liste à enregistrer : vide pour un propriétaire, qui voit toujours tout.
 */
async function checkGrant(res: Response, access: MemberAccess, role: Role, establishmentIds: string[]): Promise<string[] | null> {
  if (!manageableRoles(access.role).includes(role)) {
    res.status(403).json({ error: 'Votre rôle ne permet pas d’attribuer ce rôle.', field: 'role', code: 'forbidden' });
    return null;
  }
  const ids = role === 'owner' ? [] : [...new Set(establishmentIds)];
  if (ids.length > 0) {
    const [known] = await db
      .select({ n: count() })
      .from(establishments)
      .where(and(eq(establishments.organizationId, access.organizationId), inArray(establishments.id, ids), isNull(establishments.deletedAt)));
    if (known!.n !== ids.length) {
      res.status(400).json({ error: 'Établissement inconnu.', field: 'establishmentIds' });
      return null;
    }
  }
  if (!isWithinScope(access.role, access.restrictedTo, ids)) {
    res.status(403).json({ error: 'Vous ne pouvez donner accès qu’à vos propres établissements.', field: 'establishmentIds', code: 'forbidden' });
    return null;
  }
  return ids;
}

export function createTeamRouter(): Router {
  const router = Router({ mergeParams: true });

  router.get('/', allow('team.view'), async (_req, res) => {
    res.json(await loadMembers(memberAccess(res)));
  });

  router.post('/', allow('team.manage'), async (req, res) => {
    const body = newMemberSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json(validationError(body.error));
      return;
    }
    const access = memberAccess(res);
    const ids = await checkGrant(res, access, body.data.role, body.data.establishmentIds);
    if (!ids) return;
    const existing = await findUserByEmail(body.data.email);
    if (existing) {
      const alreadyMember = await loadTarget(access.organizationId, existing.id);
      res.status(409).json(
        alreadyMember
          ? { error: 'Cette personne fait déjà partie de l’équipe.', field: 'email', code: 'already_member' }
          : {
              error: 'Un compte existe déjà avec cette adresse. L’ajout d’un compte existant arrivera avec les invitations par email.',
              field: 'email',
              code: 'account_exists',
            },
      );
      return;
    }
    try {
      const created = await db.transaction(async (tx) => {
        const account = await createUserWithTemporaryPassword(tx, { email: body.data.email, displayName: body.data.displayName });
        await tx.insert(organizationMembers).values({ organizationId: access.organizationId, userId: account.user.id, role: body.data.role });
        if (ids.length) {
          await tx.insert(memberEstablishments).values(ids.map((establishmentId) => ({ organizationId: access.organizationId, userId: account.user.id, establishmentId })));
        }
        return account;
      });
      const member = (await loadMembers(access)).find((m) => m.userId === created.user.id);
      res.status(201).json({ member, temporaryPassword: created.temporaryPassword });
    } catch (error) {
      if (!isUniqueViolation(error, 'users_email_lower_uq')) throw error; // compte créé entre-temps
      res.status(409).json({ error: 'Un compte existe déjà avec cette adresse.', field: 'email', code: 'account_exists' });
    }
  });

  router.patch('/:userId', allow('team.manage'), async (req, res) => {
    const body = memberUpdateSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json(validationError(body.error));
      return;
    }
    const access = memberAccess(res);
    const target = await loadTarget(access.organizationId, req.params.userId);
    if (refuseTarget(res, access, target)) return;
    const role = body.data.role ?? target!.role;
    const ids = await checkGrant(res, access, role, body.data.establishmentIds ?? target!.restrictedTo);
    if (!ids) return;
    await db.transaction(async (tx) => {
      await tx
        .update(organizationMembers)
        .set({ role })
        .where(and(eq(organizationMembers.organizationId, access.organizationId), eq(organizationMembers.userId, target!.userId)));
      await tx
        .delete(memberEstablishments)
        .where(and(eq(memberEstablishments.organizationId, access.organizationId), eq(memberEstablishments.userId, target!.userId)));
      if (ids.length) {
        await tx.insert(memberEstablishments).values(ids.map((establishmentId) => ({ organizationId: access.organizationId, userId: target!.userId, establishmentId })));
      }
    });
    res.json((await loadMembers(access)).find((m) => m.userId === target!.userId));
  });

  // Retirer un membre. Son compte disparaît avec s'il n'appartient à aucune autre organisation
  // (employé parti : rien à garder), et ses sessions sont fermées.
  router.delete('/:userId', allow('team.manage'), async (req, res) => {
    const access = memberAccess(res);
    const target = await loadTarget(access.organizationId, req.params.userId);
    if (refuseTarget(res, access, target)) return;
    const userId = target!.userId;
    const accountDeleted = await db.transaction(async (tx) => {
      await tx.delete(organizationMembers).where(and(eq(organizationMembers.organizationId, access.organizationId), eq(organizationMembers.userId, userId)));
      const [others] = await tx.select({ n: count() }).from(organizationMembers).where(eq(organizationMembers.userId, userId));
      if (others!.n > 0) return false;
      await tx.delete(users).where(eq(users.id, userId));
      return true;
    });
    if (accountDeleted) await revokeUserSessions(userId);
    res.status(204).end();
  });

  // Nouveau mot de passe provisoire (mot de passe oublié, sans email pour l'instant). Refusé pour un
  // compte qui appartient aussi à une autre organisation : ce serait prendre la main sur un accès qui
  // ne relève pas de celle-ci.
  router.post('/:userId/password', allow('team.manage'), async (req, res) => {
    const access = memberAccess(res);
    const target = await loadTarget(access.organizationId, req.params.userId);
    if (refuseTarget(res, access, target)) return;
    const userId = target!.userId;
    const [others] = await db
      .select({ n: count() })
      .from(organizationMembers)
      .where(and(eq(organizationMembers.userId, userId), ne(organizationMembers.organizationId, access.organizationId)));
    if (others!.n > 0) {
      res.status(409).json({
        error: 'Ce compte appartient aussi à une autre organisation : seul son titulaire peut changer son mot de passe.',
        code: 'other_organizations',
      });
      return;
    }
    const temporaryPassword = generateTemporaryPassword();
    await db.update(users).set({ passwordHash: await hashPassword(temporaryPassword), passwordChangeRequired: true }).where(eq(users.id, userId));
    await revokeUserSessions(userId);
    res.json({ temporaryPassword });
  });

  return router;
}

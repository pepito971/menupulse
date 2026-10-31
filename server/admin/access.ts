// Contrôle d'accès du back-office, relu en base à chaque requête : un membre retiré de l'équipe ou dont
// le rôle change perd ses droits immédiatement, sans attendre la fin de sa session.
import type { RequestHandler, Response } from 'express';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { can, canAccessEstablishment, type Permission, type Role } from '../../shared/roles.ts';
import { db } from '../db/client.ts';
import { establishments } from '../db/schema.ts';
import { destroySession } from '../lib/sessions.ts';
import { loadMemberships, loadSessionUser, type SessionUser } from './accounts.ts';

export interface MemberAccess {
  user: SessionUser;
  organizationId: string;
  role: Role;
  restrictedTo: string[];
}

export interface EstablishmentAccess extends MemberAccess {
  establishmentId: string;
}

const uuid = z.uuid();

export function isUuid(value: unknown): value is string {
  return uuid.safeParse(value).success;
}

export function currentUser(res: Response): SessionUser {
  return res.locals.user as SessionUser;
}

export function memberAccess(res: Response): MemberAccess {
  return res.locals.access as MemberAccess;
}

export function establishmentAccess(res: Response): EstablishmentAccess {
  return res.locals.access as EstablishmentAccess;
}

/**
 * Utilisateur connecté. Avec un mot de passe provisoire, il ne peut que le changer (et se déconnecter) :
 * `allowPasswordChange` ouvre seulement les routes qui servent à cela.
 */
export function requireUser(options: { allowPasswordChange?: boolean } = {}): RequestHandler {
  return async (req, res, next) => {
    const userId = req.session?.userId;
    const user = userId ? await loadSessionUser(userId) : null;
    if (!user) {
      if (userId) await destroySession(req); // compte supprimé entre-temps
      res.status(401).json({ error: 'Connexion requise.', code: 'unauthenticated' });
      return;
    }
    if (user.passwordChangeRequired && !options.allowPasswordChange) {
      res.status(403).json({ error: 'Choisissez d’abord votre mot de passe.', code: 'password_change_required' });
      return;
    }
    res.locals.user = user;
    next();
  };
}

// 404 plutôt que 403 : on ne révèle pas l'existence d'une organisation ou d'un établissement étranger
function notFound(res: Response): void {
  res.status(404).json({ error: 'Introuvable.' });
}

/** Routes /organizations/:organizationId : membre de l'organisation, quel que soit son rôle. */
export const loadOrganizationAccess: RequestHandler = async (req, res, next) => {
  const organizationId = req.params.organizationId;
  if (!isUuid(organizationId)) return notFound(res);
  const user = currentUser(res);
  const [membership] = await loadMemberships(user.id, organizationId);
  if (!membership) return notFound(res);
  res.locals.access = { user, organizationId, role: membership.role, restrictedTo: membership.restrictedTo } satisfies MemberAccess;
  next();
};

/** Routes /establishments/:establishmentId : établissement non supprimé, dans la liste blanche du membre. */
export const loadEstablishmentAccess: RequestHandler = async (req, res, next) => {
  const establishmentId = req.params.establishmentId;
  if (!isUuid(establishmentId)) return notFound(res);
  const [venue] = await db
    .select({ organizationId: establishments.organizationId })
    .from(establishments)
    .where(and(eq(establishments.id, establishmentId), isNull(establishments.deletedAt)));
  if (!venue) return notFound(res);
  const user = currentUser(res);
  const [membership] = await loadMemberships(user.id, venue.organizationId);
  if (!membership || !canAccessEstablishment(membership.role, membership.restrictedTo, establishmentId)) return notFound(res);
  res.locals.access = {
    user,
    organizationId: venue.organizationId,
    establishmentId,
    role: membership.role,
    restrictedTo: membership.restrictedTo,
  } satisfies EstablishmentAccess;
  next();
};

export function allow(permission: Permission): RequestHandler {
  return (_req, res, next) => {
    if (can(memberAccess(res).role, permission)) return next();
    res.status(403).json({ error: 'Votre rôle ne permet pas cette action.', code: 'forbidden' });
  };
}

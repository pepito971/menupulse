// Sessions du back-office (express-session + connect-pg-simple, table « session »).
import type { Request } from 'express';
import { pool } from '../db/client.ts';

declare module 'express-session' {
  interface SessionData {
    userId: string;
  }
}

export const SESSION_COOKIE = 'mp.sid';

/** Nouvel identifiant de session à la connexion : un identifiant posé avant par un tiers ne vaut plus rien. */
export function regenerateSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => req.session.regenerate((error) => (error ? reject(error) : resolve())));
}

export function saveSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => req.session.save((error) => (error ? reject(error) : resolve())));
}

export function destroySession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => req.session.destroy((error) => (error ? reject(error) : resolve())));
}

/**
 * Déconnecte un utilisateur partout (sauf, éventuellement, la session en cours) : mot de passe changé,
 * membre retiré de l'équipe. C'est l'intérêt des sessions en base face aux JWT.
 */
export async function revokeUserSessions(userId: string, exceptSessionId?: string): Promise<void> {
  try {
    await pool.query(`DELETE FROM "session" WHERE sess->>'userId' = $1 AND sid <> $2`, [userId, exceptSessionId ?? '']);
  } catch (error) {
    // table pas encore créée par connect-pg-simple (aucune connexion depuis l'installation) : rien à révoquer
    if ((error as { code?: string }).code !== '42P01') throw error;
  }
}

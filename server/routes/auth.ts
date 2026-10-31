// Connexion au back-office : email + mot de passe, session en base. Pas d'inscription ni de mot de passe
// oublié par email pour l'instant : les comptes sont créés par script (scripts/create-account.ts) ou par
// un responsable de l'équipe, avec un mot de passe provisoire.
import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { db } from '../db/client.ts';
import { users } from '../db/schema.ts';
import { currentUser, requireUser } from '../admin/access.ts';
import { findUserByEmail, loadAccount, loadPasswordHash } from '../admin/accounts.ts';
import { checkPassword, hashPassword, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, verifyPassword, type PasswordProblem } from '../lib/passwords.ts';
import { destroySession, regenerateSession, revokeUserSessions, saveSession, SESSION_COOKIE } from '../lib/sessions.ts';

const loginSchema = z.object({
  email: z.string().trim().max(254),
  password: z.string().max(PASSWORD_MAX_LENGTH),
});

const passwordSchema = z.object({
  currentPassword: z.string().max(PASSWORD_MAX_LENGTH),
  newPassword: z.string().max(PASSWORD_MAX_LENGTH * 4), // longueur réelle vérifiée en caractères par checkPassword
});

const PASSWORD_ERRORS: Record<PasswordProblem, string> = {
  too_short: `Le mot de passe doit faire au moins ${PASSWORD_MIN_LENGTH} caractères.`,
  too_long: `Le mot de passe doit faire au plus ${PASSWORD_MAX_LENGTH} caractères.`,
  same_as_email: 'Le mot de passe ne peut pas être votre adresse email.',
};

const LOGIN_FAILED = 'Adresse email ou mot de passe incorrect.';

export function createAuthRouter(): Router {
  const router = Router();

  // Essais ratés par adresse (deviner le mot de passe d'un compte) et volume total par IP (essayer
  // beaucoup d'adresses). Les connexions réussies ne comptent pas.
  const perAccount = rateLimit({
    windowMs: 15 * 60_000,
    limit: 10,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? '')}|${String(req.body?.email ?? '').trim().toLowerCase()}`,
    message: { error: 'Trop d’essais pour ce compte, réessayez dans 15 minutes.' },
  });
  const perIp = rateLimit({
    windowMs: 15 * 60_000,
    limit: 50,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => ipKeyGenerator(req.ip ?? ''),
    message: { error: 'Trop d’essais, réessayez dans 15 minutes.' },
  });

  router.post('/login', perIp, perAccount, async (req, res) => {
    const body = loginSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: 'Demande invalide.' });
      return;
    }
    const user = await findUserByEmail(body.data.email);
    if (!(await verifyPassword(user?.passwordHash ?? null, body.data.password)) || !user) {
      res.status(401).json({ error: LOGIN_FAILED });
      return;
    }
    await regenerateSession(req);
    req.session.userId = user.id;
    await saveSession(req);
    await db.update(users).set({ lastActiveAt: new Date() }).where(eq(users.id, user.id));
    res.json(await loadAccount({ id: user.id, email: user.email, displayName: user.displayName, passwordChangeRequired: user.passwordChangeRequired }));
  });

  router.post('/logout', async (req, res) => {
    if (req.session) await destroySession(req);
    res.clearCookie(SESSION_COOKIE);
    res.status(204).end();
  });

  router.get('/me', requireUser({ allowPasswordChange: true }), async (_req, res) => {
    res.json(await loadAccount(currentUser(res)));
  });

  // Changement de mot de passe (obligatoire après un mot de passe provisoire). Les autres sessions de
  // l'utilisateur sont fermées : un mot de passe qu'on change parce qu'il a fuité ne doit plus rien ouvrir.
  router.post('/password', requireUser({ allowPasswordChange: true }), async (req, res) => {
    const body = passwordSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: 'Demande invalide.' });
      return;
    }
    const user = currentUser(res);
    if (!(await verifyPassword(await loadPasswordHash(user.id), body.data.currentPassword))) {
      res.status(400).json({ error: 'Mot de passe actuel incorrect.', field: 'currentPassword' });
      return;
    }
    const problem = checkPassword(body.data.newPassword, user.email);
    if (problem) {
      res.status(400).json({ error: PASSWORD_ERRORS[problem], field: 'newPassword', code: problem });
      return;
    }
    if (body.data.newPassword === body.data.currentPassword) {
      res.status(400).json({ error: 'Choisissez un mot de passe différent de l’actuel.', field: 'newPassword', code: 'unchanged' });
      return;
    }
    await db
      .update(users)
      .set({ passwordHash: await hashPassword(body.data.newPassword), passwordChangeRequired: false })
      .where(eq(users.id, user.id));
    await regenerateSession(req);
    req.session.userId = user.id;
    await saveSession(req);
    await revokeUserSessions(user.id, req.sessionID);
    res.json(await loadAccount({ ...user, passwordChangeRequired: false }));
  });

  return router;
}

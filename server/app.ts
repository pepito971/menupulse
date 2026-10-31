import connectPgSimple from 'connect-pg-simple';
import express, { type ErrorRequestHandler, type Express } from 'express';
import session from 'express-session';
import helmet from 'helmet';
import { pool } from './db/client.ts';
import { requireSameOrigin } from './lib/origin-check.ts';
import { SESSION_COOKIE } from './lib/sessions.ts';

export interface AppOptions {
  isProduction: boolean;
  sessionSecret: string;
  allowedOrigins: readonly string[];
  /** Routes /api/* propres à chaque domaine, montées avant la réponse « route inconnue ». */
  mountApi?: (app: Express) => void;
}

export function createApp(options: AppOptions): Express {
  const app = express();
  // derrière le proxy HTTPS de l'hébergeur : vraie IP (limites de débit) et cookie Secure
  app.set('trust proxy', 1);

  app.use(
    helmet({
      // en développement, Vite injecte des styles par JavaScript : CSP stricte en production seulement
      contentSecurityPolicy: options.isProduction
        ? {
            directives: {
              'default-src': ["'self'"],
              'script-src': ["'self'"],
              'style-src': ["'self'"],
              'img-src': ["'self'", 'data:'],
              'connect-src': ["'self'"], // WebSocket de même origine compris
              'font-src': ["'self'"],
              'object-src': ["'none'"],
              'base-uri': ["'self'"],
              'form-action': ["'self'"],
              'frame-ancestors': ["'none'"],
            },
          }
        : false,
    }),
  );

  // Sessions en base (révocables immédiatement), réservées au back-office : un client à table n'en a
  // jamais, ses requêtes ne touchent donc pas la table « session ».
  const PgStore = connectPgSimple(session);
  const sessions = session({
    store: new PgStore({ pool, createTableIfMissing: true }),
    name: SESSION_COOKIE,
    secret: options.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: options.isProduction, // un cookie Secure serait refusé en HTTP local
      sameSite: 'lax', // 'strict' déconnecterait le gérant qui arrive par un lien reçu par email
      maxAge: 30 * 24 * 60 * 60 * 1000,
    },
  });
  app.use(['/api/auth', '/api/admin'], sessions);

  app.use('/api', requireSameOrigin(options.allowedOrigins), express.json({ limit: '100kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  options.mountApi?.(app);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Route inconnue.' });
  });

  return app;
}

// Express 5 transmet ici les promesses rejetées des routes : une erreur ne fait plus tomber le processus
export const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  console.error('[serveur] erreur non traitée', error);
  if (res.headersSent) return next(error);
  res.status(500).json({ error: 'Erreur interne du serveur.' });
};

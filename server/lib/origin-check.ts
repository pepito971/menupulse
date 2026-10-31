// Protection contre les requêtes intersites : une requête qui modifie des données doit venir de notre
// origine. Complète le cookie SameSite=Lax (qui couvre déjà le cas courant) sans jeton CSRF à gérer.
import type { RequestHandler } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function requireSameOrigin(allowedOrigins: readonly string[]): RequestHandler {
  return (req, res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();
    const origin = req.get('origin');
    if (origin && allowedOrigins.includes(origin)) return next();
    res.status(403).json({ error: 'Origine de la requête refusée.' });
  };
}

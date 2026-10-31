// Entrée dans les jeux d'une table : POST /api/play/join (pseudo, langue, accord pour le tableau
// d'honneur) → jeton de place, utilisé ensuite dans le message « hello » du WebSocket. Aucun compte.
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { Router } from 'express';
import { z } from 'zod';
import { LOCALES } from '../../shared/locales.ts';
import type { GameRooms } from '../games/game-rooms.ts';
import { checkPseudo } from '../lib/pseudo.ts';

const joinSchema = z.object({
  table: z.string().min(8).max(64),
  pseudo: z.string().max(60),
  locale: z.enum(LOCALES),
  hallOfFameConsent: z.boolean().default(false),
});

const PSEUDO_ERRORS = {
  length: 'Le pseudo doit faire entre 2 et 20 caractères.',
  characters: 'Le pseudo ne peut contenir que des lettres, des chiffres, des espaces et - _ . \'',
  blocked: 'Ce pseudo n’est pas accepté.',
} as const;

const JOIN_ERRORS = {
  table_unknown: { status: 404, message: 'Cette table n’existe pas ou les jeux n’y sont pas proposés.' },
  games_closed: { status: 403, message: 'Les jeux ne sont pas ouverts pour le moment. Demandez à l’équipe.' },
  full: { status: 409, message: 'Cette table est complète (10 joueurs).' },
  pseudo_taken: { status: 409, message: 'Ce pseudo est déjà pris à cette table.' },
} as const;

export function createPlayRouter(rooms: GameRooms): Router {
  const router = Router();

  // Large : tous les téléphones d'un bar partagent souvent la même adresse IP (wifi, NAT de l'opérateur)
  const joinLimiter = rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => ipKeyGenerator(req.ip ?? ''),
    message: { error: 'Trop de tentatives, réessayez dans une minute.' },
  });

  router.post('/join', joinLimiter, async (req, res) => {
    const body = joinSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: 'Demande invalide.' });
      return;
    }
    const pseudo = checkPseudo(body.data.pseudo);
    if (!pseudo.ok) {
      res.status(400).json({ error: PSEUDO_ERRORS[pseudo.reason], field: 'pseudo' });
      return;
    }
    const result = await rooms.join({ tableToken: body.data.table, pseudo: pseudo.pseudo, locale: body.data.locale, hallOfFameConsent: body.data.hallOfFameConsent });
    if (!result.ok) {
      const error = JOIN_ERRORS[result.error];
      res.status(error.status).json({ error: error.message, code: result.error });
      return;
    }
    res.json({ token: result.token });
  });

  return router;
}

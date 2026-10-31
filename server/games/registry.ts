// Registre des jeux : une ligne par jeu. Le client découvre les siens automatiquement
// (client/src/games/*/client.ts) ; un test vérifie que les deux listes correspondent.
import type { AnyGameDefinition } from '../../shared/games/types.ts';
import { actionVerite } from './action-verite/index.ts';
import { boissonMystere } from './boisson-mystere/index.ts';
import { jackpotHappyHour } from './jackpot-happy-hour/index.ts';
import { lIntrus } from './l-intrus/index.ts';
import { motInterdit } from './mot-interdit/index.ts';
import { quizComptoir } from './quiz-comptoir/index.ts';
import { tuPreferes } from './tu-preferes/index.ts';

export const GAMES: readonly AnyGameDefinition[] = [quizComptoir, tuPreferes, lIntrus, actionVerite, motInterdit, boissonMystere, jackpotHappyHour];

export const GAMES_BY_ID: ReadonlyMap<string, AnyGameDefinition> = new Map(GAMES.map((game) => [game.id, game]));

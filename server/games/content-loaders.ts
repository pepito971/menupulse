// Contenu d'une partie avant son lancement. Par défaut : pack publié en base, sinon contenu fourni par le
// jeu. Deux jeux commerciaux tirent leur contenu des données de l'établissement.
import type { AnyGameDefinition } from '../../shared/games/types.ts';
import { buildHints } from './boisson-mystere/hints.ts';
import type { GameStore } from './store.ts';

export async function loadGameContent(
  definition: AnyGameDefinition,
  settings: Record<string, unknown>,
  context: { store: GameStore; establishmentId: string; timezone: string },
): Promise<unknown> {
  const { store, establishmentId, timezone } = context;
  switch (definition.id) {
    case 'boisson-mystere': {
      const drinks = await store.loadDrinks(establishmentId, settings.allowAlcoholicDrinks === true);
      return { products: drinks.map((drink) => ({ id: drink.id, name: drink.name, hints: buildHints(drink) })) };
    }
    case 'jackpot-happy-hour': {
      const used = await store.countVouchersToday(establishmentId, definition.id, timezone);
      const max = typeof settings.maxWinsPerDay === 'number' ? settings.maxWinsPerDay : 0;
      return { remainingWins: Math.max(0, max - used) };
    }
    default:
      return (await store.loadPack(establishmentId, definition.id)) ?? definition.defaultContent ?? null;
  }
}

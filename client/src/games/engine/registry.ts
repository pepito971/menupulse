// Découverte automatique des jeux : tout dossier client/src/games/<id>/ qui contient un client.ts est un
// jeu, chargé dans son propre fichier JS à la première partie. Côté serveur : server/games/registry.ts.
import type { GameComponentClass } from './types.ts';

const loaders = import.meta.glob<{ default: GameComponentClass }>('../*/client.ts');

export async function loadGameComponent(gameId: string): Promise<GameComponentClass | null> {
  const loader = loaders[`../${gameId}/client.ts`];
  if (!loader) return null;
  return (await loader()).default;
}

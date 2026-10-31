import { readPageData } from '../core/page-data.ts';
import { registerServiceWorker } from '../core/sw-register.ts';

registerServiceWorker();

// Page des jeux d'une table : l'application des jeux n'est chargée que là (fichier séparé).
const data = readPageData<{ screen?: string; table?: string; tableLabel?: string }>();
const root = document.getElementById('game-root');
if (data.screen === 'game' && data.table && root) {
  const { table, tableLabel = '' } = data;
  void import('../games/engine/game-app.ts').then(({ startGameApp }) => startGameApp(root, { ...data, table, tableLabel }));
}

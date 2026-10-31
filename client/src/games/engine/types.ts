// Contrat d'un composant de jeu côté téléphone. Chaque jeu est une classe dans
// client/src/games/<id>/client.ts (export par défaut), chargée seulement quand une partie commence.
import type { Locale } from '../../../../shared/locales.ts';
import type { Translator } from '../../core/page-data.ts';

export interface GameContext {
  t: Translator;
  locale: Locale;
  /** Envoie une action de jeu au serveur (validée par le jeu en cours). */
  send(payload: unknown): void;
}

export interface GameComponent<View = unknown> {
  mount(root: HTMLElement): void;
  update(view: View): void;
  unmount(): void;
}

export type GameComponentClass = new (context: GameContext) => GameComponent;

/** Base commune : chaque mise à jour redessine la vue du jeu (les vues sont petites). */
export abstract class BaseGame<View> implements GameComponent<View> {
  protected root: HTMLElement | null = null;
  protected readonly context: GameContext;

  constructor(context: GameContext) {
    this.context = context;
  }

  mount(root: HTMLElement): void {
    this.root = root;
  }

  update(view: View): void {
    this.root?.replaceChildren(...this.render(view));
  }

  unmount(): void {
    this.root?.replaceChildren();
    this.root = null;
  }

  protected abstract render(view: View): Node[];
}

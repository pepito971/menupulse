// Construction du DOM sans innerHTML : tout texte (pseudos, contenus de jeu) passe par des nœuds texte,
// donc aucune injection de HTML possible.
type Child = Node | string | number | null | undefined | false;
type AttributeValue = string | number | boolean | null | undefined | ((event: Event) => void);

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attributes: Record<string, AttributeValue> = {}, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value === null || value === undefined || value === false) continue;
    if (typeof value === 'function') element.addEventListener(name.slice(2).toLowerCase(), value); // onClick → click
    // style par le CSSOM : un attribut style="" serait bloqué par la CSP de production (style-src 'self')
    else if (name === 'style') element.style.cssText = String(value);
    else if (value === true) element.setAttribute(name, '');
    else element.setAttribute(name === 'className' ? 'class' : name, String(value));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    element.append(child instanceof Node ? child : String(child));
  }
  return element;
}

/** Bouton tactile (≥ 48 px, voir games.css). */
export function button(label: Child | Child[], onClick: () => void, attributes: Record<string, AttributeValue> = {}): HTMLButtonElement {
  return h('button', { type: 'button', class: 'ui-btn', ...attributes, onClick: () => onClick() }, label);
}

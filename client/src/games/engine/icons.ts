// Pictogrammes des jeux (traits 24 × 24, couleur du texte). Construits par le DOM : aucune chaîne HTML.
const SVG_NS = 'http://www.w3.org/2000/svg';

const PATHS = {
  arrow: 'M5 12h14M13 6l6 6-6 6',
  clock: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 7v5l3 2',
  play: 'M6 8h12a3 3 0 0 1 3 3v4a2 2 0 0 1-3.4 1.4L16 15H8l-1.6 1.4A2 2 0 0 1 3 15v-4a3 3 0 0 1 3-3zM8 10v3M6.5 11.5h3M15.5 11h.01M17.5 13h.01',
  trophy: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3',
  users: 'M5 7a4 4 0 1 0 8 0a4 4 0 1 0-8 0M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2M16 3.1a4 4 0 0 1 0 7.8M21 21v-2a4 4 0 0 0-3-3.9',
  sparkles: 'M12 3l1.9 5.6 5.6 1.9-5.6 1.9L12 18l-1.9-5.6-5.6-1.9 5.6-1.9zM19 3v4M17 5h4',
  question: 'M8 8a4 4 0 1 1 5.5 3.7c-.9.4-1.5 1.2-1.5 2.2V15M12 19h.01',
  flame: 'M12 21a6 6 0 0 0 6-6c0-4-3-6-4-10-2 2-3 4-3 6-1-1-2-2-2-4-2 2-3 5-3 8a6 6 0 0 0 6 6z',
  muted: 'M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-4 3V6a1 1 0 0 1 1-1zM4 4l16 16',
  glass: 'M6 3h12l-1 7a5 5 0 0 1-10 0zM12 15v6M8 21h8',
  coins: 'M5 7a7 3 0 1 0 14 0a7 3 0 1 0-14 0M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5',
  logout: 'M14 8V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-2M9 12h12M18 9l3 3-3 3',
} as const;

export type IconName = keyof typeof PATHS;

/** Pictogramme du jeu dans le salon (repli : étincelles). */
export const GAME_ICONS: Record<string, IconName> = {
  'quiz-comptoir': 'question',
  'tu-preferes': 'users',
  'l-intrus': 'sparkles',
  'action-verite': 'flame',
  'mot-interdit': 'muted',
  'boisson-mystere': 'glass',
  'jackpot-happy-hour': 'coins',
};

export function svg(viewBox: string, className: string, ...children: SVGElement[]): SVGSVGElement {
  const element = document.createElementNS(SVG_NS, 'svg');
  element.setAttribute('viewBox', viewBox);
  element.setAttribute('class', className);
  element.setAttribute('aria-hidden', 'true');
  element.append(...children);
  return element;
}

export function svgNode(tag: string, attributes: Record<string, string | number>, text?: string): SVGElement {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  if (text) element.textContent = text;
  return element;
}

export function icon(name: IconName, className = 'tp-icon'): SVGSVGElement {
  return svg('0 0 24 24', className, svgNode('path', { d: PATHS[name] }));
}

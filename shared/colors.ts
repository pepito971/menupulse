// Couleur de marque d'un établissement (#rrggbb). Elle sert de fond (en-tête, boutons) : le texte posé
// dessus est noir ou blanc, celui des deux qui contraste le plus. Le meilleur des deux atteint toujours
// au moins 4,58:1, au-dessus du seuil WCAG AA (4,5:1) pour du texte : aucune couleur n'est à refuser.
export const HEX_COLOR = /^#[0-9a-f]{6}$/;

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Luminance relative (WCAG 2) d'une couleur #rrggbb. */
export function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

export function textColorOn(background: string): '#000000' | '#ffffff' {
  return contrastRatio(background, '#000000') >= contrastRatio(background, '#ffffff') ? '#000000' : '#ffffff';
}

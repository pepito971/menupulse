// Gabarits HTML rendus par le serveur : tout ce qui est interpolé est ÉCHAPPÉ par défaut ; raw()
// marque un fragment déjà sûr. Jamais de HTML construit par concaténation de chaînes.
// Attention : l'échappement protège le texte et les valeurs d'attribut entre guillemets, pas une
// URL saisie par un utilisateur (javascript:…) — une URL se valide avant d'être insérée.

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export class SafeHtml {
  readonly value: string;
  constructor(value: string) {
    this.value = value;
  }
  toString(): string {
    return this.value;
  }
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}

export function raw(value: string): SafeHtml {
  return new SafeHtml(value);
}

function render(value: unknown): string {
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(render).join('');
  if (value === null || value === undefined || value === false) return '';
  return escapeHtml(String(value));
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): SafeHtml {
  let out = strings[0] ?? '';
  values.forEach((value, index) => {
    out += render(value) + (strings[index + 1] ?? '');
  });
  return new SafeHtml(out);
}

/**
 * Données à insérer dans <script type="application/json"> : « < » est échappé pour qu'aucune donnée
 * (un nom de plat contenant « </script> ») ne puisse fermer la balise.
 */
export function jsonForScript(data: unknown): SafeHtml {
  return new SafeHtml(JSON.stringify(data).replace(/</g, '\\u003c'));
}

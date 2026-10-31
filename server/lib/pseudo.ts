// Pseudo temporaire d'un joueur (aucun compte). Il s'affiche sur les téléphones de la table, et peut-être
// sur l'écran du bar et au tableau d'honneur : longueur et caractères limités, et un filtre de base sur
// des insultes évidentes. Le filtre compare des MOTS entiers (pas des morceaux de mots : « dispute » ne
// doit pas être refusé) ; il ne remplace pas la modération par le personnel.

const BLOCKED_WORDS = new Set([
  'connard', 'connasse', 'salope', 'pute', 'putain', 'encule', 'enfoire', 'batard', 'nazi', 'hitler',
  'fuck', 'fucker', 'bitch', 'cunt', 'whore', 'slut', 'nigger', 'nigga', 'negre', 'bougnoule', 'pd', 'tapette',
]);

export type PseudoCheck = { ok: true; pseudo: string } | { ok: false; reason: 'length' | 'characters' | 'blocked' };

function folded(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr');
}

export function checkPseudo(raw: string): PseudoCheck {
  const pseudo = raw.normalize('NFC').trim().replace(/\s+/g, ' ');
  const length = [...pseudo].length;
  if (length < 2 || length > 20) return { ok: false, reason: 'length' };
  if (!/^[\p{L}\p{N} _.'’-]+$/u.test(pseudo)) return { ok: false, reason: 'characters' };
  const words = folded(pseudo).split(/[^a-z0-9]+/).filter(Boolean);
  const squashed = folded(pseudo).replace(/[^a-z0-9]/g, '');
  if (words.some((word) => BLOCKED_WORDS.has(word)) || BLOCKED_WORDS.has(squashed)) return { ok: false, reason: 'blocked' };
  return { ok: true, pseudo };
}

// Mots de passe du back-office : Argon2id (paramètres par défaut de la bibliothèque : 64 Mio, 3 passes).
import { randomInt } from 'node:crypto';
import argon2 from 'argon2';

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128; // au-delà, un hachage coûteux deviendrait un moyen de saturer le serveur

export type PasswordProblem = 'too_short' | 'too_long' | 'same_as_email';

/** Règle volontairement simple (recommandations ANSSI/NIST) : la longueur, pas de composition imposée. */
export function checkPassword(password: string, email: string): PasswordProblem | null {
  const length = [...password].length;
  if (length < PASSWORD_MIN_LENGTH) return 'too_short';
  if (length > PASSWORD_MAX_LENGTH) return 'too_long';
  if (password.trim().toLowerCase() === email.trim().toLowerCase()) return 'same_as_email';
  return null;
}

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

let decoy: Promise<string> | undefined;

/**
 * Vérifie un mot de passe. Sans compte (`hash` null), on hache quand même pour rien : la réponse prend
 * le même temps, et sa durée ne révèle pas si l'adresse a un compte.
 */
export async function verifyPassword(hash: string | null, password: string): Promise<boolean> {
  if (hash === null) {
    decoy ??= hashPassword('leurre-pour-un-compte-inexistant');
    await argon2.verify(await decoy, password).catch(() => false);
    return false;
  }
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false; // hachage illisible : refusé, jamais une erreur 500
  }
}

const TEMPORARY_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // ni 0/o, ni 1/l/i : se dicte sans erreur

/** Mot de passe provisoire à transmettre de vive voix : 4 groupes de 4 (« k7mq-x3pt-… », ≈ 79 bits). */
export function generateTemporaryPassword(): string {
  const group = () => Array.from({ length: 4 }, () => TEMPORARY_ALPHABET[randomInt(TEMPORARY_ALPHABET.length)]).join('');
  return [group(), group(), group(), group()].join('-');
}

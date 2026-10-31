// Drizzle enveloppe les erreurs de PostgreSQL (DrizzleQueryError) : l'erreur d'origine est dans `cause`.
interface PgError {
  code?: string;
  constraint?: string;
  cause?: unknown;
}

function pgError(error: unknown): PgError | null {
  let current: unknown = error;
  for (let depth = 0; depth < 3 && current && typeof current === 'object'; depth++) {
    const candidate = current as PgError;
    if (typeof candidate.code === 'string') return candidate;
    current = candidate.cause;
  }
  return null;
}

/** Violation d'unicité, éventuellement d'une contrainte précise (slug déjà pris, libellé de table en double…). */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const pg = pgError(error);
  return pg?.code === '23505' && (constraint === undefined || pg.constraint === constraint);
}

// Rôles des membres d'une organisation et ce que chacun peut faire dans le back-office. Partagé : le
// serveur s'en sert pour refuser, le navigateur pour ne pas proposer ce qui serait refusé.
export const ROLES = ['owner', 'manager', 'staff'] as const;
export type Role = (typeof ROLES)[number];

const PERMISSIONS = {
  'organization.edit': ['owner'],
  'establishment.create': ['owner'],
  'establishment.view': ['owner', 'manager', 'staff'],
  'establishment.edit': ['owner', 'manager'], // nom, langues, fuseau, couleur, thème
  'establishment.editSlug': ['owner'], // l'adresse publique : changer le slug casse les liens déjà diffusés
  'establishment.editModules': ['owner'], // lié à l'abonnement
  'tables.manage': ['owner', 'manager'],
  'team.view': ['owner', 'manager'],
  'team.manage': ['owner', 'manager'], // le gérant ne gère que les employés (manageableRoles)
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

export function can(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

/** Rôles qu'un membre peut attribuer, et dont il peut modifier ou retirer les titulaires. */
export function manageableRoles(role: Role): readonly Role[] {
  if (role === 'owner') return ROLES;
  if (role === 'manager') return ['staff'];
  return [];
}

/**
 * Établissements accessibles : liste blanche, une liste vide = tous ceux de l'organisation.
 * Un propriétaire voit toujours tout, quelle que soit sa liste.
 */
export function canAccessEstablishment(role: Role, restrictedTo: readonly string[], establishmentId: string): boolean {
  return role === 'owner' || restrictedTo.length === 0 || restrictedTo.includes(establishmentId);
}

/**
 * Un membre limité à certains établissements ne peut donner accès qu'à ceux-là : ni « tous », ni un
 * établissement qu'il ne voit pas. Sert aussi à vérifier qu'il peut toucher à un membre existant.
 */
export function isWithinScope(actorRole: Role, actorRestrictedTo: readonly string[], targetRestrictedTo: readonly string[]): boolean {
  if (actorRole === 'owner' || actorRestrictedTo.length === 0) return true;
  return targetRestrictedTo.length > 0 && targetRestrictedTo.every((id) => actorRestrictedTo.includes(id));
}

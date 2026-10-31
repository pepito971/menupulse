// Schémas des données saisies dans le back-office (réglages, tables, équipe).
import { z } from 'zod';
import { HEX_COLOR } from '../../shared/colors.ts';
import { LOCALES } from '../../shared/locales.ts';
import { ROLES } from '../../shared/roles.ts';
import { SLUG_PATTERN } from '../../shared/slug.ts';

/** Fuseau IANA reconnu par le moteur JavaScript, sous son nom canonique (« europe/paris » → « Europe/Paris »). */
export function canonicalTimezone(value: string): string | null {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

const name = z.string().trim().min(1).max(80);
const slug = z.string().trim().toLowerCase().regex(SLUG_PATTERN);
const timezone = z
  .string()
  .max(64)
  .transform((value, ctx) => canonicalTimezone(value) ?? (ctx.addIssue({ code: 'custom', message: 'Fuseau horaire inconnu.' }), z.NEVER));
const locales = z
  .array(z.enum(LOCALES))
  .min(1)
  .refine((list) => new Set(list).size === list.length, 'Langue en double.');
const brandColor = z.string().trim().toLowerCase().regex(HEX_COLOR).nullable();
const establishmentIds = z.array(z.uuid()).max(200);

export const establishmentSettingsSchema = z
  .strictObject({
    name,
    slug,
    timezone,
    defaultLocale: z.enum(LOCALES),
    locales,
    brandColor,
    forcedTheme: z.enum(['light', 'dark']).nullable(),
  })
  .partial();

export const newEstablishmentSchema = z.strictObject({
  name,
  slug,
  timezone: timezone.default('Europe/Paris'),
  defaultLocale: z.enum(LOCALES).default('fr'),
  locales: locales.default(['fr']),
  modules: z
    .array(z.enum(['tapsy', 'tableo']))
    .min(1)
    .refine((list) => new Set(list).size === list.length, 'Module en double.'),
});

export const moduleStatusSchema = z.strictObject({ status: z.enum(['active', 'paused', 'off']) });

export const organizationSchema = z.strictObject({ name });

export const tableLabel = z.string().trim().min(1).max(30);
export const newTableSchema = z.strictObject({ label: tableLabel });
export const tableUpdateSchema = z.strictObject({ label: tableLabel, isActive: z.boolean() }).partial();

export const newMemberSchema = z.strictObject({
  email: z.email().max(254),
  displayName: z.string().trim().min(1).max(60),
  role: z.enum(ROLES),
  establishmentIds: establishmentIds.default([]),
});

export const memberUpdateSchema = z.strictObject({ role: z.enum(ROLES), establishmentIds }).partial();

/** Première erreur d'un schéma, en clair pour l'interface : `{ error, field }`. */
export function validationError(error: z.ZodError): { error: string; field?: string } {
  const issue = error.issues[0];
  const field = issue?.path.length ? issue.path.join('.') : undefined;
  return { error: field ? `Valeur invalide : ${field}.` : 'Demande invalide.', field };
}

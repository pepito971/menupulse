// Schéma Drizzle de Menupulse. Colonnes en snake_case automatique (casing: 'snake_case', ici via
// drizzle-kit ET dans drizzle({ casing }), server/db/client.ts).
//
// Multi-établissements : toute table métier porte establishment_id, et les références entre tables
// métier passent par des clés étrangères COMPOSITES (establishment_id, id) — Postgres refuse alors
// qu'un produit pointe vers la catégorie d'un autre établissement, quel que soit le code qui écrit.
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { ALLERGENS, DIETS } from '../../shared/allergens.ts';
import { LOCALES, type Localized, type TranslationStatus } from '../../shared/locales.ts';
import { ROLES } from '../../shared/roles.ts';

export const MODULES = ['tapsy', 'tableo'] as const;

export type DrinkDetails = { ibu?: number; volumeMl?: number; style?: string; tastingNotes?: Localized; origin?: string };
export type DishDetails = { spicyLevel?: 0 | 1 | 2 | 3 };
export type ProductDetails = DrinkDetails | DishDetails; // validé par Zod selon products.kind

const inList = (values: readonly string[]) => sql.raw(values.map((value) => `'${value}'`).join(', '));
const id = () => uuid().primaryKey().defaultRandom();
const stamp = () => timestamp({ withTimezone: true });
const tenant = () =>
  uuid()
    .notNull()
    .references(() => establishments.id, { onDelete: 'cascade' });
const localizedText = () => jsonb().$type<Localized>();
const translations = () => jsonb().$type<TranslationStatus>().notNull().default({});

// ─── Comptes, organisations, établissements ──────────────────────────────────────────────

export const users = pgTable(
  'users',
  {
    id: id(),
    email: text().notNull(),
    passwordHash: text().notNull(), // Argon2id
    // mot de passe provisoire (compte créé par un script ou par un responsable) : à changer à la connexion
    passwordChangeRequired: boolean().notNull().default(false),
    displayName: text().notNull(),
    emailVerifiedAt: stamp(),
    lastActiveAt: stamp(),
    createdAt: stamp().notNull().defaultNow(),
  },
  (t) => [uniqueIndex('users_email_lower_uq').on(sql`lower(${t.email})`)],
);

/** Possède les établissements, la facturation et l'équipe (un groupe de trois bars = une organisation). */
export const organizations = pgTable('organizations', {
  id: id(),
  name: text().notNull(),
  createdAt: stamp().notNull().defaultNow(),
  deletedAt: stamp(),
});

export const organizationMembers = pgTable(
  'organization_members',
  {
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text({ enum: ROLES }).notNull(), // droits de chaque rôle : shared/roles.ts
    createdAt: stamp().notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.userId] }),
    index('organization_members_user_idx').on(t.userId),
    check('organization_members_role_check', sql`${t.role} IN (${inList(ROLES)})`),
  ],
);

export const establishments = pgTable(
  'establishments',
  {
    id: id(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    slug: text().notNull().unique(), // URL publique courte : /c/:slug (QR code moins dense)
    name: text().notNull(),
    timezone: text().notNull().default('Europe/Paris'),
    defaultLocale: text({ enum: LOCALES }).notNull().default('fr'),
    locales: text().array().notNull().default(sql`'{fr}'::text[]`), // langues proposées aux clients
    brandColor: text(), // fond : texte noir ou blanc selon le contraste (shared/colors.ts)
    forcedTheme: text({ enum: ['light', 'dark'] }), // null = préférence du téléphone
    gamesOpenUntil: stamp(), // le personnel ouvre les jeux pour la soirée, ils se referment seuls
    menuVersion: integer().notNull().default(1), // ETag du menu public, +1 à chaque modification
    createdAt: stamp().notNull().defaultNow(),
    deletedAt: stamp(),
  },
  (t) => [
    index('establishments_organization_idx').on(t.organizationId),
    unique('establishments_organization_id_uq').on(t.organizationId, t.id), // cible de member_establishments
    check('establishments_slug_check', sql`${t.slug} ~ '^[a-z0-9-]{3,48}$'`),
    check('establishments_locales_check', sql`${t.locales} <@ ARRAY[${inList(LOCALES)}]::text[] AND ${t.defaultLocale} = ANY(${t.locales})`),
    check('establishments_brand_color_check', sql`${t.brandColor} IS NULL OR ${t.brandColor} ~ '^#[0-9a-f]{6}$'`),
    check('establishments_theme_check', sql`${t.forcedTheme} IS NULL OR ${t.forcedTheme} IN ('light', 'dark')`),
  ],
);

/**
 * Membre restreint à certains établissements de son organisation. LISTE BLANCHE : aucune ligne pour
 * un membre = accès à tous les établissements de l'organisation (même sémantique que les calques
 * dans Planevo).
 */
export const memberEstablishments = pgTable(
  'member_establishments',
  {
    organizationId: uuid().notNull(),
    userId: uuid().notNull(),
    establishmentId: tenant(),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.userId, t.establishmentId] }),
    foreignKey({
      name: 'member_establishments_member_fk',
      columns: [t.organizationId, t.userId],
      foreignColumns: [organizationMembers.organizationId, organizationMembers.userId],
    }).onDelete('cascade'),
    // la base refuse d'ouvrir à un membre l'établissement d'une autre organisation
    foreignKey({
      name: 'member_establishments_establishment_fk',
      columns: [t.organizationId, t.establishmentId],
      foreignColumns: [establishments.organizationId, establishments.id],
    }).onDelete('cascade'),
  ],
);

/** Modules actifs d'un établissement : Tapsy (bar), Tableo (restaurant), ou les deux. */
export const establishmentModules = pgTable(
  'establishment_modules',
  {
    establishmentId: tenant(),
    module: text({ enum: MODULES }).notNull(),
    status: text({ enum: ['active', 'paused'] }).notNull().default('active'),
    createdAt: stamp().notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.establishmentId, t.module] }),
    check('establishment_modules_module_check', sql`${t.module} IN (${inList(MODULES)})`),
    check('establishment_modules_status_check', sql`${t.status} IN ('active', 'paused')`),
  ],
);

// ─── Cartes ──────────────────────────────────────────────────────────────────────────────

export const categories = pgTable(
  'categories',
  {
    id: id(),
    establishmentId: tenant(),
    module: text({ enum: MODULES }).notNull(),
    name: localizedText().notNull(), // côté Tableo, l'ordre des catégories = les étapes du repas
    position: integer().notNull().default(0),
    isVisible: boolean().notNull().default(true),
    translations: translations(),
  },
  (t) => [
    unique('categories_tenant_id_uq').on(t.establishmentId, t.id), // cible des clés composites
    index('categories_menu_idx').on(t.establishmentId, t.module, t.position),
    check('categories_module_check', sql`${t.module} IN (${inList(MODULES)})`),
    check('categories_name_check', sql`jsonb_typeof(${t.name}) = 'object' AND ${t.name} <> '{}'::jsonb`),
  ],
);

export const products = pgTable(
  'products',
  {
    id: id(),
    establishmentId: tenant(),
    categoryId: uuid().notNull(),
    kind: text({ enum: ['drink', 'dish'] }).notNull(), // une carte des vins Tableo = des 'drink'
    name: localizedText().notNull(),
    description: localizedText(),
    priceCents: integer().notNull(),
    happyHourPriceCents: integer(), // null = pas concerné par l'Happy Hour
    abv: numeric({ precision: 4, scale: 1, mode: 'number' }), // null = plat, 0 = sans alcool
    allergens: text().array().notNull().default(sql`'{}'::text[]`),
    mayContain: text().array().notNull().default(sql`'{}'::text[]`), // « peut contenir des traces de »
    diets: text().array().notNull().default(sql`'{}'::text[]`),
    details: jsonb().$type<ProductDetails>().notNull().default({}),
    imageKey: text(), // clé dans le stockage des images, jamais l'image elle-même
    isAvailable: boolean().notNull().default(true), // rupture de stock en 1 clic
    isVisible: boolean().notNull().default(true),
    boardDate: date(), // Ardoise du jour : non null = affiché ce jour-là seulement (fuseau de l'établissement)
    position: integer().notNull().default(0),
    translations: translations(),
    updatedAt: stamp()
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // NO ACTION (défaut) : une catégorie non vide ne se supprime pas, la cascade depuis l'établissement passe
    foreignKey({
      name: 'products_category_fk',
      columns: [t.establishmentId, t.categoryId],
      foreignColumns: [categories.establishmentId, categories.id],
    }),
    unique('products_tenant_id_uq').on(t.establishmentId, t.id),
    index('products_menu_idx').on(t.establishmentId, t.categoryId, t.position),
    check('products_kind_check', sql`${t.kind} IN ('drink', 'dish')`),
    check('products_name_check', sql`jsonb_typeof(${t.name}) = 'object' AND ${t.name} <> '{}'::jsonb`),
    check(
      'products_price_check',
      sql`${t.priceCents} >= 0 AND (${t.happyHourPriceCents} IS NULL OR ${t.happyHourPriceCents} BETWEEN 0 AND ${t.priceCents})`,
    ),
    check('products_abv_check', sql`${t.abv} IS NULL OR (${t.kind} = 'drink' AND ${t.abv} BETWEEN 0 AND 100)`),
    check(
      'products_allergens_check',
      sql`${t.allergens} <@ ARRAY[${inList(ALLERGENS)}]::text[] AND ${t.mayContain} <@ ARRAY[${inList(ALLERGENS)}]::text[]`,
    ),
    check('products_diets_check', sql`${t.diets} <@ ARRAY[${inList(DIETS)}]::text[]`),
  ],
);

export const happyHours = pgTable(
  'happy_hours',
  {
    id: id(),
    establishmentId: tenant(),
    label: localizedText(), // null = « Happy Hour » du dictionnaire
    weekdays: smallint().array().notNull(), // 1 = lundi … 7 = dimanche (ISO)
    startsAt: time().notNull(),
    endsAt: time().notNull(), // antérieur à startsAt = se termine le lendemain
    isActive: boolean().notNull().default(true),
  },
  (t) => [
    index('happy_hours_establishment_idx').on(t.establishmentId),
    check(
      'happy_hours_weekdays_check',
      sql`cardinality(${t.weekdays}) > 0 AND ${t.weekdays} <@ ARRAY[1, 2, 3, 4, 5, 6, 7]::smallint[]`,
    ),
    check('happy_hours_range_check', sql`${t.startsAt} <> ${t.endsAt}`),
  ],
);

export const formulas = pgTable(
  'formulas',
  {
    id: id(),
    establishmentId: tenant(),
    name: localizedText().notNull(),
    description: localizedText(),
    priceCents: integer().notNull(),
    isAvailable: boolean().notNull().default(true),
    position: integer().notNull().default(0),
    translations: translations(),
  },
  (t) => [
    unique('formulas_tenant_id_uq').on(t.establishmentId, t.id),
    check('formulas_price_check', sql`${t.priceCents} >= 0`),
  ],
);

export const formulaSteps = pgTable(
  'formula_steps',
  {
    id: id(),
    establishmentId: tenant(),
    formulaId: uuid().notNull(),
    label: localizedText().notNull(), // « Entrée », « Plat », « Dessert »
    position: integer().notNull().default(0),
    minChoices: smallint().notNull().default(1), // 0 = étape facultative
    maxChoices: smallint().notNull().default(1),
  },
  (t) => [
    foreignKey({
      name: 'formula_steps_formula_fk',
      columns: [t.establishmentId, t.formulaId],
      foreignColumns: [formulas.establishmentId, formulas.id],
    }).onDelete('cascade'),
    unique('formula_steps_tenant_id_uq').on(t.establishmentId, t.id),
    check('formula_steps_choices_check', sql`${t.minChoices} >= 0 AND ${t.maxChoices} >= GREATEST(${t.minChoices}, 1)`),
  ],
);

export const formulaStepItems = pgTable(
  'formula_step_items',
  {
    establishmentId: tenant(),
    stepId: uuid().notNull(),
    productId: uuid().notNull(),
    supplementCents: integer().notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.stepId, t.productId] }),
    foreignKey({
      name: 'formula_step_items_step_fk',
      columns: [t.establishmentId, t.stepId],
      foreignColumns: [formulaSteps.establishmentId, formulaSteps.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'formula_step_items_product_fk',
      columns: [t.establishmentId, t.productId],
      foreignColumns: [products.establishmentId, products.id],
    }).onDelete('cascade'),
    check('formula_step_items_supplement_check', sql`${t.supplementCents} >= 0`),
  ],
);

/** Tables physiques : chacune a son QR code, qui ouvre l'écran de choix (bar / restaurant). */
export const diningTables = pgTable(
  'dining_tables',
  {
    id: id(),
    establishmentId: tenant(),
    label: text().notNull(), // « T12 », « Terrasse 3 »
    qrToken: text().notNull().unique(), // aléatoire (128 bits), régénérable si le QR circule
    isActive: boolean().notNull().default(true),
  },
  (t) => [
    unique('dining_tables_tenant_id_uq').on(t.establishmentId, t.id),
    unique('dining_tables_label_uq').on(t.establishmentId, t.label),
  ],
);

// ─── Jeux ────────────────────────────────────────────────────────────────────────────────
// Identifiants de jeux en texte, pas en enum : ajouter un jeu ne demande aucune migration.
// Les joueurs et leurs pseudos vivent EN MÉMOIRE pendant la partie ; seul le meilleur joueur peut
// être conservé (tableau d'honneur), et seulement s'il l'a accepté en rejoignant la partie.

const GAME_ID_PATTERN = sql.raw(`'^[a-z][a-z0-9-]{1,31}$'`);

export const establishmentGames = pgTable(
  'establishment_games',
  {
    establishmentId: tenant(),
    gameId: text().notNull(),
    isEnabled: boolean().notNull().default(false),
    settings: jsonb().notNull().default({}), // validé par settingsSchema du jeu
    updatedAt: stamp()
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    primaryKey({ columns: [t.establishmentId, t.gameId] }),
    check('establishment_games_id_check', sql`${t.gameId} ~ ${GAME_ID_PATTERN}`),
  ],
);

export const gameContentPacks = pgTable(
  'game_content_packs',
  {
    id: id(),
    establishmentId: uuid().references(() => establishments.id, { onDelete: 'cascade' }), // null = pack fourni par Menupulse
    gameId: text().notNull(),
    name: localizedText().notNull(),
    content: jsonb().notNull(), // validé par contentSchema du jeu ; textes localisés à l'intérieur
    contentVersion: smallint().notNull().default(1),
    isPublished: boolean().notNull().default(false),
    updatedAt: stamp()
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('game_content_packs_lookup_idx').on(t.gameId, t.establishmentId),
    check('game_content_packs_id_check', sql`${t.gameId} ~ ${GAME_ID_PATTERN}`),
  ],
);

/** Résumé d'une partie terminée (statistiques). Aucun pseudo ici. */
export const gameSessions = pgTable(
  'game_sessions',
  {
    id: id(),
    establishmentId: tenant(),
    gameId: text().notNull(),
    gameVersion: smallint().notNull(),
    roomKind: text({ enum: ['table', 'venue'] }).notNull(),
    tableId: uuid(), // obligatoire pour une partie de table, null pour une partie de salle
    startedAt: stamp().notNull().defaultNow(),
    endedAt: stamp(),
    playerCount: smallint().notNull(),
    endReason: text({ enum: ['finished', 'abandoned', 'server_restart'] }),
  },
  (t) => [
    foreignKey({
      name: 'game_sessions_table_fk',
      columns: [t.establishmentId, t.tableId],
      foreignColumns: [diningTables.establishmentId, diningTables.id],
    }).onDelete('cascade'),
    index('game_sessions_establishment_idx').on(t.establishmentId, t.startedAt),
    check('game_sessions_room_check', sql`(${t.roomKind} = 'table') = (${t.tableId} IS NOT NULL)`),
    check('game_sessions_players_check', sql`${t.playerCount} >= 1`),
    check(
      'game_sessions_end_check',
      sql`${t.endReason} IS NULL OR ${t.endReason} IN ('finished', 'abandoned', 'server_restart')`,
    ),
  ],
);

/**
 * Tableau d'honneur : le meilleur joueur de la semaine et du mois, par jeu. Donnée personnelle
 * (un pseudo est souvent un prénom) : enregistrée seulement avec l'accord du joueur, supprimable
 * par le personnel (pseudo déplacé affiché sur l'écran du bar), purgée après 12 mois.
 */
export const gameHallOfFame = pgTable(
  'game_hall_of_fame',
  {
    id: id(),
    establishmentId: tenant(),
    gameId: text().notNull(),
    period: text({ enum: ['week', 'month'] }).notNull(),
    periodStart: date().notNull(), // lundi de la semaine ou 1er du mois, heure locale de l'établissement
    pseudo: text().notNull(),
    score: integer().notNull(),
    achievedAt: stamp().notNull().defaultNow(),
  },
  (t) => [
    unique('game_hall_of_fame_period_uq').on(t.establishmentId, t.gameId, t.period, t.periodStart),
    check('game_hall_of_fame_period_check', sql`${t.period} IN ('week', 'month')`),
    check('game_hall_of_fame_pseudo_check', sql`char_length(${t.pseudo}) BETWEEN 1 AND 20`),
  ],
);

/**
 * Bons gagnés aux jeux (Boisson Mystère, Jack-Pot). Le code s'affiche sur le téléphone, mais il n'a de
 * valeur que vérifié ici par le personnel : une capture d'écran réutilisée ou inventée est refusée
 * (redeemed_at, expires_at). Codes sans 0/O ni 1/I, uniques par établissement.
 */
export const gameVouchers = pgTable(
  'game_vouchers',
  {
    id: id(),
    establishmentId: tenant(),
    gameId: text().notNull(),
    code: text().notNull(),
    reward: localizedText().notNull(),
    productId: uuid(), // Boisson Mystère : le produit concerné (sans clé étrangère : le bon survit à la carte)
    tableId: uuid(),
    createdAt: stamp().notNull().defaultNow(),
    expiresAt: stamp().notNull(),
    redeemedAt: stamp(),
  },
  (t) => [
    unique('game_vouchers_code_uq').on(t.establishmentId, t.code),
    index('game_vouchers_daily_idx').on(t.establishmentId, t.gameId, t.createdAt),
    check('game_vouchers_code_check', sql`${t.code} ~ '^[A-HJ-NP-Z2-9]{6}$'`),
    check('game_vouchers_expiry_check', sql`${t.expiresAt} > ${t.createdAt}`),
  ],
);

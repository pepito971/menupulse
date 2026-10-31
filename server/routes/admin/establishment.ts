// Back-office d'un établissement : réglages, modules, tables (QR codes).
// Monté sur /api/admin/establishments/:establishmentId, après loadEstablishmentAccess.
import { randomBytes } from 'node:crypto';
import { Router, type Response } from 'express';
import { and, count, eq, ne, sql } from 'drizzle-orm';
import { isLocale } from '../../../shared/locales.ts';
import { can } from '../../../shared/roles.ts';
import { db } from '../../db/client.ts';
import { diningTables, establishmentModules, establishments } from '../../db/schema.ts';
import { allow, establishmentAccess, isUuid, type EstablishmentAccess } from '../../admin/access.ts';
import { establishmentSettingsSchema, moduleStatusSchema, newTableSchema, tableUpdateSchema, validationError } from '../../admin/validation.ts';
import { isUniqueViolation } from '../../lib/db-errors.ts';

export const MAX_TABLES = 500;

const SLUG_TAKEN = { error: 'Cette adresse est déjà prise par un autre établissement.', field: 'slug', code: 'slug_taken' };
const LABEL_TAKEN = { error: 'Une autre table porte déjà ce nom.', field: 'label', code: 'label_taken' };

/** Jeton du QR code d'une table : 128 bits aléatoires, impossible à deviner d'une table à l'autre. */
export function newQrToken(): string {
  return randomBytes(16).toString('base64url');
}

const bumpMenuVersion = sql`${establishments.menuVersion} + 1`;

async function loadSettings(access: EstablishmentAccess) {
  const [venue] = await db.select().from(establishments).where(eq(establishments.id, access.establishmentId));
  const modules = await db.select().from(establishmentModules).where(eq(establishmentModules.establishmentId, access.establishmentId));
  const v = venue!;
  return {
    id: v.id,
    organizationId: v.organizationId,
    slug: v.slug,
    name: v.name,
    timezone: v.timezone,
    defaultLocale: v.defaultLocale,
    locales: v.locales.filter(isLocale),
    brandColor: v.brandColor,
    forcedTheme: v.forcedTheme,
    gamesOpenUntil: v.gamesOpenUntil,
    menuVersion: v.menuVersion,
    modules: modules.map((m) => ({ module: m.module, status: m.status })),
    role: access.role,
  };
}

async function loadTables(establishmentId: string) {
  const rows = await db
    .select({ id: diningTables.id, label: diningTables.label, qrToken: diningTables.qrToken, isActive: diningTables.isActive })
    .from(diningTables)
    .where(eq(diningTables.establishmentId, establishmentId));
  return rows.sort((a, b) => a.label.localeCompare(b.label, 'fr', { numeric: true })); // T2 avant T10
}

function tableNotFound(res: Response): void {
  res.status(404).json({ error: 'Table introuvable.' });
}

export function createEstablishmentRouter(): Router {
  const router = Router({ mergeParams: true });

  router.get('/', async (_req, res) => {
    res.json(await loadSettings(establishmentAccess(res)));
  });

  // Réglages visibles par les clients : chaque modification fait avancer la version du menu (ETag).
  router.patch('/', allow('establishment.edit'), async (req, res) => {
    const body = establishmentSettingsSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json(validationError(body.error));
      return;
    }
    const access = establishmentAccess(res);
    const changes = body.data;
    if (changes.slug !== undefined && !can(access.role, 'establishment.editSlug')) {
      res.status(403).json({ error: 'Seul un propriétaire peut changer l’adresse de l’établissement.', field: 'slug', code: 'forbidden' });
      return;
    }
    if (Object.keys(changes).length > 0) {
      const [current] = await db
        .select({ defaultLocale: establishments.defaultLocale, locales: establishments.locales })
        .from(establishments)
        .where(eq(establishments.id, access.establishmentId));
      const locales = changes.locales ?? current!.locales;
      if (!locales.includes(changes.defaultLocale ?? current!.defaultLocale)) {
        res.status(400).json({ error: 'La langue par défaut doit faire partie des langues proposées.', field: 'defaultLocale' });
        return;
      }
      try {
        await db
          .update(establishments)
          .set({ ...changes, menuVersion: bumpMenuVersion })
          .where(eq(establishments.id, access.establishmentId));
      } catch (error) {
        if (!isUniqueViolation(error, 'establishments_slug_unique')) throw error;
        res.status(409).json(SLUG_TAKEN);
        return;
      }
    }
    res.json(await loadSettings(access));
  });

  // Modules (Tapsy, Tableo) : actif, en pause (menu masqué, réglages gardés) ou retiré. Il en reste au moins un.
  router.put('/modules/:module', allow('establishment.editModules'), async (req, res) => {
    const module = req.params.module;
    const body = moduleStatusSchema.safeParse(req.body);
    if ((module !== 'tapsy' && module !== 'tableo') || !body.success) {
      res.status(400).json({ error: 'Demande invalide.' });
      return;
    }
    const access = establishmentAccess(res);
    const venueModules = eq(establishmentModules.establishmentId, access.establishmentId);
    if (body.data.status === 'off') {
      const [others] = await db
        .select({ n: count() })
        .from(establishmentModules)
        .where(and(venueModules, ne(establishmentModules.module, module)));
      if (others!.n === 0) {
        res.status(409).json({ error: 'Un établissement garde au moins un module.', code: 'last_module' });
        return;
      }
    }
    await db.transaction(async (tx) => {
      if (body.data.status === 'off') {
        await tx.delete(establishmentModules).where(and(venueModules, eq(establishmentModules.module, module)));
      } else {
        await tx
          .insert(establishmentModules)
          .values({ establishmentId: access.establishmentId, module, status: body.data.status })
          .onConflictDoUpdate({ target: [establishmentModules.establishmentId, establishmentModules.module], set: { status: body.data.status } });
      }
      await tx.update(establishments).set({ menuVersion: bumpMenuVersion }).where(eq(establishments.id, access.establishmentId));
    });
    res.json(await loadSettings(access));
  });

  // ─── Tables et QR codes ──────────────────────────────────────────────────────────────

  router.get('/tables', async (_req, res) => {
    res.json(await loadTables(establishmentAccess(res).establishmentId));
  });

  router.post('/tables', allow('tables.manage'), async (req, res) => {
    const body = newTableSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json(validationError(body.error));
      return;
    }
    const { establishmentId } = establishmentAccess(res);
    const [existing] = await db.select({ n: count() }).from(diningTables).where(eq(diningTables.establishmentId, establishmentId));
    if (existing!.n >= MAX_TABLES) {
      res.status(409).json({ error: `${MAX_TABLES} tables au plus par établissement.`, code: 'too_many_tables' });
      return;
    }
    try {
      const [table] = await db
        .insert(diningTables)
        .values({ establishmentId, label: body.data.label, qrToken: newQrToken() })
        .returning({ id: diningTables.id, label: diningTables.label, qrToken: diningTables.qrToken, isActive: diningTables.isActive });
      res.status(201).json(table);
    } catch (error) {
      if (!isUniqueViolation(error, 'dining_tables_label_uq')) throw error;
      res.status(409).json(LABEL_TAKEN);
    }
  });

  router.patch('/tables/:tableId', allow('tables.manage'), async (req, res) => {
    const body = tableUpdateSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json(validationError(body.error));
      return;
    }
    if (!isUuid(req.params.tableId)) return tableNotFound(res);
    const { establishmentId } = establishmentAccess(res);
    const where = and(eq(diningTables.establishmentId, establishmentId), eq(diningTables.id, req.params.tableId));
    try {
      const [table] = Object.keys(body.data).length
        ? await db.update(diningTables).set(body.data).where(where).returning()
        : await db.select().from(diningTables).where(where);
      if (!table) return tableNotFound(res);
      res.json({ id: table.id, label: table.label, qrToken: table.qrToken, isActive: table.isActive });
    } catch (error) {
      if (!isUniqueViolation(error, 'dining_tables_label_uq')) throw error;
      res.status(409).json(LABEL_TAKEN);
    }
  });

  // Nouveau QR code pour une table (l'ancien circule hors du bar) : l'ancien lien cesse aussitôt de fonctionner.
  router.post('/tables/:tableId/qr-token', allow('tables.manage'), async (req, res) => {
    if (!isUuid(req.params.tableId)) return tableNotFound(res);
    const { establishmentId } = establishmentAccess(res);
    const [table] = await db
      .update(diningTables)
      .set({ qrToken: newQrToken() })
      .where(and(eq(diningTables.establishmentId, establishmentId), eq(diningTables.id, req.params.tableId)))
      .returning();
    if (!table) return tableNotFound(res);
    res.json({ id: table.id, label: table.label, qrToken: table.qrToken, isActive: table.isActive });
  });

  // Supprimer une table efface aussi les statistiques de ses parties ; la désactiver les garde.
  router.delete('/tables/:tableId', allow('tables.manage'), async (req, res) => {
    if (!isUuid(req.params.tableId)) return tableNotFound(res);
    const { establishmentId } = establishmentAccess(res);
    const deleted = await db
      .delete(diningTables)
      .where(and(eq(diningTables.establishmentId, establishmentId), eq(diningTables.id, req.params.tableId)))
      .returning({ id: diningTables.id });
    if (deleted.length === 0) return tableNotFound(res);
    res.status(204).end();
  });

  return router;
}

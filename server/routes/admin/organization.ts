// Back-office d'une organisation : son nom, la création d'établissements, l'équipe (./team.ts).
// Monté sur /api/admin/organizations/:organizationId, après loadOrganizationAccess.
import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.ts';
import { establishmentModules, establishments, organizations } from '../../db/schema.ts';
import { allow, memberAccess } from '../../admin/access.ts';
import { newEstablishmentSchema, organizationSchema, validationError } from '../../admin/validation.ts';
import { isUniqueViolation } from '../../lib/db-errors.ts';
import { createTeamRouter } from './team.ts';

export function createOrganizationRouter(): Router {
  const router = Router({ mergeParams: true });

  router.patch('/', allow('organization.edit'), async (req, res) => {
    const body = organizationSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json(validationError(body.error));
      return;
    }
    const { organizationId } = memberAccess(res);
    const [organization] = await db
      .update(organizations)
      .set({ name: body.data.name })
      .where(eq(organizations.id, organizationId))
      .returning({ id: organizations.id, name: organizations.name });
    res.json(organization);
  });

  router.post('/establishments', allow('establishment.create'), async (req, res) => {
    const body = newEstablishmentSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json(validationError(body.error));
      return;
    }
    const { modules, ...values } = body.data;
    if (!values.locales.includes(values.defaultLocale)) {
      res.status(400).json({ error: 'La langue par défaut doit faire partie des langues proposées.', field: 'defaultLocale' });
      return;
    }
    const { organizationId } = memberAccess(res);
    try {
      const venue = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(establishments)
          .values({ organizationId, ...values })
          .returning({ id: establishments.id, name: establishments.name, slug: establishments.slug });
        await tx.insert(establishmentModules).values(modules.map((module) => ({ establishmentId: created!.id, module })));
        return created!;
      });
      res.status(201).json({ ...venue, modules: modules.map((module) => ({ module, status: 'active' })) });
    } catch (error) {
      if (!isUniqueViolation(error, 'establishments_slug_unique')) throw error;
      res.status(409).json({ error: 'Cette adresse est déjà prise par un autre établissement.', field: 'slug', code: 'slug_taken' });
    }
  });

  router.use('/members', createTeamRouter());

  return router;
}

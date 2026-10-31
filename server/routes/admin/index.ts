// API du back-office (/api/admin) : réservée aux membres connectés, droits relus en base à chaque requête
// (server/admin/access.ts). Organisations et établissements étrangers répondent 404.
import { Router } from 'express';
import { loadEstablishmentAccess, loadOrganizationAccess, requireUser } from '../../admin/access.ts';
import { createEstablishmentRouter } from './establishment.ts';
import { createOrganizationRouter } from './organization.ts';

export function createAdminRouter(): Router {
  const router = Router();
  router.use(requireUser());
  router.use('/organizations/:organizationId', loadOrganizationAccess, createOrganizationRouter());
  router.use('/establishments/:establishmentId', loadEstablishmentAccess, createEstablishmentRouter());
  return router;
}

// API du back-office de bout en bout, sur la base de DATABASE_URL (sautée sans elle). Chaque passage
// crée ses propres organisations, établissements et comptes, et les supprime à la fin.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import type { Server } from 'node:http';
import { after, before, describe, test } from 'node:test';

const ORIGIN = 'http://back-office.test';
const PASSWORD = 'mot de passe de test';
const run = randomBytes(4).toString('hex');

class Agent {
  #cookie = '';
  readonly base: string;
  constructor(base: string) {
    this.base = base;
  }

  async request(method: string, path: string, body?: unknown, headers: Record<string, string> = { origin: ORIGIN }) {
    const response = await fetch(this.base + path, {
      method,
      headers: { 'content-type': 'application/json', cookie: this.#cookie, ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const sid = response.headers.getSetCookie().find((c) => c.startsWith('mp.sid='));
    if (sid) this.#cookie = sid.split(';')[0]!;
    const text = await response.text();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- réponses JSON lues par les assertions
    return { status: response.status, body: (text ? JSON.parse(text) : null) as any };
  }
  get = (path: string) => this.request('GET', path);
  post = (path: string, body: unknown = {}) => this.request('POST', path, body);
  patch = (path: string, body: unknown) => this.request('PATCH', path, body);
  put = (path: string, body: unknown) => this.request('PUT', path, body);
  delete = (path: string) => this.request('DELETE', path);

  async login(email: string, password = PASSWORD) {
    const res = await this.post('/api/auth/login', { email, password });
    assert.equal(res.status, 200, `connexion de ${email}`);
    return res.body;
  }
}

describe('API du back-office', { skip: !process.env.DATABASE_URL && 'DATABASE_URL absent' }, () => {
  let server: Server;
  let base = '';
  let cleanup: () => Promise<void>;
  let insertRestriction: (organizationId: string, userId: string, establishmentId: string) => Promise<unknown>;
  const ids = { orgA: '', orgB: '', a1: '', a2: '', b1: '', ownerA: '' };
  const email = (who: string) => `${who}-${run}@test.menupulse.fr`;

  before(async () => {
    const { createServer } = await import('node:http');
    const { createApp, errorHandler } = await import('../server/app.ts');
    const { db, pool } = await import('../server/db/client.ts');
    const { runMigrations } = await import('../server/db/migrate.ts');
    const schema = await import('../server/db/schema.ts');
    const { hashPassword } = await import('../server/lib/passwords.ts');
    const { createAuthRouter } = await import('../server/routes/auth.ts');
    const { createAdminRouter } = await import('../server/routes/admin/index.ts');
    const { inArray, sql } = await import('drizzle-orm');

    await runMigrations();
    const [orgA, orgB] = await db
      .insert(schema.organizations)
      .values([{ name: `Test A ${run}` }, { name: `Test B ${run}` }])
      .returning();
    ids.orgA = orgA!.id;
    ids.orgB = orgB!.id;
    const [a1, a2, b1] = await db
      .insert(schema.establishments)
      .values([
        { organizationId: ids.orgA, slug: `a1-${run}`, name: 'Bar A1' },
        { organizationId: ids.orgA, slug: `a2-${run}`, name: 'Bar A2' },
        { organizationId: ids.orgB, slug: `b1-${run}`, name: 'Bar B1' },
      ])
      .returning();
    ids.a1 = a1!.id;
    ids.a2 = a2!.id;
    ids.b1 = b1!.id;
    await db.insert(schema.establishmentModules).values([ids.a1, ids.a2, ids.b1].map((establishmentId) => ({ establishmentId, module: 'tapsy' as const })));
    const passwordHash = await hashPassword(PASSWORD);
    const [ownerA, ownerB] = await db
      .insert(schema.users)
      .values([
        { email: email('owner-a'), displayName: 'Propriétaire A', passwordHash },
        { email: email('owner-b'), displayName: 'Propriétaire B', passwordHash },
      ])
      .returning();
    ids.ownerA = ownerA!.id;
    await db.insert(schema.organizationMembers).values([
      { organizationId: ids.orgA, userId: ownerA!.id, role: 'owner' },
      { organizationId: ids.orgB, userId: ownerB!.id, role: 'owner' },
    ]);
    insertRestriction = (organizationId, userId, establishmentId) => db.insert(schema.memberEstablishments).values({ organizationId, userId, establishmentId });

    const app = createApp({
      isProduction: false,
      sessionSecret: 'secret-des-tests',
      allowedOrigins: [ORIGIN],
      mountApi: (api) => {
        api.use('/api/auth', createAuthRouter());
        api.use('/api/admin', createAdminRouter());
      },
    });
    app.use(errorHandler);
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;

    cleanup = async () => {
      const testUsers = sql`${schema.users.email} LIKE ${`%-${run}@test.menupulse.fr`}`;
      const userIds = (await db.select({ id: schema.users.id }).from(schema.users).where(testUsers)).map((u) => u.id);
      if (userIds.length) await pool.query(`DELETE FROM "session" WHERE sess->>'userId' = ANY($1)`, [userIds]);
      await db.delete(schema.organizations).where(inArray(schema.organizations.id, [ids.orgA, ids.orgB]));
      await db.delete(schema.users).where(testUsers);
      await pool.end();
    };
  });

  after(async () => {
    await new Promise((resolve) => server?.close(resolve));
    await cleanup?.();
  });

  test('connexion : même réponse pour un mauvais mot de passe et un compte inconnu', async () => {
    const agent = new Agent(base);
    assert.equal((await agent.get(`/api/admin/establishments/${ids.a1}`)).status, 401);
    const wrong = await agent.post('/api/auth/login', { email: email('owner-a'), password: 'pas le bon mot de passe' });
    const unknown = await agent.post('/api/auth/login', { email: email('personne'), password: 'pas le bon mot de passe' });
    assert.equal(wrong.status, 401);
    assert.deepEqual(unknown, wrong);

    const account = await agent.login(email('OWNER-A')); // adresse insensible à la casse
    assert.deepEqual(
      account.organizations.map((o: { id: string; role: string; establishments: { name: string }[] }) => [o.id, o.role, o.establishments.map((e) => e.name)]),
      [[ids.orgA, 'owner', ['Bar A1', 'Bar A2']]],
    );
    assert.equal((await agent.post('/api/auth/logout')).status, 204);
    assert.equal((await agent.get('/api/auth/me')).status, 401);
  });

  test("une requête qui modifie des données doit venir de l'origine de l'application", async () => {
    const agent = new Agent(base);
    const res = await agent.request('POST', '/api/auth/login', { email: email('owner-a'), password: PASSWORD }, { origin: 'https://ailleurs.example' });
    assert.equal(res.status, 403);
  });

  test("l'établissement ou l'organisation d'un autre répond 404", async () => {
    const agent = new Agent(base);
    await agent.login(email('owner-a'));
    assert.equal((await agent.get(`/api/admin/establishments/${ids.b1}`)).status, 404);
    assert.equal((await agent.patch(`/api/admin/establishments/${ids.b1}`, { name: 'Piraté' })).status, 404);
    assert.equal((await agent.get(`/api/admin/organizations/${ids.orgB}/members`)).status, 404);
    assert.equal((await agent.get('/api/admin/establishments/pas-un-uuid')).status, 404);
  });

  test('réglages : validés, normalisés, et la version du menu avance', async () => {
    const agent = new Agent(base);
    await agent.login(email('owner-a'));
    const path = `/api/admin/establishments/${ids.a1}`;
    const before = (await agent.get(path)).body;
    assert.equal(before.role, 'owner');

    const updated = await agent.patch(path, { name: 'Le Bar A1', locales: ['fr', 'en'], defaultLocale: 'en', timezone: 'america/guadeloupe', brandColor: '#FF8800' });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.name, 'Le Bar A1');
    assert.equal(updated.body.timezone, 'America/Guadeloupe');
    assert.equal(updated.body.brandColor, '#ff8800');
    assert.equal(updated.body.menuVersion, before.menuVersion + 1);

    assert.equal((await agent.patch(path, { locales: ['fr'] })).body.field, 'defaultLocale', 'la langue par défaut doit rester proposée');
    assert.equal((await agent.patch(path, { timezone: 'Mars/Olympus' })).status, 400);
    assert.equal((await agent.patch(path, { menuVersion: 1 })).status, 400);
    const taken = await agent.patch(path, { slug: `a2-${run}` });
    assert.equal(taken.status, 409);
    assert.equal(taken.body.code, 'slug_taken');
  });

  test('modules : un établissement en garde au moins un', async () => {
    const agent = new Agent(base);
    await agent.login(email('owner-a'));
    const path = `/api/admin/establishments/${ids.a2}/modules`;
    assert.equal((await agent.put(`${path}/tapsy`, { status: 'off' })).body.code, 'last_module');
    assert.equal((await agent.put(`${path}/tableo`, { status: 'paused' })).status, 200);
    const res = await agent.put(`${path}/tapsy`, { status: 'off' });
    assert.deepEqual(res.body.modules, [{ module: 'tableo', status: 'paused' }]);
    assert.equal((await agent.put(`${path}/bowling`, { status: 'active' })).status, 400);
  });

  test('tables : ordre naturel, noms uniques, nouveau QR code, suppression', async () => {
    const agent = new Agent(base);
    await agent.login(email('owner-a'));
    const path = `/api/admin/establishments/${ids.a1}/tables`;
    for (const label of ['T10', 'T2', 'T1']) assert.equal((await agent.post(path, { label })).status, 201);
    const tables = (await agent.get(path)).body as { id: string; label: string; qrToken: string }[];
    assert.deepEqual(
      tables.map((t) => t.label),
      ['T1', 'T2', 'T10'],
    );
    assert.match(tables[0]!.qrToken, /^[A-Za-z0-9_-]{22}$/);
    assert.equal((await agent.post(path, { label: 'T1' })).body.code, 'label_taken');
    assert.equal((await agent.patch(`${path}/${tables[1]!.id}`, { label: 'T1' })).body.code, 'label_taken');

    const renewed = await agent.post(`${path}/${tables[0]!.id}/qr-token`);
    assert.notEqual(renewed.body.qrToken, tables[0]!.qrToken);
    assert.equal((await agent.patch(`${path}/${tables[0]!.id}`, { isActive: false })).body.isActive, false);
    assert.equal((await agent.delete(`${path}/${tables[2]!.id}`)).status, 204);
    assert.equal((await agent.delete(`${path}/${tables[2]!.id}`)).status, 404);

    const other = new Agent(base);
    await other.login(email('owner-b'));
    assert.equal((await other.delete(`/api/admin/establishments/${ids.b1}/tables/${tables[0]!.id}`)).status, 404, "table d'un autre établissement");
  });

  test('équipe : mot de passe provisoire, puis droits du gérant limités à ses établissements et aux employés', async () => {
    const owner = new Agent(base);
    await owner.login(email('owner-a'));
    const team = `/api/admin/organizations/${ids.orgA}/members`;

    const created = await owner.post(team, { email: email('manager'), displayName: 'Gérant A1', role: 'manager', establishmentIds: [ids.a1] });
    assert.equal(created.status, 201);
    assert.equal(created.body.member.passwordChangeRequired, true);
    assert.deepEqual(created.body.member.establishmentIds, [ids.a1]);
    const managerId = created.body.member.userId as string;
    assert.equal((await owner.post(team, { email: email('manager'), displayName: 'Doublon', role: 'staff' })).body.code, 'already_member');
    assert.equal((await owner.post(team, { email: email('owner-b'), displayName: 'Autre', role: 'staff' })).body.code, 'account_exists');
    assert.equal((await owner.post(team, { email: email('x'), displayName: 'X', role: 'staff', establishmentIds: [ids.b1] })).status, 400, 'établissement étranger');
    assert.equal((await owner.patch(`${team}/${ids.ownerA}`, { role: 'staff' })).body.code, 'self');

    // première connexion : seul le changement de mot de passe est ouvert
    const manager = new Agent(base);
    const first = await manager.login(email('manager'), created.body.temporaryPassword);
    assert.equal(first.user.passwordChangeRequired, true);
    assert.equal((await manager.get(`/api/admin/establishments/${ids.a1}`)).body.code, 'password_change_required');
    assert.equal((await manager.post('/api/auth/password', { currentPassword: created.body.temporaryPassword, newPassword: 'court' })).body.code, 'too_short');
    const changed = await manager.post('/api/auth/password', { currentPassword: created.body.temporaryPassword, newPassword: 'nouveau mot de passe' });
    assert.equal(changed.status, 200);
    assert.deepEqual(
      changed.body.organizations[0].establishments.map((e: { id: string }) => e.id),
      [ids.a1],
    );

    // établissements : seulement A1, réglages oui, adresse publique non
    assert.equal((await manager.get(`/api/admin/establishments/${ids.a2}`)).status, 404);
    assert.equal((await manager.patch(`/api/admin/establishments/${ids.a1}`, { forcedTheme: 'dark' })).status, 200);
    assert.equal((await manager.patch(`/api/admin/establishments/${ids.a1}`, { slug: `autre-${run}` })).status, 403);
    assert.equal((await manager.put(`/api/admin/establishments/${ids.a1}/modules/tableo`, { status: 'active' })).status, 403);
    assert.equal((await manager.post(`/api/admin/organizations/${ids.orgA}/establishments`, { name: 'X', slug: `x-${run}`, modules: ['tapsy'] })).status, 403);

    // équipe : des employés, dans ses établissements
    assert.equal((await manager.post(team, { email: email('m2'), displayName: 'Autre gérant', role: 'manager', establishmentIds: [ids.a1] })).status, 403);
    assert.equal((await manager.post(team, { email: email('staff'), displayName: 'Lou', role: 'staff' })).status, 403, '« tous les établissements » dépasse les siens');
    const staff = await manager.post(team, { email: email('staff'), displayName: 'Lou', role: 'staff', establishmentIds: [ids.a1] });
    assert.equal(staff.status, 201);
    const staffId = staff.body.member.userId as string;
    assert.equal((await manager.patch(`${team}/${ids.ownerA}`, { role: 'staff' })).status, 403);
    assert.equal((await manager.patch(`${team}/${staffId}`, { establishmentIds: [ids.a2] })).status, 403);

    // l'employé : consulter, pas modifier
    const employee = new Agent(base);
    await employee.login(email('staff'), staff.body.temporaryPassword);
    await employee.post('/api/auth/password', { currentPassword: staff.body.temporaryPassword, newPassword: 'mot de passe employé' });
    assert.equal((await employee.get(`/api/admin/establishments/${ids.a1}`)).status, 200);
    assert.equal((await employee.patch(`/api/admin/establishments/${ids.a1}`, { name: 'X' })).status, 403);
    assert.equal((await employee.post(`/api/admin/establishments/${ids.a1}/tables`, { label: 'X' })).status, 403);
    assert.equal((await employee.get(team)).status, 403);

    // réinitialisation par le gérant : l'employé est déconnecté partout
    const reset = await manager.post(`${team}/${staffId}/password`);
    assert.match(reset.body.temporaryPassword, /^[a-z2-9]{4}-/);
    assert.equal((await employee.get('/api/auth/me')).status, 401);

    // les droits sont relus à chaque requête : le gérant passe sur A2, A1 lui est fermé aussitôt
    assert.equal((await owner.patch(`${team}/${managerId}`, { establishmentIds: [ids.a2] })).status, 200);
    assert.equal((await manager.get(`/api/admin/establishments/${ids.a1}`)).status, 404);
    assert.equal((await manager.get(`/api/admin/establishments/${ids.a2}`)).status, 200);

    // un propriétaire n'est jamais limité ; retirer un membre supprime son compte s'il n'a plus d'organisation
    assert.deepEqual((await owner.patch(`${team}/${managerId}`, { role: 'owner' })).body.establishmentIds, []);
    assert.equal((await owner.delete(`${team}/${staffId}`)).status, 204);
    assert.equal((await new Agent(base).post('/api/auth/login', { email: email('staff'), password: reset.body.temporaryPassword })).status, 401);
    const members = (await owner.get(team)).body as { email: string; isYou: boolean }[];
    assert.deepEqual(members.map((m) => m.email).sort(), [email('manager'), email('owner-a')].sort());
  });

  test("propriétaire : crée un établissement ; la base refuse d'ouvrir l'établissement d'une autre organisation", async () => {
    const owner = new Agent(base);
    await owner.login(email('owner-a'));
    const res = await owner.post(`/api/admin/organizations/${ids.orgA}/establishments`, { name: 'Bar A3', slug: `a3-${run}`, modules: ['tapsy', 'tableo'], locales: ['fr', 'en'] });
    assert.equal(res.status, 201);
    assert.equal((await owner.get(`/api/admin/establishments/${res.body.id}`)).body.timezone, 'Europe/Paris');
    assert.equal((await owner.post(`/api/admin/organizations/${ids.orgA}/establishments`, { name: 'Bis', slug: `a3-${run}`, modules: ['tapsy'] })).body.code, 'slug_taken');
    await assert.rejects(insertRestriction(ids.orgA, ids.ownerA, ids.b1), 'clé composite (organisation, établissement)');
  });
});

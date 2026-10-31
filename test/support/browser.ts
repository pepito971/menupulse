// Aides pour vérifier Menupulse dans un vrai navigateur (Playwright, skill verify-browser). Utilisées par
// des scripts jetables de test/scratch/, pas par `npm test`. Le serveur doit tourner (`npm run dev`) et
// la démonstration exister (`npm run seed:demo`).
import { chromium, devices, type Browser, type Page } from 'playwright';

export const BASE_URL = process.env.APP_ORIGIN ?? 'http://localhost:3100';

/** Données de `npm run seed:demo`. */
export const DEMO = {
  tables: ['demo-table-1', 'demo-table-2'],
  password: 'comptoir-demo',
  owner: 'proprietaire@demo.menupulse.fr',
  manager: 'gerant@demo.menupulse.fr',
  staff: 'serveur@demo.menupulse.fr',
} as const;

export function launch(options: { headed?: boolean } = {}): Promise<Browser> {
  return chromium.launch({ headless: !options.headed });
}

/**
 * Un téléphone de client : contexte isolé (cookies et sessionStorage propres, donc un joueur distinct),
 * écran tactile de téléphone, langue choisie. Plusieurs téléphones = plusieurs joueurs à la même table.
 */
export async function phone(browser: Browser, options: { locale?: 'fr' | 'en' } = {}): Promise<Page> {
  const context = await browser.newContext({ ...devices['Pixel 7'], locale: options.locale ?? 'fr' });
  return context.newPage();
}

/** Ordinateur du gérant (back-office). */
export async function desktop(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'fr' });
  return context.newPage();
}

/** Erreurs de la console et exceptions non rattrapées, à afficher en fin de script. */
export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

/** Rejoint les jeux d'une table avec un pseudo, jusqu'au salon. */
export async function joinTable(page: Page, pseudo: string, options: { table?: string; lang?: 'fr' | 'en' } = {}): Promise<void> {
  await page.goto(`${BASE_URL}/jouer/${options.table ?? DEMO.tables[0]}/${options.lang ?? 'fr'}`);
  await page.locator('input[name="pseudo"]').fill(pseudo);
  await page.locator('form button[type="submit"]').click();
  await page.locator('[data-tab]').first().waitFor();
}

/**
 * Appel de l'API depuis le contexte de la page : mêmes cookies que le navigateur (session du
 * back-office), en-tête Origin attendu par le serveur pour toute modification.
 */
export async function api(page: Page, method: string, path: string, body?: unknown): Promise<{ status: number; body: unknown }> {
  const response = await page.request.fetch(BASE_URL + path, { method, data: body, headers: { origin: BASE_URL } });
  const text = await response.text();
  return { status: response.status(), body: text ? JSON.parse(text) : null };
}

/** Connexion au back-office par l'API (en attendant son interface). */
export async function loginBackOffice(page: Page, email: string, password: string = DEMO.password): Promise<unknown> {
  const response = await api(page, 'POST', '/api/auth/login', { email, password });
  if (response.status !== 200) throw new Error(`connexion de ${email} refusée (${response.status})`);
  return response.body;
}

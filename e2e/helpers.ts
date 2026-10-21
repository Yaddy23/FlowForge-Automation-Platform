import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const API_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://127.0.0.1:3001';

/** Matches DEMO_PASSWORD in server/src/scripts/seed.ts. */
export const DEMO_PASSWORD = 'Demo123!';

export const USERS = {
  admin: 'admin@flowforge.dev',
  workflowAdmin: 'wfadmin@flowforge.dev',
  builder: 'builder@flowforge.dev',
  viewer: 'viewer@flowforge.dev',
} as const;

export function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/** Signs in through the real login form and waits for the app shell to appear. */
export async function loginViaUi(page: Page, email: string, password = DEMO_PASSWORD): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

/**
 * Signs in over the API and returns an access token.
 *
 * Several journey steps have no UI yet — instantiating a template, activating a
 * version, and manually executing a workflow are API-only — so the specs drive
 * those through this token and reserve the browser for the screens that exist.
 */
export async function apiLogin(
  request: APIRequestContext,
  email: string,
  password = DEMO_PASSWORD,
): Promise<string> {
  const res = await request.post(`${API_URL}/api/auth/login`, { data: { email, password } });
  expect(res.ok(), `API login as ${email} returned ${res.status()}`).toBeTruthy();
  const body = (await res.json()) as { accessToken: string };
  return body.accessToken;
}

export interface TemplateRow {
  _id: string;
  name: string;
}

/** Looks up a built-in template by name; the five seeded ones are templates A–E. */
export async function findTemplate(
  request: APIRequestContext,
  token: string,
  name: string,
): Promise<TemplateRow> {
  const res = await request.get(`${API_URL}/api/templates`, { headers: authHeaders(token) });
  expect(res.ok(), `GET /templates returned ${res.status()}`).toBeTruthy();
  const { data } = (await res.json()) as { data: TemplateRow[] };
  const template = data.find((row) => row.name === name);
  expect(template, `template "${name}" should be seeded`).toBeTruthy();
  return template as TemplateRow;
}

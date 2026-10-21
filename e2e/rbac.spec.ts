import { expect, test } from '@playwright/test';
import { USERS, loginViaUi } from './helpers';

/**
 * The plan's second path: a viewer cannot reach the editor, and a builder
 * cannot reach User Management. Each case asserts both halves — the sidebar
 * hides the entry, and typing the URL does not get you there either — plus a
 * positive control, so a passing test cannot just mean the page never rendered.
 */
test.describe('role-based access', () => {
  test('a viewer has no User Management entry and is redirected off the URL', async ({ page }) => {
    await loginViaUi(page, USERS.viewer);

    await expect(page.getByRole('link', { name: 'User Management' })).toHaveCount(0);
    // Positive control: a viewer does get the read-only surfaces.
    await expect(page.getByRole('link', { name: 'Executions', exact: true })).toBeVisible();

    await page.goto('/users');
    await expect(page).toHaveURL('/');
  });

  test('a viewer cannot reach the workflow editor', async ({ page }) => {
    await loginViaUi(page, USERS.viewer);

    await expect(page.getByRole('link', { name: 'Workflow Builder' })).toHaveCount(0);

    await page.goto('/workflows/builder/new');
    await expect(page).toHaveURL('/');
  });

  test('a builder is redirected off User Management and Credentials', async ({ page }) => {
    await loginViaUi(page, USERS.builder);

    await expect(page.getByRole('link', { name: 'User Management' })).toHaveCount(0);
    await page.goto('/users');
    await expect(page).toHaveURL('/');

    await expect(page.getByRole('link', { name: 'Credentials' })).toHaveCount(0);
    await page.goto('/credentials');
    await expect(page).toHaveURL('/');
  });

  test('a super admin can reach both gated pages', async ({ page }) => {
    await loginViaUi(page, USERS.admin);

    await page.getByRole('link', { name: 'User Management' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'User Management' })).toBeVisible();

    await page.getByRole('link', { name: 'Credentials' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Credentials' })).toBeVisible();
  });
});

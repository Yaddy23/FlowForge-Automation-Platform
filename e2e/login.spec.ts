import { expect, test } from '@playwright/test';
import { USERS, loginViaUi } from './helpers';

test.describe('sign in', () => {
  test('a builder signs in and reaches the dashboard', async ({ page }) => {
    await loginViaUi(page, USERS.builder);

    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();

    // The user menu is the one control whose accessible name is the account's,
    // so opening it is what proves the session belongs to the builder.
    await page.locator('button[aria-haspopup="menu"]').click();
    await expect(page.getByRole('menu')).toContainText(USERS.builder);
  });

  test('wrong credentials keep the visitor on the form and explain why', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(USERS.builder);
    await page.getByLabel('Password').fill('definitely-not-the-password');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL('/login');
  });

  test('a signed-out visitor is sent to the login form from a protected route', async ({ page }) => {
    await page.goto('/executions');

    await expect(page).toHaveURL('/login');
    await expect(page.getByRole('heading', { name: 'FlowForge' })).toBeVisible();
  });
});

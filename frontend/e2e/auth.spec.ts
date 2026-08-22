import { expect, Page, test } from '@playwright/test';

const adminSession = {
  accessToken: 'admin-access-token',
  user: { id: 1, email: 'admin@example.test', displayName: 'Ada Admin', role: 'ADMIN' }
};

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/auth/refresh', (route) => route.fulfill({ status: 401, json: {} }));
  await page.route('**/api/v1/auth/login', (route) => route.fulfill({ status: 200, json: adminSession }));
});

test('logs in and exposes admin navigation in the desktop shell', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);

  await expect(page).toHaveURL(/\/products$/);
  await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Utilisateurs' })).toBeVisible();
  await expect(page.getByText('Ada Admin')).toBeVisible();
});

test('opens the product catalogue after logging in from the application root', async ({ page }) => {
  await login(page, '/');

  await expect(page).toHaveURL(/\/products$/);
  await expect(page.getByRole('heading', { name: 'Produits' })).toBeVisible();
});

test('uses bottom navigation on a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);

  await expect(page.getByRole('navigation', { name: 'Navigation mobile' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeHidden();
});

test('redirects a viewer away from user administration', async ({ page }) => {
  await page.route('**/api/v1/auth/login', (route) => route.fulfill({
    status: 200,
    json: { ...adminSession, user: { ...adminSession.user, role: 'VIEWER' } }
  }));
  await login(page, '/login?returnUrl=/users');

  await expect(page).toHaveURL(/\/forbidden$/);
  await expect(page.getByRole('heading', { name: 'Accès refusé' })).toBeVisible();
});

async function login(page: Page, path = '/login'): Promise<void> {
  await page.goto(path);
  await page.getByLabel('Adresse e-mail').fill('admin@example.test');
  await page.getByLabel('Mot de passe').fill('secret-password');
  await page.getByRole('button', { name: 'Se connecter' }).click();
}

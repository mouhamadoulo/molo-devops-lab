import { expect, test } from '@playwright/test';

test('redirects anonymous visitors from products to the login page', async ({ page }) => {
  await page.route('**/api/v1/auth/refresh', (route) => route.fulfill({ status: 401, json: {} }));
  await page.goto('/products');

  await expect(page).toHaveURL(/\/login\?returnUrl=%2Fproducts$/);
  await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();
});

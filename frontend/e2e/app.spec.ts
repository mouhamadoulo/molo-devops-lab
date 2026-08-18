import { expect, test } from '@playwright/test';

test('redirects anonymous visitors from products to the login page', async ({ page }) => {
  await page.goto('/products');

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();
});

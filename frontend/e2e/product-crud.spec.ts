import { expect, Page, Route, test } from '@playwright/test';

const adminSession = {
  accessToken: 'admin-access-token',
  user: { id: 1, email: 'admin@example.test', displayName: 'Ada Admin', role: 'ADMIN' },
};

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/auth/refresh', (route) => route.fulfill({ status: 200, json: adminSession }));
});

test('creates, validates, updates and deletes a product as an administrator', async ({ page }) => {
  const api = productApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/products/new');

  await expect(page.getByRole('heading', { name: 'Créer un produit' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await fillProductForm(page, 'Portable Atlas');
  await page.getByRole('button', { name: 'Créer le produit' }).click();

  await expect(page.getByRole('alert')).toContainText('Corrigez les champs signalés');
  await expect(page.getByText('Ce nom existe déjà.')).toBeVisible();

  await page.getByLabel('Nom du produit').fill('Portable Orion');
  await page.getByRole('button', { name: 'Créer le produit' }).click();
  await expect(page).toHaveURL(/\/products\/9$/);
  await expect(page.getByRole('heading', { name: 'Portable Orion' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('link', { name: 'Modifier' }).click();
  await expect(page).toHaveURL(/\/products\/9\/edit$/);
  await page.getByLabel('Stock').fill('18');
  await page.getByRole('button', { name: 'Enregistrer les modifications' }).click();
  await expect(page).toHaveURL(/\/products\/9$/);
  await expect(page.getByText('18 unités')).toBeVisible();

  const deleteButton = page.getByRole('button', { name: 'Supprimer' });
  await deleteButton.click();
  await expect(page.getByRole('heading', { name: 'Supprimer le produit ?' })).toBeVisible();
  await page.getByRole('button', { name: 'Annuler' }).click();
  await expect(deleteButton).toBeFocused();

  await deleteButton.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Supprimer', exact: true }).click();
  await expect(page).toHaveURL(/\/products$/);
  expect(api.deleted).toBe(true);
});

test('keeps product detail read-only and guards write routes for a viewer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/v1/auth/refresh', (route) => route.fulfill({
    status: 200,
    json: { ...adminSession, user: { ...adminSession.user, role: 'VIEWER' } },
  }));
  productApi(page, false);

  await page.goto('/products/9');
  await expect(page.getByRole('heading', { name: 'Portable Atlas' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Modifier' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Supprimer' })).toHaveCount(0);

  await page.goto('/products/new');
  await expect(page).toHaveURL(/\/forbidden$/);
  await expect(page.getByRole('heading', { name: 'Accès refusé' })).toBeVisible();

  await page.goto('/products/9/edit');
  await expect(page).toHaveURL(/\/forbidden$/);
});

test('allows an editor to create and edit without exposing deletion', async ({ page }) => {
  await page.route('**/api/v1/auth/refresh', (route) => route.fulfill({
    status: 200,
    json: { ...adminSession, user: { ...adminSession.user, role: 'EDITOR' } },
  }));
  productApi(page, false);

  await page.goto('/products/new');
  await expect(page.getByRole('heading', { name: 'Créer un produit' })).toBeVisible();

  await page.goto('/products/9/edit');
  await expect(page.getByRole('heading', { name: 'Modifier Portable Atlas' })).toBeVisible();

  await page.goto('/products/9');
  await expect(page.getByRole('link', { name: 'Modifier' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Supprimer' })).toHaveCount(0);
});

function productApi(page: Page, rejectFirstCreate = true): { deleted: boolean } {
  const state = { deleted: false };
  let rejectCreate = rejectFirstCreate;
  let current = product();

  void page.route('**/api/v1/products**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const isCollection = url.pathname.endsWith('/products');

    if (request.method() === 'POST' && isCollection) {
      if (rejectCreate) {
        rejectCreate = false;
        await validationFailure(route);
        return;
      }
      const body = request.postDataJSON();
      current = { ...current, ...body, id: 9 };
      await route.fulfill({ status: 201, json: current });
      return;
    }

    if (request.method() === 'PUT') {
      current = { ...current, ...request.postDataJSON(), updatedAt: '2026-08-22T18:00:00Z' };
      await route.fulfill({ status: 200, json: current });
      return;
    }

    if (request.method() === 'DELETE') {
      state.deleted = true;
      await route.fulfill({ status: 204 });
      return;
    }

    if (request.method() === 'GET' && !isCollection) {
      await route.fulfill({ status: 200, json: current });
      return;
    }

    await route.fulfill({ status: 200, json: pageResponse(state.deleted ? [] : [current]) });
  });

  return state;
}

async function fillProductForm(page: Page, name: string): Promise<void> {
  await page.getByLabel('Nom du produit').fill(name);
  await page.getByLabel('Description').fill('Poste de travail mobile');
  await page.getByLabel('Catégorie').click();
  await page.getByRole('option', { name: 'Ordinateur portable' }).click();
  await page.getByLabel('Prix TTC').fill('1499.90');
  await page.getByLabel('Stock').fill('12');
}

async function validationFailure(route: Route): Promise<void> {
  await route.fulfill({
    status: 400,
    contentType: 'application/problem+json',
    json: {
      status: 400,
      title: 'Validation impossible',
      detail: 'Corrigez les champs signalés.',
      errors: { name: 'Ce nom existe déjà.' },
      requestId: 'request-crud-42',
    },
  });
}

function product() {
  return {
    id: 9,
    name: 'Portable Atlas',
    description: 'Poste de travail mobile',
    category: 'LAPTOP',
    price: 1499.9,
    stockQuantity: 12,
    available: true,
    createdAt: '2026-08-18T10:00:00Z',
    updatedAt: '2026-08-18T10:00:00Z',
    primaryImage: null,
  };
}

function pageResponse(content: readonly ReturnType<typeof product>[]) {
  return {
    content,
    page: 0,
    size: 20,
    totalElements: content.length,
    totalPages: content.length === 0 ? 0 : 1,
    last: true,
  };
}

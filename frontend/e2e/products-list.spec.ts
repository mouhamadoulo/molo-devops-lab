import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

const adminSession = {
  accessToken: 'admin-access-token',
  user: { id: 1, email: 'admin@example.test', displayName: 'Ada Admin', role: 'ADMIN' },
};

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/auth/refresh', (route) => route.fulfill({ status: 200, json: adminSession }));
});

test('keeps filters, sorting and pagination in the URL on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const requestedQueries: URLSearchParams[] = [];
  await page.route('**/api/v1/products?**', async (route) => {
    const url = new URL(route.request().url());
    requestedQueries.push(url.searchParams);
    await route.fulfill({ status: 200, json: productPage(Number(url.searchParams.get('page') ?? 0)) });
  });

  await page.goto('/products?search=atlas&category=LAPTOP&available=true&page=0&size=20&sort=price&direction=desc');

  await expect(page.getByRole('table', { name: 'Catalogue des produits' })).toBeVisible();
  await expect(page.locator('[data-mobile-cards]')).toBeHidden();
  await expect(page.getByLabel('Rechercher')).toHaveValue('atlas');
  await expect(page.getByText('Recherche : atlas')).toBeVisible();

  const priceSort = page.getByRole('button', { name: 'Trier par prix, ordre décroissant' });
  await priceSort.focus();
  await expect(priceSort).toBeFocused();
  await priceSort.press('Enter');
  await expect(page).toHaveURL(/direction=asc/);

  await page.getByLabel('Rechercher').fill('audio');
  await expect(page).toHaveURL(/search=audio/);
  await expect(page).toHaveURL(/page=0/);
  await page.getByRole('button', { name: 'Page suivante' }).click();
  await expect(page).toHaveURL(/page=1/);

  await page.reload();
  await expect(page.getByLabel('Rechercher')).toHaveValue('audio');
  await expect.poll(() => requestedQueries.at(-1)?.get('search')).toBe('audio');
  await expect.poll(() => requestedQueries.at(-1)?.get('sort')).toBe('price,asc');
});

test('renders tactile product cards instead of the table on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/v1/products?**', (route) => route.fulfill({ status: 200, json: productPage(0) }));

  await page.goto('/products?search=atlas');

  await expect(page.locator('[data-mobile-cards]')).toBeVisible();
  await expect(page.getByRole('table', { name: 'Catalogue des produits' })).toBeHidden();
  await expect(page.getByRole('link', { name: 'Consulter le produit' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Navigation mobile' })).toBeVisible();
  const clearSearch = page.getByRole('button', { name: 'Retirer la recherche atlas' });
  const clearSearchBox = await clearSearch.boundingBox();
  expect(clearSearchBox?.width).toBeGreaterThanOrEqual(44);
  expect(clearSearchBox?.height).toBeGreaterThanOrEqual(44);
});

test('distinguishes loading, filtered empty, catalog empty and failure states', async ({ page }) => {
  let releaseFirstRequest: (() => void) | undefined;
  const firstRequestGate = new Promise<void>((resolve) => {
    releaseFirstRequest = resolve;
  });
  let firstRequest = true;

  await page.route('**/api/v1/products?**', async (route) => {
    if (firstRequest) {
      firstRequest = false;
      await firstRequestGate;
    }
    await fulfillState(route);
  });

  await page.goto('/products?search=introuvable');
  await expect(page.locator('[data-state="loading"]')).toBeVisible();
  await expect(page.locator('[data-skeleton-row]')).toHaveCount(4);
  releaseFirstRequest?.();

  await expect(page.getByRole('heading', { name: 'Aucun résultat' })).toBeVisible();
  await page.getByRole('button', { name: 'Retirer la recherche introuvable' }).click();
  await expect(page.getByRole('heading', { name: 'Aucun produit' })).toBeVisible();

  await page.getByLabel('Rechercher').fill('fail');
  await expect(page.getByRole('alert')).toContainText('Catalogue indisponible');
  await expect(page.getByRole('button', { name: 'Réessayer' })).toBeVisible();
});

async function fulfillState(route: Route): Promise<void> {
  const search = new URL(route.request().url()).searchParams.get('search');
  if (search === 'fail') {
    await route.fulfill({
      status: 503,
      contentType: 'application/problem+json',
      json: {
        status: 503,
        title: 'Catalogue indisponible',
        detail: 'Réessayez dans quelques instants.',
        requestId: 'request-e2e-42',
      },
    });
    return;
  }
  await route.fulfill({ status: 200, json: emptyPage() });
}

function productPage(page: number) {
  return {
    content: [
      {
        id: 7,
        name: 'Portable Atlas',
        description: 'Poste de travail mobile',
        category: 'LAPTOP',
        price: 1499.9,
        stockQuantity: 12,
        available: true,
        createdAt: '2026-08-18T10:00:00Z',
        updatedAt: '2026-08-18T10:00:00Z',
        primaryImage: null,
      },
    ],
    page,
    size: 20,
    totalElements: 42,
    totalPages: 3,
    last: page === 2,
  };
}

function emptyPage() {
  return {
    content: [],
    page: 0,
    size: 20,
    totalElements: 0,
    totalPages: 0,
    last: true,
  };
}

import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

const adminSession = {
  accessToken: 'admin-access-token',
  user: { id: 1, email: 'admin@example.test', displayName: 'Ada Admin', role: 'ADMIN' },
};

interface Account {
  readonly id: number;
  readonly email: string;
  readonly displayName: string;
  readonly role: 'ADMIN' | 'EDITOR' | 'VIEWER';
  readonly enabled: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/auth/refresh', (route) => route.fulfill({
    status: 200,
    json: adminSession,
  }));
});

test('administers a user from creation through access changes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const api = userApi(page, [adminAccount()]);
  await page.goto('/users?page=0&size=20&sort=email&direction=asc');
  await expect(page.getByRole('table', { name: 'Utilisateurs administrés' })).toBeVisible();

  await page.getByRole('button', { name: 'Créer un utilisateur' }).click();
  await page.getByLabel('Adresse e-mail').fill('editor@example.test');
  await page.getByLabel('Nom affiché').fill('Édith Martin');
  await page.getByRole('combobox', { name: 'Rôle' }).click();
  await page.getByRole('option', { name: 'Éditeur' }).click();
  await page.getByLabel('Mot de passe', { exact: true }).fill('secure-password');
  await page.getByLabel('Confirmer le mot de passe').fill('secure-password');
  await page.getByRole('button', { name: 'Créer le compte' }).click();
  await expect(page.getByText('Compte créé')).toBeVisible();

  await page.getByRole('button', { name: 'Modifier Édith Martin' }).click();
  await page.getByLabel('Nom affiché').fill('Édith Durand');
  await page.getByRole('combobox', { name: 'Rôle' }).click();
  await page.getByRole('option', { name: 'Lecteur' }).click();
  await page.getByRole('button', { name: 'Enregistrer les modifications' }).click();
  await expect(page.getByRole('table', { name: 'Utilisateurs administrés' }).getByText('Édith Durand')).toBeVisible();

  await page.getByRole('button', { name: 'Réinitialiser le mot de passe de Édith Durand' }).click();
  await page.getByLabel('Nouveau mot de passe').fill('replacement-password');
  await page.getByLabel('Confirmer le mot de passe').fill('replacement-password');
  await page.getByRole('button', { name: 'Réinitialiser le mot de passe', exact: true }).click();
  await expect(page.getByText('Mot de passe réinitialisé')).toBeVisible();

  await page.getByRole('button', { name: 'Désactiver Édith Durand' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Désactiver le compte' }).click();
  const editorRow = page.getByRole('table', { name: 'Utilisateurs administrés' })
    .getByRole('row').filter({ hasText: 'Édith Durand' });
  await expect(editorRow.getByText('Inactif', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Activer Édith Durand' }).click();
  await expect(editorRow.getByText('Actif', { exact: true })).toBeVisible();
  expect(api.passwordWasReset()).toBe(true);
});

test('renders mobile cards with tactile account actions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 375, height: 667 });
  userApi(page);
  await page.goto('/users');

  await expect(page.locator('[data-mobile-users]')).toBeVisible();
  await expect(page.getByRole('table', { name: 'Utilisateurs administrés' })).toBeHidden();
  await expect(page.getByRole('navigation', { name: 'Navigation mobile' })).toBeVisible();
  const edit = page.getByRole('button', { name: 'Modifier Édith Martin' });
  const box = await edit.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);

  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.getByRole('table', { name: 'Utilisateurs administrés' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('distinguishes loading, empty and recoverable error states', async ({ page }) => {
  let releaseFirstRequest: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => { releaseFirstRequest = resolve; });
  let requestCount = 0;
  await page.route('**/api/v1/users?**', async (route) => {
    requestCount += 1;
    if (requestCount === 1) {
      await gate;
      await route.fulfill({ status: 200, json: userPage([]) });
      return;
    }
    if (requestCount === 2) {
      await route.fulfill({
        status: 503,
        contentType: 'application/problem+json',
        json: {
          status: 503,
          title: 'Utilisateurs indisponibles',
          detail: 'Réessayez dans quelques instants.',
          requestId: 'request-users-42',
        },
      });
      return;
    }
    await route.fulfill({ status: 200, json: userPage([editorAccount()]) });
  });

  await page.goto('/users');
  await expect(page.locator('[data-skeleton-row]')).toHaveCount(4);
  releaseFirstRequest?.();
  await expect(page.getByRole('heading', { name: 'Aucun utilisateur' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('alert')).toContainText('request-users-42');
  await page.getByRole('button', { name: 'Réessayer' }).click();
  await expect(page.getByRole('table', { name: 'Utilisateurs administrés' }).getByText('Édith Martin')).toBeVisible();
});

function userApi(
  page: Page,
  initialUsers: Account[] = [editorAccount()],
): { passwordWasReset: () => boolean } {
  let users = initialUsers;
  let passwordReset = false;
  void page.route('**/api/v1/users**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const idMatch = url.pathname.match(/\/users\/(\d+)/);
    const id = idMatch ? Number(idMatch[1]) : null;

    if (request.method() === 'GET') {
      await route.fulfill({ status: 200, json: userPage(users) });
      return;
    }
    if (request.method() === 'POST') {
      const body = request.postDataJSON() as {
        email: string;
        displayName: string;
        role: Account['role'];
      };
      const created: Account = {
        ...editorAccount(),
        id: 7,
        email: body.email,
        displayName: body.displayName,
        role: body.role,
      };
      users = [...users, created];
      await route.fulfill({ status: 201, json: created });
      return;
    }
    if (request.method() === 'PUT' && url.pathname.endsWith('/password') && id !== null) {
      passwordReset = true;
      await route.fulfill({ status: 204 });
      return;
    }
    if (request.method() === 'PUT' && url.pathname.endsWith('/enabled') && id !== null) {
      const enabled = url.searchParams.get('enabled') === 'true';
      users = users.map((user) => user.id === id ? { ...user, enabled } : user);
      await route.fulfill({ status: 200, json: users.find((user) => user.id === id) });
      return;
    }
    if (request.method() === 'PUT' && id !== null) {
      const body = request.postDataJSON() as Pick<Account, 'displayName' | 'role'>;
      users = users.map((user) => user.id === id ? { ...user, ...body } : user);
      await route.fulfill({ status: 200, json: users.find((user) => user.id === id) });
      return;
    }
    await route.fulfill({ status: 405 });
  });
  return { passwordWasReset: () => passwordReset };
}

function editorAccount(): Account {
  return {
    id: 7,
    email: 'editor@example.test',
    displayName: 'Édith Martin',
    role: 'EDITOR',
    enabled: true,
    createdAt: '2026-08-18T10:00:00Z',
    updatedAt: '2026-08-18T10:00:00Z',
  };
}

function adminAccount(): Account {
  return {
    ...editorAccount(),
    id: 1,
    email: 'admin@example.test',
    displayName: 'Ada Admin',
    role: 'ADMIN',
  };
}

function userPage(content: readonly Account[]) {
  return {
    content,
    page: 0,
    size: 20,
    totalElements: content.length,
    totalPages: content.length === 0 ? 0 : 1,
    last: true,
  };
}

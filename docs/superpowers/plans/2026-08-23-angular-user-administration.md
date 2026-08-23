# Angular User Administration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer l’administration Angular complète des utilisateurs sur le contrat backend `/api/v1/users` existant.

**Architecture:** La feature lazy-loadée `users` sépare le codec d’URL, le client HTTP, un store Signals, une liste responsive et un panneau maître-détail. La page orchestre les mutations, confirmations, annonces accessibles et le retour du focus, tandis que Spring Security reste l’autorité des règles métier.

**Tech Stack:** Angular 22 standalone, TypeScript 6 strict, Reactive Forms typés, Signals, RxJS 7.8, Angular Material 22, Vitest 4 et Playwright 1.62.

**Spec:** `docs/superpowers/specs/2026-08-23-angular-user-administration-design.md`

## Global Constraints

- Conserver Angular 22 standalone, `ChangeDetectionStrategy.OnPush` et TypeScript strict sans `any`.
- Réutiliser les composants et tokens existants ; n’ajouter aucune dépendance npm.
- Utiliser `/api/v1` via `environment.apiUrl`, sans URL absolue ni secret.
- Le frontend reflète les permissions ; le backend reste l’autorité de sécurité et de concurrence.
- Préserver WCAG 2.2 AA, le clavier, le focus visible, les annonces et les cibles tactiles de 44 px.
- Garder la copie en français, directe et opérationnelle.
- Suivre RED, GREEN, REFACTOR pour chaque production de code.
- Ne créer aucun commit sans autorisation explicite de l’utilisateur.

## File Map

- `frontend/src/app/features/users/models/user.ts` : contrats de compte et de mutation.
- `frontend/src/app/features/users/models/user-query.ts` : codec sûr entre URL et pagination Spring.
- `frontend/src/app/features/users/services/users-api.service.ts` : contrat HTTP exclusivement.
- `frontend/src/app/features/users/services/users.store.ts` : état de liste et mutations avec rechargement.
- `frontend/src/app/features/users/components/user-editor-panel/*` : formulaires create/edit/password et panneau responsive.
- `frontend/src/app/features/users/components/user-list/*` : tableau desktop, cartes mobile et actions accessibles.
- `frontend/src/app/features/users/pages/users-page/*` : orchestration de l’URL, du panneau, des confirmations et retours ; le fichier provisoire `pages/users-page.ts` est supprimé.
- `frontend/src/app/features/users/users.routes.ts` : route lazy-loadée réservée à `ADMIN`.
- `frontend/src/app/app.routes.ts` : délégation de `/users` vers les routes de feature.
- `frontend/e2e/users-admin.spec.ts` : parcours administrateur complet et responsive.
- `README.md` et `docs/IMPLEMENTATION_PLAN.md` : état livré et critères mis à jour.

---

### Task 1: User contracts and URL query codec

**Files:**
- Create: `frontend/src/app/features/users/models/user.ts`
- Create: `frontend/src/app/features/users/models/user-query.ts`
- Test: `frontend/src/app/features/users/models/user-query.spec.ts`

**Interfaces:**
- Consumes: `UserRole` depuis `frontend/src/app/core/auth/auth.models.ts` et `ParamMap`/`Params` du routeur.
- Produces: `UserAccount`, `UserPage`, `CreateUserRequest`, `UpdateUserRequest`, `ResetPasswordRequest`, `UserQuery`, `DEFAULT_USER_QUERY`, `userQueryFromParamMap()` et `userQueryToParams()`.

- [ ] **Step 1: Write the failing query codec tests**

```ts
import { convertToParamMap } from '@angular/router';
import { DEFAULT_USER_QUERY, userQueryFromParamMap, userQueryToParams } from './user-query';

describe('user query codec', () => {
  it('deserializes supported pagination and sort values', () => {
    expect(userQueryFromParamMap(convertToParamMap({
      page: '2', size: '40', sort: 'createdAt', direction: 'desc',
    }))).toEqual({ page: 2, size: 40, sort: 'createdAt', direction: 'desc' });
  });

  it('falls back to safe defaults', () => {
    expect(userQueryFromParamMap(convertToParamMap({
      page: '-1', size: '500', sort: 'passwordHash', direction: 'sideways',
    }))).toEqual(DEFAULT_USER_QUERY);
  });

  it('serializes all pagination and sorting values', () => {
    expect(userQueryToParams({ page: 3, size: 10, sort: 'role', direction: 'asc' })).toEqual({
      page: '3', size: '10', sort: 'role', direction: 'asc',
    });
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run from `frontend/`:

```powershell
npm run test:ci -- --include src/app/features/users/models/user-query.spec.ts
```

Expected: FAIL because `user-query.ts` does not exist.

- [ ] **Step 3: Add exact domain contracts**

```ts
import { UserRole } from '../../../core/auth/auth.models';

export const USER_ROLES: readonly UserRole[] = ['ADMIN', 'EDITOR', 'VIEWER'];
export const USER_ROLE_LABELS: Readonly<Record<UserRole, string>> = {
  ADMIN: 'Administrateur', EDITOR: 'Éditeur', VIEWER: 'Lecteur',
};

export interface UserAccount {
  readonly id: number;
  readonly email: string;
  readonly displayName: string;
  readonly role: UserRole;
  readonly enabled: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface UserPage {
  readonly content: readonly UserAccount[];
  readonly page: number;
  readonly size: number;
  readonly totalElements: number;
  readonly totalPages: number;
  readonly last: boolean;
}

export interface CreateUserRequest {
  readonly email: string;
  readonly displayName: string;
  readonly password: string;
  readonly role: UserRole;
}

export interface UpdateUserRequest {
  readonly displayName: string;
  readonly role: UserRole;
}

export interface ResetPasswordRequest { readonly password: string; }
```

- [ ] **Step 4: Implement the safe URL codec**

```ts
import { ParamMap, Params } from '@angular/router';

export const USER_SORTS = ['email', 'displayName', 'role', 'enabled', 'createdAt'] as const;
export const USER_SORT_DIRECTIONS = ['asc', 'desc'] as const;
export const USER_PAGE_SIZES = [10, 20, 40, 80] as const;
export type UserSort = typeof USER_SORTS[number];
export type UserSortDirection = typeof USER_SORT_DIRECTIONS[number];

export interface UserQuery {
  readonly page: number;
  readonly size: number;
  readonly sort: UserSort;
  readonly direction: UserSortDirection;
}

export const DEFAULT_USER_QUERY: UserQuery = { page: 0, size: 20, sort: 'email', direction: 'asc' };

export function userQueryFromParamMap(params: ParamMap): UserQuery {
  const page = Number(params.get('page'));
  const size = Number(params.get('size'));
  const sort = params.get('sort');
  const direction = params.get('direction');
  return {
    page: Number.isInteger(page) && page >= 0 ? page : DEFAULT_USER_QUERY.page,
    size: USER_PAGE_SIZES.includes(size as typeof USER_PAGE_SIZES[number]) ? size : DEFAULT_USER_QUERY.size,
    sort: USER_SORTS.includes(sort as UserSort) ? sort as UserSort : DEFAULT_USER_QUERY.sort,
    direction: USER_SORT_DIRECTIONS.includes(direction as UserSortDirection)
      ? direction as UserSortDirection : DEFAULT_USER_QUERY.direction,
  };
}

export function userQueryToParams(query: UserQuery): Params {
  return { page: String(query.page), size: String(query.size), sort: query.sort, direction: query.direction };
}
```

- [ ] **Step 5: Run GREEN and static checks for this slice**

```powershell
npm run test:ci -- --include src/app/features/users/models/user-query.spec.ts
npm run lint
```

Expected: targeted spec and lint exit with code 0.

---

### Task 2: Typed users HTTP client

**Files:**
- Create: `frontend/src/app/features/users/services/users-api.service.ts`
- Test: `frontend/src/app/features/users/services/users-api.service.spec.ts`

**Interfaces:**
- Consumes: all request/response types from Task 1 and `UserQuery`.
- Produces: `UsersApiService.list/create/update/setEnabled/resetPassword` with typed Observables.

- [ ] **Step 1: Write the failing HTTP contract tests**

```ts
const createBody: CreateUserRequest = {
  email: 'editor@example.test', displayName: 'Édith Martin', password: 'secure-password', role: 'EDITOR',
};
const updateBody: UpdateUserRequest = { displayName: 'Édith Durand', role: 'VIEWER' };

api.list({ page: 2, size: 40, sort: 'role', direction: 'desc' }).subscribe();
const list = http.expectOne((request) => request.url === `${environment.apiUrl}/users`);
expect(list.request.params.get('page')).toBe('2');
expect(list.request.params.get('size')).toBe('40');
expect(list.request.params.get('sort')).toBe('role,desc');
list.flush(page([user()]));

api.create(createBody).subscribe();
expectRequest('POST', `${environment.apiUrl}/users`, createBody).flush(user());

api.update(7, updateBody).subscribe();
expectRequest('PUT', `${environment.apiUrl}/users/7`, updateBody).flush(user());

api.setEnabled(7, false).subscribe();
const enabled = http.expectOne(`${environment.apiUrl}/users/7/enabled?enabled=false`);
expect(enabled.request.method).toBe('PUT');
enabled.flush(user());

api.resetPassword(7, { password: 'new-password-123' }).subscribe();
expectRequest('PUT', `${environment.apiUrl}/users/7/password`, { password: 'new-password-123' }).flush(null);

function expectRequest(method: string, url: string, body: unknown) {
  const request = http.expectOne(url);
  expect(request.request.method).toBe(method);
  expect(request.request.body).toEqual(body);
  return request;
}

function user(): UserAccount {
  return { id: 7, email: 'editor@example.test', displayName: 'Édith Martin', role: 'EDITOR', enabled: true,
    createdAt: '2026-08-18T10:00:00Z', updatedAt: '2026-08-18T10:00:00Z' };
}

function page(content: readonly UserAccount[]): UserPage {
  return { content, page: 2, size: 40, totalElements: content.length, totalPages: 1, last: true };
}
```

The test setup must use `provideHttpClient()`, `provideHttpClientTesting()` and `http.verify()` like `products-api.service.spec.ts`.

- [ ] **Step 2: Run the test and verify RED**

```powershell
npm run test:ci -- --include src/app/features/users/services/users-api.service.spec.ts
```

Expected: FAIL because `UsersApiService` is missing.

- [ ] **Step 3: Implement the minimal HTTP client**

```ts
@Injectable({ providedIn: 'root' })
export class UsersApiService {
  private readonly http = inject(HttpClient);
  private readonly usersUrl = `${environment.apiUrl}/users`;

  list(query: UserQuery): Observable<UserPage> {
    const params = new HttpParams()
      .set('page', query.page)
      .set('size', query.size)
      .set('sort', `${query.sort},${query.direction}`);
    return this.http.get<UserPage>(this.usersUrl, { params });
  }

  create(request: CreateUserRequest): Observable<UserAccount> {
    return this.http.post<UserAccount>(this.usersUrl, request);
  }

  update(id: number, request: UpdateUserRequest): Observable<UserAccount> {
    return this.http.put<UserAccount>(`${this.usersUrl}/${id}`, request);
  }

  setEnabled(id: number, enabled: boolean): Observable<UserAccount> {
    return this.http.put<UserAccount>(`${this.usersUrl}/${id}/enabled`, null, {
      params: new HttpParams().set('enabled', enabled),
    });
  }

  resetPassword(id: number, request: ResetPasswordRequest): Observable<void> {
    return this.http.put<void>(`${this.usersUrl}/${id}/password`, request);
  }
}
```

- [ ] **Step 4: Run GREEN**

```powershell
npm run test:ci -- --include src/app/features/users/services/users-api.service.spec.ts
```

Expected: all HTTP method, URL, query and body assertions pass.

---

### Task 3: Signals store for list state and mutations

**Files:**
- Create: `frontend/src/app/features/users/services/users.store.ts`
- Test: `frontend/src/app/features/users/services/users.store.spec.ts`

**Interfaces:**
- Consumes: `ActivatedRoute.queryParamMap`, `UsersApiService`, `userQueryFromParamMap()` and `mapApiError()`.
- Produces: Signals `status`, `query`, `page`, `users`, `error`, `totalElements`; methods `reload`, `create`, `update`, `setEnabled`, `resetPassword`.

- [ ] **Step 1: Write failing state transition tests**

```ts
it('publishes loading then success or empty from the URL', () => {
  api.list.mockReturnValueOnce(of(page([user()]))).mockReturnValueOnce(of(page([])));
  queryParams.next(convertToParamMap({ sort: 'createdAt', direction: 'desc' }));
  expect(store.status()).toBe('success');
  expect(store.users()).toEqual([user()]);
  expect(store.query().sort).toBe('createdAt');
  queryParams.next(convertToParamMap({ page: '1' }));
  expect(store.status()).toBe('empty');
});

it('maps list failures without leaking the raw error', () => {
  api.list.mockReturnValue(throwError(() => new Error('database password leaked')));
  queryParams.next(convertToParamMap({}));
  expect(store.status()).toBe('error');
  expect(store.error()?.detail).not.toContain('database password');
});

it.each(['create', 'update', 'setEnabled', 'resetPassword'] as const)(
  'reloads the active query after %s', async (method) => {
    api.list.mockReturnValue(of(page([user()])));
    api[method].mockReturnValue(of(method === 'resetPassword' ? undefined : user()));
    queryParams.next(convertToParamMap({ page: '2' }));
    await callMutation(store, method);
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(api.list.mock.calls[1]?.[0].page).toBe(2);
  },
);

async function callMutation(store: UsersStore, method: 'create' | 'update' | 'setEnabled' | 'resetPassword'): Promise<void> {
  switch (method) {
    case 'create': await store.create(createRequest()); return;
    case 'update': await store.update(7, { displayName: 'Édith Durand', role: 'EDITOR' }); return;
    case 'setEnabled': await store.setEnabled(7, false); return;
    case 'resetPassword': await store.resetPassword(7, { password: 'replacement-password' }); return;
  }
}
```

```ts
it('ignores an obsolete response after the URL changes', () => {
  const obsolete = new Subject<UserPage>();
  const current = new Subject<UserPage>();
  api.list.mockReturnValueOnce(obsolete).mockReturnValueOnce(current);
  queryParams.next(convertToParamMap({ page: '0' }));
  queryParams.next(convertToParamMap({ page: '1' }));
  obsolete.next(page([user({ displayName: 'Ancien' })]));
  expect(store.status()).toBe('loading');
  current.next(page([user({ displayName: 'Actuel' })]));
  expect(store.users()[0]?.displayName).toBe('Actuel');
});

function createRequest(): CreateUserRequest {
  return { email: 'editor@example.test', displayName: 'Édith Martin', password: 'secure-password', role: 'EDITOR' };
}

function user(patch: Partial<UserAccount> = {}): UserAccount {
  return { id: 7, email: 'editor@example.test', displayName: 'Édith Martin', role: 'EDITOR', enabled: true,
    createdAt: '2026-08-18T10:00:00Z', updatedAt: '2026-08-18T10:00:00Z', ...patch };
}

function page(content: readonly UserAccount[]): UserPage {
  return { content, page: 0, size: 20, totalElements: content.length,
    totalPages: content.length === 0 ? 0 : 1, last: true };
}
```

- [ ] **Step 2: Run the test and verify RED**

```powershell
npm run test:ci -- --include src/app/features/users/services/users.store.spec.ts
```

Expected: FAIL because `UsersStore` is missing.

- [ ] **Step 3: Implement state derivation**

```ts
type UsersState =
  | { readonly status: 'loading'; readonly query: UserQuery }
  | { readonly status: 'error'; readonly query: UserQuery; readonly error: ApiError }
  | { readonly status: 'empty'; readonly query: UserQuery; readonly page: UserPage }
  | { readonly status: 'success'; readonly query: UserQuery; readonly page: UserPage };

private readonly reloadTrigger = new BehaviorSubject<void>(undefined);
private readonly state = toSignal(
  combineLatest([this.route.queryParamMap, this.reloadTrigger]).pipe(
    map(([params]) => userQueryFromParamMap(params)),
    switchMap((query) => concat(
      of<UsersState>({ status: 'loading', query }),
      this.api.list(query).pipe(
        map((page): UsersState => ({
          status: page.content.length === 0 ? 'empty' : 'success', query, page,
        })),
        catchError((error: unknown) => of<UsersState>({
          status: 'error', query, error: mapApiError(error),
        })),
      ),
    )),
  ),
  { initialValue: { status: 'loading', query: DEFAULT_USER_QUERY } as UsersState },
);
```

Expose computed Signals with the same conventions as `ProductsStore`.

- [ ] **Step 4: Implement mutation methods**

```ts
async create(request: CreateUserRequest): Promise<UserAccount> {
  const user = await firstValueFrom(this.api.create(request));
  this.reload();
  return user;
}

async update(id: number, request: UpdateUserRequest): Promise<UserAccount> {
  const user = await firstValueFrom(this.api.update(id, request));
  this.reload();
  return user;
}

async setEnabled(id: number, enabled: boolean): Promise<UserAccount> {
  const user = await firstValueFrom(this.api.setEnabled(id, enabled));
  this.reload();
  return user;
}

async resetPassword(id: number, request: ResetPasswordRequest): Promise<void> {
  await firstValueFrom(this.api.resetPassword(id, request));
  this.reload();
}
```

- [ ] **Step 5: Run GREEN**

```powershell
npm run test:ci -- --include src/app/features/users/services/users.store.spec.ts
```

Expected: list, stale response, safe error and four mutation reload cases pass.

---

### Task 4: Accessible user editor panel

**Files:**
- Create: `frontend/src/app/features/users/components/user-editor-panel/user-editor-panel.ts`
- Create: `frontend/src/app/features/users/components/user-editor-panel/user-editor-panel.html`
- Create: `frontend/src/app/features/users/components/user-editor-panel/user-editor-panel.scss`
- Test: `frontend/src/app/features/users/components/user-editor-panel/user-editor-panel.spec.ts`

**Interfaces:**
- Consumes: `UserAccount`, request types, role labels and `ApiError`.
- Produces: `UserEditorMode = 'create' | 'edit' | 'password'`; outputs `createUser`, `updateUser`, `resetPassword`, `closeRequested`.

- [ ] **Step 1: Write failing form behavior tests**

```ts
it('validates and normalizes a creation request', () => {
  fixture.componentRef.setInput('mode', 'create');
  component.accountForm.setValue({
    email: '  editor@example.test  ', displayName: '  Édith Martin  ',
    role: 'EDITOR', password: 'secure-password', confirmation: 'secure-password',
  });
  const emitted = vi.fn();
  component.createUser.subscribe(emitted);
  component.submitAccount();
  expect(emitted).toHaveBeenCalledWith({
    email: 'editor@example.test', displayName: 'Édith Martin', role: 'EDITOR', password: 'secure-password',
  });
});

it('rejects blank names, short passwords and mismatched confirmation', () => {
  fixture.componentRef.setInput('mode', 'create');
  component.accountForm.patchValue({ displayName: '   ', password: 'short', confirmation: 'different' });
  component.submitAccount();
  expect(component.accountForm.controls.displayName.hasError('required')).toBe(true);
  expect(component.accountForm.controls.password.hasError('minlength')).toBe(true);
  expect(component.accountForm.hasError('passwordMismatch')).toBe(true);
});

it('emits only displayName and role while editing', () => {
  fixture.componentRef.setInput('mode', 'edit');
  fixture.componentRef.setInput('user', user());
  fixture.detectChanges();
  component.accountForm.patchValue({ displayName: 'Nouveau nom', role: 'VIEWER' });
  const emitted = vi.fn();
  component.updateUser.subscribe(emitted);
  component.submitAccount();
  expect(emitted).toHaveBeenCalledWith({ displayName: 'Nouveau nom', role: 'VIEWER' });
});

it('maps server field errors and reports whether closing would discard changes', () => {
  fixture.componentRef.setInput('apiError', { status: 400, title: 'Validation', detail: 'Corrigez.', fieldErrors: { email: 'Déjà utilisé' } });
  fixture.detectChanges();
  expect(component.accountForm.controls.email.getError('server')).toBe('Déjà utilisé');
  component.accountForm.controls.displayName.setValue('Modifié');
  const emitted = vi.fn();
  component.closeRequested.subscribe(emitted);
  component.requestClose();
  expect(emitted).toHaveBeenCalledWith(true);
});
```

```ts
it('submits password mode without retaining the confirmation', () => {
  fixture.componentRef.setInput('mode', 'password');
  component.passwordForm.setValue({ password: 'replacement-password', confirmation: 'replacement-password' });
  const emitted = vi.fn();
  component.resetPassword.subscribe(emitted);
  component.submitPassword();
  expect(emitted).toHaveBeenCalledWith({ password: 'replacement-password' });
});

it('renders the safe API error and disables submit during a request', () => {
  fixture.componentRef.setInput('mode', 'edit');
  fixture.componentRef.setInput('user', user());
  fixture.componentRef.setInput('apiError', {
    status: 400, title: 'Opération impossible', detail: 'Conservez un administrateur actif.',
    fieldErrors: {}, requestId: 'request-user-42',
  });
  fixture.componentRef.setInput('submitting', true);
  fixture.detectChanges();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('request-user-42');
  expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
});
```

- [ ] **Step 2: Run the test and verify RED**

```powershell
npm run test:ci -- --include src/app/features/users/components/user-editor-panel/user-editor-panel.spec.ts
```

Expected: FAIL because the component is missing.

- [ ] **Step 3: Implement typed forms and validators**

```ts
export type UserEditorMode = 'create' | 'edit' | 'password';

readonly mode = input.required<UserEditorMode>();
readonly user = input<UserAccount | null>(null);
readonly apiError = input<ApiError | null>(null);
readonly submitting = input(false);
readonly createUser = output<CreateUserRequest>();
readonly updateUser = output<UpdateUserRequest>();
readonly resetPassword = output<ResetPasswordRequest>();
readonly closeRequested = output<boolean>();
private readonly heading = viewChild.required<ElementRef<HTMLHeadingElement>>('heading');

readonly accountForm = this.formBuilder.group({
  email: ['', [Validators.required, Validators.email]],
  displayName: ['', [nonBlank, Validators.maxLength(120)]],
  role: this.formBuilder.control<UserRole>('VIEWER', Validators.required),
  password: ['', [Validators.minLength(12), Validators.maxLength(128)]],
  confirmation: [''],
}, { validators: passwordConfirmation });

readonly passwordForm = this.formBuilder.group({
  password: ['', [Validators.required, Validators.minLength(12), Validators.maxLength(128)]],
  confirmation: ['', Validators.required],
}, { validators: passwordConfirmation });
```

Use an `effect()` to reset forms when mode/user changes. In `create`, enable `password` and
`confirmation`, then apply `Validators.required`, the length rules and the group confirmation
validator. In `edit`, disable both password controls so they do not invalidate the account form.
Use a second `effect()` to clear then apply `server` errors from `apiError.fieldErrors` to the form
active for the current mode.

- [ ] **Step 4: Implement mode-specific submission**

```ts
submitAccount(): void {
  if (this.accountForm.invalid) { this.accountForm.markAllAsTouched(); return; }
  const value = this.accountForm.getRawValue();
  if (this.mode() === 'create') {
    this.createUser.emit({
      email: value.email.trim(), displayName: value.displayName.trim(),
      password: value.password, role: value.role,
    });
    return;
  }
  this.updateUser.emit({ displayName: value.displayName.trim(), role: value.role });
}

submitPassword(): void {
  if (this.passwordForm.invalid) { this.passwordForm.markAllAsTouched(); return; }
  this.resetPassword.emit({ password: this.passwordForm.getRawValue().password });
}

requestClose(): void {
  const dirty = this.mode() === 'password' ? this.passwordForm.dirty : this.accountForm.dirty;
  this.closeRequested.emit(dirty);
}

focusHeading(): void {
  this.heading().nativeElement.focus();
}
```

- [ ] **Step 5: Implement accessible panel markup and responsive CSS**

The template must contain:

```html
<aside class="editor" aria-labelledby="user-editor-title">
  <div class="editor-head">
    <div>
      <p>Administration</p>
      <h2 #heading id="user-editor-title" tabindex="-1">{{ title() }}</h2>
    </div>
    <button type="button" aria-label="Fermer le formulaire" (click)="requestClose()">Fermer</button>
  </div>
  @if (apiError(); as error) {
    <div class="form-error" role="alert">
      <strong>{{ error.title }}</strong><span>{{ error.detail }}</span>
      @if (error.requestId) { <small>Référence support : {{ error.requestId }}</small> }
    </div>
  }
  @switch (mode()) {
    @case ('password') {
      <form [formGroup]="passwordForm" (ngSubmit)="submitPassword()" novalidate>
        <mat-form-field appearance="outline">
          <mat-label>Nouveau mot de passe</mat-label>
          <input matInput type="password" formControlName="password" autocomplete="new-password">
          @if (passwordForm.controls.password.touched && passwordForm.controls.password.invalid) {
            <mat-error>Utilisez entre 12 et 128 caractères.</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Confirmer le mot de passe</mat-label>
          <input matInput type="password" formControlName="confirmation" autocomplete="new-password">
          @if (passwordForm.touched && passwordForm.hasError('passwordMismatch')) {
            <mat-error>Les mots de passe doivent être identiques.</mat-error>
          }
        </mat-form-field>
        <button matButton="filled" type="submit" [disabled]="submitting()">Réinitialiser le mot de passe</button>
      </form>
    }
    @default {
      <form [formGroup]="accountForm" (ngSubmit)="submitAccount()" novalidate>
        <mat-form-field appearance="outline">
          <mat-label>Adresse e-mail</mat-label>
          <input matInput type="email" formControlName="email" [readonly]="mode() === 'edit'" autocomplete="email">
          @if (accountForm.controls.email.touched && accountForm.controls.email.invalid) {
            <mat-error>Saisissez une adresse e-mail valide.</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Nom affiché</mat-label>
          <input matInput formControlName="displayName" autocomplete="name">
          @if (accountForm.controls.displayName.touched && accountForm.controls.displayName.invalid) {
            <mat-error>Le nom est requis et limité à 120 caractères.</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Rôle</mat-label>
          <mat-select formControlName="role">
            @for (role of roles; track role) { <mat-option [value]="role">{{ roleLabels[role] }}</mat-option> }
          </mat-select>
        </mat-form-field>
        @if (mode() === 'create') {
          <mat-form-field appearance="outline"><mat-label>Mot de passe</mat-label><input matInput type="password" formControlName="password" autocomplete="new-password"></mat-form-field>
          <mat-form-field appearance="outline"><mat-label>Confirmer le mot de passe</mat-label><input matInput type="password" formControlName="confirmation" autocomplete="new-password"></mat-form-field>
        }
        <button matButton="filled" type="submit" [disabled]="submitting()">
          {{ mode() === 'create' ? 'Créer le compte' : 'Enregistrer les modifications' }}
        </button>
      </form>
    }
  }
</aside>
```

Desktop uses a sticky adjacent panel; `max-width: 760px` makes it full width and non-sticky. Inputs and buttons keep a minimum block size of `2.75rem`.

- [ ] **Step 6: Run GREEN**

```powershell
npm run test:ci -- --include src/app/features/users/components/user-editor-panel/user-editor-panel.spec.ts
npm run lint
```

Expected: validation, mode, error, dirty-close and accessibility assertions pass.

---

### Task 5: Responsive user list and actions

**Files:**
- Create: `frontend/src/app/features/users/components/user-list/user-list.ts`
- Create: `frontend/src/app/features/users/components/user-list/user-list.html`
- Create: `frontend/src/app/features/users/components/user-list/user-list.scss`
- Test: `frontend/src/app/features/users/components/user-list/user-list.spec.ts`

**Interfaces:**
- Consumes: `readonly UserAccount[]`, `UserQuery`, current session id and pending mutation id.
- Produces: `sortChange: Partial<UserQuery>`, `edit`, `password`, `enabledChange`; each action carries `user` and the originating `HTMLElement`.

- [ ] **Step 1: Write failing presentation and action tests**

```ts
it('renders named desktop table and mobile cards', () => {
  fixture.componentRef.setInput('users', [user()]);
  fixture.detectChanges();
  expect(host.querySelector('table')?.getAttribute('aria-label')).toBe('Utilisateurs administrés');
  expect(host.querySelector('[data-mobile-users]')).not.toBeNull();
  expect(host.textContent).toContain('Édith Martin');
  expect(host.textContent).toContain('Éditeur');
  expect(host.textContent).toContain('Actif');
});

it('toggles sort direction for the active property and resets the page', () => {
  fixture.componentRef.setInput('query', { page: 2, size: 20, sort: 'email', direction: 'asc' });
  const emitted = vi.fn();
  component.sortChange.subscribe(emitted);
  component.changeSort('email');
  expect(emitted).toHaveBeenCalledWith({ page: 0, sort: 'email', direction: 'desc' });
});

it('prevents self-disable with an explicit accessible explanation', () => {
  fixture.componentRef.setInput('users', [user({ id: 1 })]);
  fixture.componentRef.setInput('currentUserId', 1);
  fixture.detectChanges();
  const disable = host.querySelector<HTMLButtonElement>('[data-enabled-action]');
  expect(disable?.disabled).toBe(true);
  expect(disable?.getAttribute('aria-label')).toContain('propre compte');
});
```

```ts
it('emits edit, password and enabled actions for the selected account', () => {
  fixture.componentRef.setInput('users', [user()]);
  fixture.detectChanges();
  const edit = vi.fn();
  const password = vi.fn();
  const enabled = vi.fn();
  component.edit.subscribe(edit);
  component.password.subscribe(password);
  component.enabledChange.subscribe(enabled);
  host.querySelector<HTMLButtonElement>('[aria-label="Modifier Édith Martin"]')?.click();
  host.querySelector<HTMLButtonElement>('[aria-label="Réinitialiser le mot de passe de Édith Martin"]')?.click();
  host.querySelector<HTMLButtonElement>('[aria-label="Désactiver Édith Martin"]')?.click();
  expect(edit.mock.calls[0]?.[0].user.id).toBe(7);
  expect(password.mock.calls[0]?.[0].user.id).toBe(7);
  expect(enabled.mock.calls[0]?.[0]).toMatchObject({ user: { id: 7 }, enabled: false });
});

it('uses French labels and disables actions only for the pending account', () => {
  fixture.componentRef.setInput('users', [
    user({ id: 1, role: 'ADMIN', displayName: 'Ada' }),
    user({ id: 2, role: 'EDITOR', displayName: 'Édith' }),
    user({ id: 3, role: 'VIEWER', displayName: 'Victor' }),
  ]);
  fixture.componentRef.setInput('currentUserId', 99);
  fixture.componentRef.setInput('pendingUserId', 2);
  fixture.detectChanges();
  expect(host.textContent).toContain('Administrateur');
  expect(host.textContent).toContain('Éditeur');
  expect(host.textContent).toContain('Lecteur');
  expect(host.querySelector<HTMLButtonElement>('[aria-label="Désactiver Édith"]')?.disabled).toBe(true);
  expect(host.querySelector<HTMLButtonElement>('[aria-label="Désactiver Victor"]')?.disabled).toBe(false);
});
```

- [ ] **Step 2: Run the test and verify RED**

```powershell
npm run test:ci -- --include src/app/features/users/components/user-list/user-list.spec.ts
```

Expected: FAIL because `UserList` is missing.

- [ ] **Step 3: Implement focused component API and sort behavior**

```ts
export interface UserAction {
  readonly user: UserAccount;
  readonly trigger: HTMLElement;
}
export interface UserEnabledAction extends UserAction { readonly enabled: boolean; }

readonly users = input.required<readonly UserAccount[]>();
readonly query = input.required<UserQuery>();
readonly currentUserId = input.required<number>();
readonly pendingUserId = input<number | null>(null);
readonly sortChange = output<Partial<UserQuery>>();
readonly edit = output<UserAction>();
readonly password = output<UserAction>();
readonly enabledChange = output<UserEnabledAction>();

changeSort(sort: UserSort): void {
  this.sortChange.emit({
    page: 0,
    sort,
    direction: this.query().sort === sort && this.query().direction === 'asc' ? 'desc' : 'asc',
  });
}
```

- [ ] **Step 4: Implement table/cards from one action vocabulary**

The desktop table and mobile cards both provide buttons labelled:

```html
<button type="button" [attr.aria-label]="'Modifier ' + user.displayName" (click)="emitEdit(user, $event)">Modifier</button>
<button type="button" [attr.aria-label]="'Réinitialiser le mot de passe de ' + user.displayName" (click)="emitPassword(user, $event)">Mot de passe</button>
<button type="button" data-enabled-action
  [disabled]="pendingUserId() === user.id || user.id === currentUserId()"
  [attr.aria-label]="enabledActionLabel(user)"
  [attr.aria-describedby]="user.id === currentUserId() ? 'self-disable-' + user.id : null"
  (click)="emitEnabled(user, $event)">
  {{ user.enabled ? 'Désactiver' : 'Activer' }}
</button>
@if (user.id === currentUserId()) {
  <span class="visually-hidden" [id]="'self-disable-' + user.id">Vous ne pouvez pas désactiver votre propre compte.</span>
}
```

Use native table semantics and `Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' })`. CSS shows the table above `760px` and `[data-mobile-users]` at or below `760px`; it uses full borders/background tints rather than colored side stripes.

- [ ] **Step 5: Run GREEN**

```powershell
npm run test:ci -- --include src/app/features/users/components/user-list/user-list.spec.ts
```

Expected: responsive DOM, labels, sort and action assertions pass.

---

### Task 6: Users page orchestration and feature route

**Files:**
- Delete: `frontend/src/app/features/users/pages/users-page.ts`
- Create: `frontend/src/app/features/users/pages/users-page/users-page.ts`
- Create: `frontend/src/app/features/users/pages/users-page/users-page.html`
- Create: `frontend/src/app/features/users/pages/users-page/users-page.scss`
- Test: `frontend/src/app/features/users/pages/users-page/users-page.spec.ts`
- Create: `frontend/src/app/features/users/users.routes.ts`
- Test: `frontend/src/app/features/users/users.routes.spec.ts`
- Modify: `frontend/src/app/app.routes.ts`

**Interfaces:**
- Consumes: `UsersStore`, `AuthStore.user`, `UserList`, `UserEditorPanel`, `ConfirmDialog`, `MatPaginator`, `MatSnackBar`, router query codec.
- Produces: the complete `/users` page and `USER_ROUTES` guarded for `ADMIN`.

- [ ] **Step 1: Write failing route tests**

```ts
import { roleGuard } from '../../core/auth/role.guard';
import { USER_ROUTES } from './users.routes';

describe('USER_ROUTES', () => {
  it('guards the administration page for ADMIN only', () => {
    expect(USER_ROUTES).toHaveLength(1);
    expect(USER_ROUTES[0]?.path).toBe('');
    expect(USER_ROUTES[0]?.canActivate).toEqual([roleGuard]);
    expect(USER_ROUTES[0]?.data?.['roles']).toEqual(['ADMIN']);
  });
});
```

- [ ] **Step 2: Write failing page orchestration tests**

Configure `UsersStore`, `AuthStore`, `Router`, `ActivatedRoute`, `MatDialog` and `MatSnackBar` fakes. Assert:

```ts
it('opens create, edit and password modes with the selected account', () => {
  component.openCreate(trigger);
  expect(component.editorMode()).toBe('create');
  component.openEdit({ user: user(), trigger });
  expect(component.editorMode()).toBe('edit');
  expect(component.selectedUser()?.id).toBe(7);
  component.openPassword({ user: user(), trigger });
  expect(component.editorMode()).toBe('password');
});

it('navigates pagination and sorting through URL parameters', () => {
  component.updateQuery({ page: 2, sort: 'createdAt', direction: 'desc' });
  expect(router.navigate).toHaveBeenCalledWith([], expect.objectContaining({
    relativeTo: route,
    replaceUrl: true,
    queryParams: { page: '2', size: '20', sort: 'createdAt', direction: 'desc' },
  }));
});

it('confirms disable, then announces and reloads through the store', async () => {
  dialog.open.mockReturnValue({ afterClosed: () => of(true) });
  await component.changeEnabled({ user: user(), enabled: false, trigger });
  expect(store.setEnabled).toHaveBeenCalledWith(7, false);
  expect(snackbar.open).toHaveBeenCalledWith('Compte désactivé', 'Fermer', expect.any(Object));
  expect(component.announcement()).toBe('Le compte de Édith Martin est désactivé.');
});

it('keeps the editor open and exposes mapped API errors after a failed save', async () => {
  store.update.mockRejectedValue(new HttpErrorResponse({ status: 400, error: problemDetail }));
  await component.updateUser({ displayName: 'Édith', role: 'EDITOR' });
  expect(component.editorMode()).toBe('edit');
  expect(component.mutationError()?.fieldErrors['displayName']).toBeDefined();
});
```

```ts
it('keeps a dirty editor open when discard is cancelled', async () => {
  component.openEdit({ user: user(), trigger });
  dialog.open.mockReturnValue({ afterClosed: () => of(false) });
  await component.requestEditorClose(true);
  expect(component.editorMode()).toBe('edit');
});

it('announces create and password success and restores the initiating focus', async () => {
  component.openCreate(trigger);
  await component.createUser(createRequest());
  expect(store.create).toHaveBeenCalledWith(createRequest());
  expect(component.announcement()).toContain('est créé');
  component.openPassword({ user: user(), trigger });
  await component.resetPassword({ password: 'replacement-password' });
  expect(store.resetPassword).toHaveBeenCalledWith(7, { password: 'replacement-password' });
  expect(component.announcement()).toContain('est réinitialisé');
  await new Promise<void>((resolve) => queueMicrotask(resolve));
  expect(document.activeElement).toBe(trigger);
});
```

- [ ] **Step 3: Run both specs and verify RED**

```powershell
npm run test:ci -- --include src/app/features/users/users.routes.spec.ts --include src/app/features/users/pages/users-page/users-page.spec.ts
```

Expected: FAIL because page orchestration and feature routes are missing.

- [ ] **Step 4: Implement route lazy loading**

```ts
export const USER_ROUTES: Routes = [{
  path: '',
  pathMatch: 'full',
  canActivate: [roleGuard],
  data: { roles: ['ADMIN'] },
  loadComponent: () => import('./pages/users-page/users-page').then((module) => module.UsersPage),
}];
```

Change the `/users` child in `app.routes.ts` to:

```ts
{
  path: 'users',
  loadChildren: () => import('./features/users/users.routes').then((module) => module.USER_ROUTES),
}
```

- [ ] **Step 5: Implement page state and URL orchestration**

```ts
readonly store = inject(UsersStore);
readonly editorMode = signal<UserEditorMode | null>(null);
readonly selectedUser = signal<UserAccount | null>(null);
readonly mutationError = signal<ApiError | null>(null);
readonly submitting = signal(false);
readonly pendingUserId = signal<number | null>(null);
readonly announcement = signal('');
readonly currentUserId = computed(() => this.auth.user()?.id ?? -1);
readonly countLabel = computed(() => {
  const count = this.store.totalElements();
  return `${count} ${count > 1 ? 'utilisateurs' : 'utilisateur'}`;
});
private readonly editorPanel = viewChild(UserEditorPanel);
private restoreFocusTarget: HTMLElement | null = null;

updateQuery(patch: Partial<UserQuery>): void {
  const query = { ...this.store.query(), ...patch };
  void this.router.navigate([], {
    relativeTo: this.route, replaceUrl: true, queryParams: userQueryToParams(query),
  });
}

openCreate(trigger: EventTarget | null): void {
  if (trigger instanceof HTMLElement) this.openEditor('create', null, trigger);
}

openEdit(action: UserAction): void {
  this.openEditor('edit', action.user, action.trigger);
}

openPassword(action: UserAction): void {
  this.openEditor('password', action.user, action.trigger);
}

updatePagination(event: PageEvent): void {
  this.updateQuery({ page: event.pageSize === this.store.query().size ? event.pageIndex : 0, size: event.pageSize });
}

private openEditor(mode: UserEditorMode, user: UserAccount | null, trigger: HTMLElement): void {
  this.restoreFocusTarget = trigger;
  this.selectedUser.set(user);
  this.mutationError.set(null);
  this.editorMode.set(mode);
  queueMicrotask(() => this.editorPanel()?.focusHeading());
}

async requestEditorClose(dirty: boolean): Promise<void> {
  if (dirty) {
    const confirmed = await lastValueFrom(this.dialog.open(ConfirmDialog, {
      data: {
        title: 'Abandonner les modifications ?',
        message: 'Les informations saisies ne seront pas enregistrées.',
        confirmLabel: 'Abandonner',
      },
      restoreFocus: false,
    }).afterClosed());
    if (!confirmed) return;
  }
  this.editorMode.set(null);
  this.selectedUser.set(null);
  this.mutationError.set(null);
  queueMicrotask(() => this.restoreFocusTarget?.focus());
}
```

Use this exact confirmation boundary and map mutation failures with `mapApiError`:

```ts
private async confirmDisable(action: UserEnabledAction): Promise<boolean> {
  const confirmed = await lastValueFrom(this.dialog.open(ConfirmDialog, {
    data: {
      title: 'Désactiver ce compte ?',
      message: `Le compte de ${action.user.displayName} ne pourra plus accéder à la console.`,
      confirmLabel: 'Désactiver le compte',
    },
    restoreFocus: false,
  }).afterClosed());
  if (!confirmed) action.trigger.focus();
  return confirmed === true;
}
```

- [ ] **Step 6: Implement mutation orchestration**

Implement all mutation boundaries and helpers exactly as follows:

```ts
async createUser(request: CreateUserRequest): Promise<void> {
  if (this.submitting()) return;
  this.beginMutation();
  try {
    await this.store.create(request);
    this.finishEditorSuccess('Compte créé', `Le compte de ${request.displayName} est créé.`);
  } catch (error: unknown) {
    this.mutationError.set(mapApiError(error));
  } finally {
    this.submitting.set(false);
  }
}

async updateUser(request: UpdateUserRequest): Promise<void> {
  const user = this.selectedUser();
  if (!user || this.submitting()) return;
  this.beginMutation();
  try {
    await this.store.update(user.id, request);
    this.finishEditorSuccess('Compte modifié', `Le compte de ${request.displayName} est modifié.`);
  } catch (error: unknown) {
    this.mutationError.set(mapApiError(error));
  } finally {
    this.submitting.set(false);
  }
}

async resetPassword(request: ResetPasswordRequest): Promise<void> {
  const user = this.selectedUser();
  if (!user || this.submitting()) return;
  this.beginMutation();
  try {
    await this.store.resetPassword(user.id, request);
    this.finishEditorSuccess('Mot de passe réinitialisé', `Le mot de passe de ${user.displayName} est réinitialisé.`);
  } catch (error: unknown) {
    this.mutationError.set(mapApiError(error));
  } finally {
    this.submitting.set(false);
  }
}

async changeEnabled(action: UserEnabledAction): Promise<void> {
  if (this.pendingUserId() !== null || action.user.id === this.currentUserId()) return;
  if (!action.enabled) {
    const confirmed = await this.confirmDisable(action);
    if (!confirmed) return;
  }
  this.pendingUserId.set(action.user.id);
  try {
    await this.store.setEnabled(action.user.id, action.enabled);
    const state = action.enabled ? 'activé' : 'désactivé';
    this.announcement.set(`Le compte de ${action.user.displayName} est ${state}.`);
    this.snackbar.open(action.enabled ? 'Compte activé' : 'Compte désactivé', 'Fermer', { duration: 4_000 });
  } catch (error: unknown) {
    const apiError = mapApiError(error);
    this.announcement.set(`${apiError.title}. ${apiError.detail}`);
    this.snackbar.open(apiError.detail, 'Fermer', { duration: 6_000 });
  } finally {
    this.pendingUserId.set(null);
    queueMicrotask(() => action.trigger.focus());
  }
}

private beginMutation(): void {
  this.mutationError.set(null);
  this.submitting.set(true);
}

private finishEditorSuccess(message: string, announcement: string): void {
  this.snackbar.open(message, 'Fermer', { duration: 4_000 });
  this.announcement.set(announcement);
  this.editorMode.set(null);
  this.selectedUser.set(null);
  queueMicrotask(() => this.restoreFocusTarget?.focus());
}
```

`changeEnabled()` confirms only a transition to `false`, sets `pendingUserId`, and leaves list data
visible on failure.

- [ ] **Step 7: Implement page template and master-detail layout**

```html
<app-page-header eyebrow="Administration" title="Utilisateurs"
  description="Gérez les comptes, leurs rôles et leur accès à la console.">
  <button type="button" class="primary-action" (click)="openCreate($event.currentTarget)">Créer un utilisateur</button>
</app-page-header>

<div class="users-layout" [class.editor-open]="editorMode() !== null">
  <section aria-labelledby="users-results" [attr.aria-busy]="store.status() === 'loading'">
    <div class="results-bar">
      <div><h2 id="users-results">Comptes</h2><p aria-live="polite">{{ countLabel() }}</p></div>
    </div>
    <app-data-state [state]="store.status()" [error]="store.error()"
      loadingLabel="Chargement des utilisateurs" emptyTitle="Aucun utilisateur"
      emptyMessage="Créez le premier compte pour ouvrir l’accès à la console."
      successLabel="Utilisateurs chargés" (retry)="store.reload()">
      <app-user-list [users]="store.users()" [query]="store.query()"
        [currentUserId]="currentUserId()" [pendingUserId]="pendingUserId()"
        (sortChange)="updateQuery($event)" (edit)="openEdit($event)"
        (password)="openPassword($event)" (enabledChange)="changeEnabled($event)" />
    </app-data-state>
    @if (store.page()) {
      <mat-paginator aria-label="Pagination des utilisateurs"
        [length]="store.totalElements()" [pageIndex]="store.query().page"
        [pageSize]="store.query().size" [pageSizeOptions]="[10, 20, 40, 80]"
        [showFirstLastButtons]="true" (page)="updatePagination($event)" />
    }
  </section>
  @if (editorMode(); as mode) {
    <app-user-editor-panel [mode]="mode" [user]="selectedUser()"
      [apiError]="mutationError()" [submitting]="submitting()"
      (createUser)="createUser($event)" (updateUser)="updateUser($event)"
      (resetPassword)="resetPassword($event)" (closeRequested)="requestEditorClose($event)" />
  }
</div>
<p class="visually-hidden" aria-live="polite">{{ announcement() }}</p>
```

Desktop `.users-layout.editor-open` uses `grid-template-columns: minmax(0, 1fr) minmax(20rem, 26rem)`; mobile returns to one column. Reuse paginator styling and primary button treatment from the product list.

- [ ] **Step 8: Run GREEN**

```powershell
npm run test:ci -- --include src/app/features/users/users.routes.spec.ts --include src/app/features/users/pages/users-page/users-page.spec.ts
npm run lint
npm run build
```

Expected: route/page specs, lint and Angular compilation pass.

---

### Task 7: Playwright administration journey

**Files:**
- Create: `frontend/e2e/users-admin.spec.ts`

**Interfaces:**
- Consumes: the public UI and HTTP contract completed in Tasks 1–6.
- Produces: browser evidence for desktop CRUD, error states, mobile composition and tactile sizing.

- [ ] **Step 1: Write the desktop acceptance journey**

```ts
test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/auth/refresh', (route) => route.fulfill({ status: 200, json: adminSession }));
});

test('administers a user from creation through access changes', async ({ page }) => {
  const api = userApi(page, [adminAccount()]);
  await page.goto('/users?page=0&size=20&sort=email&direction=asc');
  await expect(page.getByRole('table', { name: 'Utilisateurs administrés' })).toBeVisible();

  await page.getByRole('button', { name: 'Créer un utilisateur' }).click();
  await page.getByLabel('Adresse e-mail').fill('editor@example.test');
  await page.getByLabel('Nom affiché').fill('Édith Martin');
  await page.getByLabel('Rôle').click();
  await page.getByRole('option', { name: 'Éditeur' }).click();
  await page.getByLabel('Mot de passe', { exact: true }).fill('secure-password');
  await page.getByLabel('Confirmer le mot de passe').fill('secure-password');
  await page.getByRole('button', { name: 'Créer le compte' }).click();
  await expect(page.getByText('Compte créé')).toBeVisible();

  await page.getByRole('button', { name: 'Modifier Édith Martin' }).click();
  await page.getByLabel('Nom affiché').fill('Édith Durand');
  await page.getByRole('button', { name: 'Enregistrer les modifications' }).click();
  await expect(page.getByText('Édith Durand')).toBeVisible();

  await page.getByRole('button', { name: 'Réinitialiser le mot de passe de Édith Durand' }).click();
  await page.getByLabel('Nouveau mot de passe').fill('replacement-password');
  await page.getByLabel('Confirmer le mot de passe').fill('replacement-password');
  await page.getByRole('button', { name: 'Réinitialiser le mot de passe' }).click();
  await expect(page.getByText('Mot de passe réinitialisé')).toBeVisible();

  await page.getByRole('button', { name: 'Désactiver Édith Durand' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Désactiver le compte' }).click();
  await expect(page.getByText('Inactif')).toBeVisible();
  await page.getByRole('button', { name: 'Activer Édith Durand' }).click();
  await expect(page.getByText('Actif')).toBeVisible();
  expect(api.passwordWasReset()).toBe(true);
});

function userApi(page: Page, initialUsers: UserAccount[] = [editorAccount()]): { passwordWasReset: () => boolean } {
  let users: UserAccount[] = initialUsers;
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
      const body = request.postDataJSON() as CreateUserRequest;
      const created: UserAccount = {
        ...editorAccount(), id: 7, email: body.email, displayName: body.displayName, role: body.role, enabled: true,
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
      const body = request.postDataJSON() as UpdateUserRequest;
      users = users.map((user) => user.id === id ? { ...user, ...body } : user);
      await route.fulfill({ status: 200, json: users.find((user) => user.id === id) });
      return;
    }
    await route.fulfill({ status: 405 });
  });
  return { passwordWasReset: () => passwordReset };
}

function editorAccount() {
  return { id: 7, email: 'editor@example.test', displayName: 'Édith Martin', role: 'EDITOR' as const,
    enabled: true, createdAt: '2026-08-18T10:00:00Z', updatedAt: '2026-08-18T10:00:00Z' };
}

function adminAccount() {
  return { ...editorAccount(), id: 1, email: 'admin@example.test', displayName: 'Ada Admin', role: 'ADMIN' as const };
}

function userPage(content: readonly UserAccount[]) {
  return { content, page: 0, size: 20, totalElements: content.length,
    totalPages: content.length === 0 ? 0 : 1, last: true };
}
```

- [ ] **Step 2: Add loading, error and mobile tests**

```ts
test('renders mobile cards with tactile actions', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  userApi(page);
  await page.goto('/users');
  await expect(page.locator('[data-mobile-users]')).toBeVisible();
  await expect(page.getByRole('table', { name: 'Utilisateurs administrés' })).toBeHidden();
  const edit = page.getByRole('button', { name: 'Modifier Édith Martin' });
  const box = await edit.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);
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
      await route.fulfill({ status: 503, contentType: 'application/problem+json', json: {
        status: 503, title: 'Utilisateurs indisponibles', detail: 'Réessayez dans quelques instants.',
        requestId: 'request-users-42',
      } });
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
  await expect(page.getByText('Édith Martin')).toBeVisible();
});
```

- [ ] **Step 3: Run the acceptance journey**

```powershell
npx playwright test e2e/users-admin.spec.ts
```

Expected: the journey passes if Tasks 1–6 satisfy the browser-level contract. A failure must identify
an integration or accessibility gap that is corrected in Step 4 without weakening selectors.

- [ ] **Step 4: Make only E2E-driven accessibility or integration corrections**

For every failure, adjust the smallest production boundary and add a Vitest regression when the failure exposes component logic. Do not weaken role/name selectors to CSS-only selectors.

- [ ] **Step 5: Run GREEN**

```powershell
npx playwright test e2e/users-admin.spec.ts
```

Expected: all Task 6 Playwright tests pass on desktop and mobile.

---

### Task 8: Documentation and full verification

**Files:**
- Modify: `README.md`
- Modify: `docs/IMPLEMENTATION_PLAN.md`
- Verify: all Task 6 source, tests, spec and plan files.

**Interfaces:**
- Consumes: verified Task 6 behavior and command output.
- Produces: repository status that accurately distinguishes delivered frontend administration from planned DevOps phases.

- [ ] **Step 1: Write documentation assertions as a review checklist**

Confirm the final diff will make these exact facts true:

```text
README: product CRUD, private image gallery and user administration are delivered.
README: Docker application images, pipelines and observability remain planned.
IMPLEMENTATION_PLAN phase 2: user administration increment is documented.
IMPLEMENTATION_PLAN phase 2: main local CRUD journeys are checked only after E2E passes.
```

- [ ] **Step 2: Update README and implementation plan minimally**

Replace stale statements that say product CRUD is planned. Add one concise phase 2 paragraph describing the delivered user administration and its `ADMIN` restriction. Mark the main CRUD acceptance checkbox complete only after the user E2E and existing product E2E both pass.

- [ ] **Step 3: Run the complete frontend validation freshly**

From `frontend/`:

```powershell
npm run lint
npm run test:ci
npm run build
npx playwright test e2e/users-admin.spec.ts
```

Expected: every command exits 0 with no failed test.

- [ ] **Step 4: Run repository-level checks and inspect scope**

From the repository root:

```powershell
git diff --check
git status --short
git diff --stat
```

Expected: `git diff --check` exits 0; status/stat contain only Task 6 files and the already-approved spec/plan.

- [ ] **Step 5: Reconcile acceptance criteria**

Re-read `docs/superpowers/specs/2026-08-23-angular-user-administration-design.md` line by line. For each criterion, cite either a Vitest spec, the Playwright journey or a manual DOM/style inspection. Report any unmet criterion instead of claiming completion.

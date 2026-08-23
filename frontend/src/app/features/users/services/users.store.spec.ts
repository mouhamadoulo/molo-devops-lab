import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, ParamMap } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import {
  CreateUserRequest,
  UserAccount,
  UserPage,
} from '../models/user';
import { UsersApiService } from './users-api.service';
import { UsersStore } from './users.store';

describe('UsersStore', () => {
  let queryParams: Subject<ParamMap>;
  let api: {
    list: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    setEnabled: ReturnType<typeof vi.fn>;
    resetPassword: ReturnType<typeof vi.fn>;
  };
  let store: UsersStore;

  beforeEach(() => {
    queryParams = new Subject<ParamMap>();
    api = {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      setEnabled: vi.fn(),
      resetPassword: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        UsersStore,
        { provide: UsersApiService, useValue: api },
        { provide: ActivatedRoute, useValue: { queryParamMap: queryParams } },
      ],
    });
    store = TestBed.inject(UsersStore);
  });

  it('publishes success or empty from the active URL query', () => {
    api.list.mockReturnValueOnce(of(page([user()]))).mockReturnValueOnce(of(page([])));

    queryParams.next(convertToParamMap({ sort: 'createdAt', direction: 'desc' }));
    expect(store.status()).toBe('success');
    expect(store.users()).toEqual([user()]);
    expect(store.query().sort).toBe('createdAt');

    queryParams.next(convertToParamMap({ page: '1' }));
    expect(store.status()).toBe('empty');
    expect(store.users()).toEqual([]);
  });

  it('maps list failures without leaking the raw error', () => {
    api.list.mockReturnValue(throwError(() => new Error('database password leaked')));

    queryParams.next(convertToParamMap({}));

    expect(store.status()).toBe('error');
    expect(store.error()?.detail).not.toContain('database password');
  });

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

  it('reloads the active query after creation', async () => {
    arrangeMutation();
    api.create.mockReturnValue(of(user()));

    await store.create(createRequest());

    expect(api.list).toHaveBeenCalledTimes(2);
    expect(api.list.mock.calls[1]?.[0].page).toBe(2);
  });

  it('reloads the active query after update', async () => {
    arrangeMutation();
    api.update.mockReturnValue(of(user({ displayName: 'Édith Durand' })));

    await store.update(7, { displayName: 'Édith Durand', role: 'EDITOR' });

    expect(api.list).toHaveBeenCalledTimes(2);
    expect(api.list.mock.calls[1]?.[0].page).toBe(2);
  });

  it('reloads the active query after enabled state changes', async () => {
    arrangeMutation();
    api.setEnabled.mockReturnValue(of(user({ enabled: false })));

    await store.setEnabled(7, false);

    expect(api.list).toHaveBeenCalledTimes(2);
    expect(api.list.mock.calls[1]?.[0].page).toBe(2);
  });

  it('reloads the active query after password reset', async () => {
    arrangeMutation();
    api.resetPassword.mockReturnValue(of(undefined));

    await store.resetPassword(7, { password: 'replacement-password' });

    expect(api.list).toHaveBeenCalledTimes(2);
    expect(api.list.mock.calls[1]?.[0].page).toBe(2);
  });

  function arrangeMutation(): void {
    api.list.mockReturnValue(of(page([user()])));
    queryParams.next(convertToParamMap({ page: '2' }));
  }
});

function createRequest(): CreateUserRequest {
  return {
    email: 'editor@example.test',
    displayName: 'Édith Martin',
    password: 'secure-password',
    role: 'EDITOR',
  };
}

function user(patch: Partial<UserAccount> = {}): UserAccount {
  return {
    id: 7,
    email: 'editor@example.test',
    displayName: 'Édith Martin',
    role: 'EDITOR',
    enabled: true,
    createdAt: '2026-08-18T10:00:00Z',
    updatedAt: '2026-08-18T10:00:00Z',
    ...patch,
  };
}

function page(content: readonly UserAccount[]): UserPage {
  return {
    content,
    page: 0,
    size: 20,
    totalElements: content.length,
    totalPages: content.length === 0 ? 0 : 1,
    last: true,
  };
}

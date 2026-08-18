import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of, throwError } from 'rxjs';
import { AuthApiService } from './auth-api.service';
import { SessionResponse } from './auth.models';
import { AuthStore } from './auth.store';

describe('AuthStore', () => {
  let api: {
    login: ReturnType<typeof vi.fn>;
    refresh: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
  };
  let store: AuthStore;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    api = {
      login: vi.fn(),
      refresh: vi.fn(),
      logout: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        AuthStore,
        { provide: AuthApiService, useValue: api },
      ],
    });
    store = TestBed.inject(AuthStore);
  });

  it('keeps the access token only in private memory state', async () => {
    api.login.mockReturnValue(of(session('memory-only-token')));

    await firstValueFrom(store.login({
      email: 'admin@example.com',
      password: 'secret-password',
    }));

    expect(store.authenticated()).toBe(true);
    expect(store.user()?.email).toBe('admin@example.com');
    expect(store.role()).toBe('ADMIN');
    expect(store.authorizationToken()).toBe('memory-only-token');
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('restores a session through refresh and exposes the restoring state', async () => {
    api.refresh.mockReturnValue(of(session('restored-token')));

    const restored = await firstValueFrom(store.restoreSession());

    expect(restored).toBe(true);
    expect(store.restoring()).toBe(false);
    expect(store.authorizationToken()).toBe('restored-token');
  });

  it('purges memory when session restoration fails', async () => {
    api.login.mockReturnValue(of(session('old-token')));
    await firstValueFrom(store.login({
      email: 'admin@example.com',
      password: 'secret-password',
    }));
    api.refresh.mockReturnValue(throwError(() => new Error('expired')));

    const restored = await firstValueFrom(store.restoreSession());

    expect(restored).toBe(false);
    expect(store.authenticated()).toBe(false);
    expect(store.user()).toBeNull();
    expect(store.authorizationToken()).toBeNull();
  });
});

function session(accessToken: string): SessionResponse {
  return {
    accessToken,
    user: {
      id: 1,
      email: 'admin@example.com',
      displayName: 'Admin',
      role: 'ADMIN',
    },
  };
}

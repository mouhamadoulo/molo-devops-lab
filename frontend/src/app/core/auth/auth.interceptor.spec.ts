import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { forkJoin, firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { authInterceptor } from './auth.interceptor';
import { AuthStore } from './auth.store';

describe('authInterceptor', () => {
  let client: HttpClient;
  let http: HttpTestingController;
  let store: AuthStore;
  let router: { navigateByUrl: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    router = { navigateByUrl: vi.fn().mockResolvedValue(true) };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: Router, useValue: router },
      ],
    });
    client = TestBed.inject(HttpClient);
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(AuthStore);
  });

  afterEach(() => http.verify());

  it('shares one refresh for concurrent 401 responses and replays each request once', async () => {
    await login('old-token');
    const productsUrl = `${environment.apiUrl}/products`;
    const result = firstValueFrom(forkJoin([
      client.get(productsUrl),
      client.get(productsUrl),
    ]));
    const initial = http.match(productsUrl);
    expect(initial).toHaveLength(2);
    expect(initial[0]?.request.headers.get('Authorization')).toBe('Bearer old-token');
    initial.forEach((request) => request.flush(null, { status: 401, statusText: 'Unauthorized' }));

    const refresh = http.expectOne(`${environment.apiUrl}/auth/refresh`);
    expect(refresh.request.headers.has('Authorization')).toBe(false);
    refresh.flush(session('new-token'));

    const retries = http.match(productsUrl);
    expect(retries).toHaveLength(2);
    retries.forEach((request) => {
      expect(request.request.headers.get('Authorization')).toBe('Bearer new-token');
      request.flush({ ok: true });
    });
    await result;
    http.expectNone(`${environment.apiUrl}/auth/refresh`);
  });

  it('purges the session and redirects when refresh fails', async () => {
    await login('old-token');
    const productsUrl = `${environment.apiUrl}/products`;
    const failure = firstValueFrom(client.get(productsUrl)).catch((error: unknown) => error);
    http.expectOne(productsUrl).flush(null, { status: 401, statusText: 'Unauthorized' });
    http.expectOne(`${environment.apiUrl}/auth/refresh`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(await failure).toBeInstanceOf(HttpErrorResponse);
    expect(store.authenticated()).toBe(false);
    expect(store.authorizationToken()).toBeNull();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
    http.expectNone(`${environment.apiUrl}/auth/refresh`);
  });

  async function login(accessToken: string): Promise<void> {
    const loggedIn = firstValueFrom(store.login({
      email: 'admin@example.com',
      password: 'secret-password',
    }));
    http.expectOne(`${environment.apiUrl}/auth/login`).flush(session(accessToken));
    await loggedIn;
  }
});

function session(accessToken: string) {
  return {
    accessToken,
    user: {
      id: 1,
      email: 'admin@example.com',
      displayName: 'Admin',
      role: 'ADMIN' as const,
    },
  };
}

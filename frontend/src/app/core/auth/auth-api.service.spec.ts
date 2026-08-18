import { DOCUMENT } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { AuthApiService } from './auth-api.service';

describe('AuthApiService', () => {
  let service: AuthApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        AuthApiService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: DOCUMENT, useValue: { cookie: 'XSRF-TOKEN=csrf-value' } },
      ],
    });
    service = TestBed.inject(AuthApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('uses credentials only for login, refresh and logout', () => {
    service.login({ email: 'admin@example.com', password: 'secret-password' }).subscribe();
    const login = http.expectOne(`${environment.apiUrl}/auth/login`);
    expect(login.request.withCredentials).toBe(true);
    expect(login.request.headers.has('X-XSRF-TOKEN')).toBe(false);
    login.flush({ accessToken: 'login-token', user: user() });

    service.refresh().subscribe();
    const refresh = http.expectOne(`${environment.apiUrl}/auth/refresh`);
    expect(refresh.request.withCredentials).toBe(true);
    expect(refresh.request.headers.get('X-XSRF-TOKEN')).toBe('csrf-value');
    refresh.flush({ accessToken: 'refresh-token', user: user() });

    service.logout().subscribe();
    const logout = http.expectOne(`${environment.apiUrl}/auth/logout`);
    expect(logout.request.withCredentials).toBe(true);
    expect(logout.request.headers.get('X-XSRF-TOKEN')).toBe('csrf-value');
    logout.flush(null);

    service.me().subscribe();
    const me = http.expectOne(`${environment.apiUrl}/auth/me`);
    expect(me.request.withCredentials).toBe(false);
    me.flush(user());
  });
});

function user() {
  return {
    id: 1,
    email: 'admin@example.com',
    displayName: 'Admin',
    role: 'ADMIN' as const,
  };
}

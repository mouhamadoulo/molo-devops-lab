import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { authGuard } from './auth.guard';
import { UserRole } from './auth.models';
import { roleGuard } from './role.guard';
import { AuthStore } from './auth.store';
import { firstValueFrom, Observable } from 'rxjs';

describe('authentication guards', () => {
  const authenticated = signal(false);
  const role = signal<UserRole | null>(null);
  const restoring = signal(false);

  beforeEach(() => {
    authenticated.set(false);
    role.set(null);
    restoring.set(false);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthStore,
          useValue: { authenticated, role, restoring },
        },
      ],
    });
  });

  it('returns a login UrlTree for an anonymous user', () => {
    const result = TestBed.runInInjectionContext(() =>
      authGuard({} as ActivatedRouteSnapshot, { url: '/products' } as RouterStateSnapshot));

    expect(TestBed.inject(Router).serializeUrl(result as ReturnType<Router['createUrlTree']>))
      .toBe('/login?returnUrl=%2Fproducts');
  });

  it('returns a forbidden UrlTree when the role is insufficient', () => {
    authenticated.set(true);
    role.set('VIEWER');
    const route = { data: { roles: ['ADMIN'] } } as unknown as ActivatedRouteSnapshot;

    const result = TestBed.runInInjectionContext(() =>
      roleGuard(route, { url: '/users' } as RouterStateSnapshot));

    expect(TestBed.inject(Router).serializeUrl(result as ReturnType<Router['createUrlTree']>))
      .toBe('/forbidden');
  });

  it('allows an authenticated user with an accepted role', () => {
    authenticated.set(true);
    role.set('ADMIN');
    const route = { data: { roles: ['ADMIN'] } } as unknown as ActivatedRouteSnapshot;

    const result = TestBed.runInInjectionContext(() =>
      roleGuard(route, { url: '/users' } as RouterStateSnapshot));

    expect(result).toBe(true);
  });

  it('waits for session restoration before deciding', async () => {
    restoring.set(true);
    const result = TestBed.runInInjectionContext(() =>
      authGuard({} as ActivatedRouteSnapshot, { url: '/products' } as RouterStateSnapshot));

    authenticated.set(true);
    restoring.set(false);

    expect(await firstValueFrom(result as Observable<boolean | UrlTree>)).toBe(true);
  });
});

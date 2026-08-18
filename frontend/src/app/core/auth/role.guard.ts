import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { UserRole } from './auth.models';
import { AuthStore } from './auth.store';

export const roleGuard: CanActivateFn = (route, state) => {
  const store = inject(AuthStore);
  const router = inject(Router);
  if (!store.authenticated()) {
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }
  const acceptedRoles = (route.data['roles'] ?? []) as readonly UserRole[];
  const role = store.role();
  return role !== null && (acceptedRoles.length === 0 || acceptedRoles.includes(role))
    ? true
    : router.createUrlTree(['/forbidden']);
};

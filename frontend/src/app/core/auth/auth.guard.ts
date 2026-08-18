import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { CanActivateFn, Router } from '@angular/router';
import { filter, map, take } from 'rxjs';
import { AuthStore } from './auth.store';

export const authGuard: CanActivateFn = (_route, state) => {
  const store = inject(AuthStore);
  const router = inject(Router);
  const decide = () => store.authenticated()
    ? true
    : router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });

  if (store.restoring()) {
    return toObservable(store.restoring).pipe(
      filter((restoring) => !restoring),
      take(1),
      map(decide)
    );
  }
  return decide();
};

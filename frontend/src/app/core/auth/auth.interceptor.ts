import {
  HttpContextToken,
  HttpErrorResponse,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, finalize, Observable, shareReplay, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthStore } from './auth.store';

const RETRIED = new HttpContextToken(() => false);
let refreshInFlight: Observable<string> | null = null;

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const store = inject(AuthStore);
  const router = inject(Router);
  const authenticatedRequest = withBearer(request, store.authorizationToken());

  return next(authenticatedRequest).pipe(
    catchError((error: unknown) => {
      if (!shouldRefresh(authenticatedRequest, error)) {
        return throwError(() => error);
      }
      return sharedRefresh(store).pipe(
        catchError((refreshError: unknown) => failSession(store, router, refreshError)),
        switchMap((token) => {
          const retry = authenticatedRequest.clone({
            context: authenticatedRequest.context.set(RETRIED, true),
            setHeaders: { Authorization: `Bearer ${token}` },
          });
          return next(retry).pipe(
            catchError((retryError: unknown) => {
              if (retryError instanceof HttpErrorResponse && retryError.status === 401) {
                return failSession(store, router, retryError);
              }
              return throwError(() => retryError);
            }),
          );
        }),
      );
    }),
  );
};

function withBearer(request: HttpRequest<unknown>, token: string | null): HttpRequest<unknown> {
  if (token === null || !request.url.startsWith(environment.apiUrl)) {
    return request;
  }
  return request.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}

function shouldRefresh(request: HttpRequest<unknown>, error: unknown): boolean {
  return error instanceof HttpErrorResponse
    && error.status === 401
    && request.url.startsWith(environment.apiUrl)
    && !request.url.startsWith(`${environment.apiUrl}/auth/`)
    && !request.context.get(RETRIED);
}

function sharedRefresh(store: AuthStore): Observable<string> {
  refreshInFlight ??= store.refreshSession().pipe(
    finalize(() => { refreshInFlight = null; }),
    shareReplay({ bufferSize: 1, refCount: false }),
  );
  return refreshInFlight;
}

function failSession(
  store: AuthStore,
  router: Router,
  error: unknown,
): Observable<never> {
  store.clearSession();
  void router.navigateByUrl('/login');
  return throwError(() => error);
}

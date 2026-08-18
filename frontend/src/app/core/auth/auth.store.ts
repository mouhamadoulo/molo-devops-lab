import { computed, inject, Injectable, signal } from '@angular/core';
import { catchError, finalize, map, Observable, of, tap, throwError } from 'rxjs';
import { AuthApiService } from './auth-api.service';
import { CurrentUser, LoginCredentials, SessionResponse } from './auth.models';

@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly api = inject(AuthApiService);
  private readonly userState = signal<CurrentUser | null>(null);
  private readonly accessTokenState = signal<string | null>(null);
  private readonly restoringState = signal(false);
  private readonly errorState = signal<string | null>(null);

  readonly user = this.userState.asReadonly();
  readonly restoring = this.restoringState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly role = computed(() => this.userState()?.role ?? null);
  readonly authenticated = computed(() => this.userState() !== null && this.accessTokenState() !== null);

  login(credentials: LoginCredentials): Observable<CurrentUser> {
    this.errorState.set(null);
    return this.api.login(credentials).pipe(
      tap((session) => this.acceptSession(session)),
      map((session) => session.user),
      catchError((error: unknown) => {
        this.clearSession();
        this.errorState.set('Invalid credentials');
        return throwError(() => error);
      }),
    );
  }

  restoreSession(): Observable<boolean> {
    this.restoringState.set(true);
    return this.api.refresh().pipe(
      tap((session) => this.acceptSession(session)),
      map(() => true),
      catchError(() => {
        this.clearSession();
        return of(false);
      }),
      finalize(() => this.restoringState.set(false)),
    );
  }

  refreshSession(): Observable<string> {
    return this.api.refresh().pipe(
      tap((session) => this.acceptSession(session)),
      map((session) => session.accessToken),
    );
  }

  logout(): Observable<void> {
    return this.api.logout().pipe(finalize(() => this.clearSession()));
  }

  authorizationToken(): string | null {
    return this.accessTokenState();
  }

  clearSession(): void {
    this.accessTokenState.set(null);
    this.userState.set(null);
    this.errorState.set(null);
  }

  private acceptSession(session: SessionResponse): void {
    this.accessTokenState.set(session.accessToken);
    this.userState.set(session.user);
    this.errorState.set(null);
  }
}

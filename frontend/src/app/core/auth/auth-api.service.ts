import { DOCUMENT } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CurrentUser, LoginCredentials, SessionResponse } from './auth.models';
import { xsrfHeaders } from './xsrf';

@Injectable({ providedIn: 'root' })
export class AuthApiService {
  private readonly http = inject(HttpClient);
  private readonly document = inject(DOCUMENT);
  private readonly authUrl = `${environment.apiUrl}/auth`;

  login(credentials: LoginCredentials): Observable<SessionResponse> {
    return this.http.post<SessionResponse>(`${this.authUrl}/login`, credentials, {
      withCredentials: true,
    });
  }

  refresh(): Observable<SessionResponse> {
    return this.http.post<SessionResponse>(`${this.authUrl}/refresh`, null, {
      headers: xsrfHeaders(this.document.cookie),
      withCredentials: true,
    });
  }

  logout(): Observable<void> {
    return this.http.post<void>(`${this.authUrl}/logout`, null, {
      headers: xsrfHeaders(this.document.cookie),
      withCredentials: true,
    });
  }

  me(): Observable<CurrentUser> {
    return this.http.get<CurrentUser>(`${this.authUrl}/me`);
  }
}

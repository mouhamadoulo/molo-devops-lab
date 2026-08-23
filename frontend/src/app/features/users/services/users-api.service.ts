import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  CreateUserRequest,
  ResetPasswordRequest,
  UpdateUserRequest,
  UserAccount,
  UserPage,
} from '../models/user';
import { UserQuery } from '../models/user-query';

@Injectable({ providedIn: 'root' })
export class UsersApiService {
  private readonly http = inject(HttpClient);
  private readonly usersUrl = `${environment.apiUrl}/users`;

  list(query: UserQuery): Observable<UserPage> {
    const params = new HttpParams()
      .set('page', query.page)
      .set('size', query.size)
      .set('sort', `${query.sort},${query.direction}`);
    return this.http.get<UserPage>(this.usersUrl, { params });
  }

  create(request: CreateUserRequest): Observable<UserAccount> {
    return this.http.post<UserAccount>(this.usersUrl, request);
  }

  update(id: number, request: UpdateUserRequest): Observable<UserAccount> {
    return this.http.put<UserAccount>(`${this.usersUrl}/${id}`, request);
  }

  setEnabled(id: number, enabled: boolean): Observable<UserAccount> {
    return this.http.put<UserAccount>(`${this.usersUrl}/${id}/enabled`, null, {
      params: new HttpParams().set('enabled', enabled),
    });
  }

  resetPassword(id: number, request: ResetPasswordRequest): Observable<void> {
    return this.http.put<void>(`${this.usersUrl}/${id}/password`, request);
  }
}

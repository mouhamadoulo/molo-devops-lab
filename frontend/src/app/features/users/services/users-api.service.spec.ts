import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import {
  CreateUserRequest,
  UpdateUserRequest,
  UserAccount,
  UserPage,
} from '../models/user';
import { UsersApiService } from './users-api.service';

describe('UsersApiService', () => {
  let api: UsersApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [UsersApiService, provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(UsersApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('translates the URL query to Spring pagination parameters', () => {
    api.list({ page: 2, size: 40, sort: 'role', direction: 'desc' }).subscribe();

    const request = http.expectOne((candidate) => candidate.url === `${environment.apiUrl}/users`);
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('page')).toBe('2');
    expect(request.request.params.get('size')).toBe('40');
    expect(request.request.params.get('sort')).toBe('role,desc');
    request.flush(page([user()]));
  });

  it('exposes typed create and update requests', () => {
    const createBody: CreateUserRequest = {
      email: 'editor@example.test',
      displayName: 'Édith Martin',
      password: 'secure-password',
      role: 'EDITOR',
    };
    const updateBody: UpdateUserRequest = { displayName: 'Édith Durand', role: 'VIEWER' };

    api.create(createBody).subscribe();
    expectRequest('POST', `${environment.apiUrl}/users`, createBody).flush(user());

    api.update(7, updateBody).subscribe();
    expectRequest('PUT', `${environment.apiUrl}/users/7`, updateBody).flush(user());
  });

  it('sets enabled state through the exact query contract', () => {
    api.setEnabled(7, false).subscribe();

    const request = http.expectOne(`${environment.apiUrl}/users/7/enabled?enabled=false`);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toBeNull();
    request.flush({ ...user(), enabled: false });
  });

  it('resets the password without exposing it in the response', () => {
    api.resetPassword(7, { password: 'new-password-123' }).subscribe();

    expectRequest(
      'PUT',
      `${environment.apiUrl}/users/7/password`,
      { password: 'new-password-123' },
    ).flush(null);
  });

  function expectRequest(method: string, url: string, body: unknown) {
    const request = http.expectOne(url);
    expect(request.request.method).toBe(method);
    expect(request.request.body).toEqual(body);
    return request;
  }
});

function user(): UserAccount {
  return {
    id: 7,
    email: 'editor@example.test',
    displayName: 'Édith Martin',
    role: 'EDITOR',
    enabled: true,
    createdAt: '2026-08-18T10:00:00Z',
    updatedAt: '2026-08-18T10:00:00Z',
  };
}

function page(content: readonly UserAccount[]): UserPage {
  return {
    content,
    page: 2,
    size: 40,
    totalElements: content.length,
    totalPages: 1,
    last: true,
  };
}

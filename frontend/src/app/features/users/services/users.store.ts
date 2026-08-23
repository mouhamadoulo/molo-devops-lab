import { computed, inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import {
  BehaviorSubject,
  catchError,
  combineLatest,
  concat,
  firstValueFrom,
  map,
  of,
  switchMap,
} from 'rxjs';
import { mapApiError } from '../../../core/http/api-error.mapper';
import { ApiError } from '../../../core/http/problem-detail';
import {
  CreateUserRequest,
  ResetPasswordRequest,
  UpdateUserRequest,
  UserAccount,
  UserPage,
} from '../models/user';
import {
  DEFAULT_USER_QUERY,
  UserQuery,
  userQueryFromParamMap,
} from '../models/user-query';
import { UsersApiService } from './users-api.service';

type UsersState =
  | { readonly status: 'loading'; readonly query: UserQuery }
  | { readonly status: 'error'; readonly query: UserQuery; readonly error: ApiError }
  | { readonly status: 'empty'; readonly query: UserQuery; readonly page: UserPage }
  | { readonly status: 'success'; readonly query: UserQuery; readonly page: UserPage };

@Injectable({ providedIn: 'root' })
export class UsersStore {
  private readonly api = inject(UsersApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly reloadTrigger = new BehaviorSubject<void>(undefined);

  private readonly state = toSignal(
    combineLatest([this.route.queryParamMap, this.reloadTrigger]).pipe(
      map(([params]) => userQueryFromParamMap(params)),
      switchMap((query) => concat(
        of<UsersState>({ status: 'loading', query }),
        this.api.list(query).pipe(
          map((page): UsersState => ({
            status: page.content.length === 0 ? 'empty' : 'success',
            query,
            page,
          })),
          catchError((error: unknown) => of<UsersState>({
            status: 'error',
            query,
            error: mapApiError(error),
          })),
        ),
      )),
    ),
    { initialValue: { status: 'loading', query: DEFAULT_USER_QUERY } as UsersState },
  );

  readonly status = computed(() => this.state().status);
  readonly query = computed(() => this.state().query);
  readonly page = computed(() => {
    const state = this.state();
    return 'page' in state ? state.page : null;
  });
  readonly users = computed<readonly UserAccount[]>(() => this.page()?.content ?? []);
  readonly error = computed(() => {
    const state = this.state();
    return state.status === 'error' ? state.error : null;
  });
  readonly totalElements = computed(() => this.page()?.totalElements ?? 0);

  reload(): void {
    this.reloadTrigger.next();
  }

  async create(request: CreateUserRequest): Promise<UserAccount> {
    const user = await firstValueFrom(this.api.create(request));
    this.reload();
    return user;
  }

  async update(id: number, request: UpdateUserRequest): Promise<UserAccount> {
    const user = await firstValueFrom(this.api.update(id, request));
    this.reload();
    return user;
  }

  async setEnabled(id: number, enabled: boolean): Promise<UserAccount> {
    const user = await firstValueFrom(this.api.setEnabled(id, enabled));
    this.reload();
    return user;
  }

  async resetPassword(id: number, request: ResetPasswordRequest): Promise<void> {
    await firstValueFrom(this.api.resetPassword(id, request));
    this.reload();
  }
}

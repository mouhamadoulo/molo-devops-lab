import { ParamMap, Params } from '@angular/router';

export const USER_SORTS = ['email', 'displayName', 'role', 'enabled', 'createdAt'] as const;
export const USER_SORT_DIRECTIONS = ['asc', 'desc'] as const;
export const USER_PAGE_SIZES = [10, 20, 40, 80] as const;

export type UserSort = typeof USER_SORTS[number];
export type UserSortDirection = typeof USER_SORT_DIRECTIONS[number];

export interface UserQuery {
  readonly page: number;
  readonly size: number;
  readonly sort: UserSort;
  readonly direction: UserSortDirection;
}

export const DEFAULT_USER_QUERY: UserQuery = {
  page: 0,
  size: 20,
  sort: 'email',
  direction: 'asc',
};

export function userQueryFromParamMap(params: ParamMap): UserQuery {
  const page = Number(params.get('page'));
  const size = Number(params.get('size'));
  const sort = params.get('sort');
  const direction = params.get('direction');

  return {
    page: Number.isInteger(page) && page >= 0 ? page : DEFAULT_USER_QUERY.page,
    size: USER_PAGE_SIZES.includes(size as typeof USER_PAGE_SIZES[number])
      ? size
      : DEFAULT_USER_QUERY.size,
    sort: USER_SORTS.includes(sort as UserSort) ? sort as UserSort : DEFAULT_USER_QUERY.sort,
    direction: USER_SORT_DIRECTIONS.includes(direction as UserSortDirection)
      ? direction as UserSortDirection
      : DEFAULT_USER_QUERY.direction,
  };
}

export function userQueryToParams(query: UserQuery): Params {
  return {
    page: String(query.page),
    size: String(query.size),
    sort: query.sort,
    direction: query.direction,
  };
}

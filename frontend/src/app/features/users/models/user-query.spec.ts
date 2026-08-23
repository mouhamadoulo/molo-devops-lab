import { convertToParamMap } from '@angular/router';
import { DEFAULT_USER_QUERY, userQueryFromParamMap, userQueryToParams } from './user-query';

describe('user query codec', () => {
  it('deserializes supported pagination and sort values', () => {
    expect(userQueryFromParamMap(convertToParamMap({
      page: '2',
      size: '40',
      sort: 'createdAt',
      direction: 'desc',
    }))).toEqual({ page: 2, size: 40, sort: 'createdAt', direction: 'desc' });
  });

  it('falls back to safe defaults for unsupported values', () => {
    expect(userQueryFromParamMap(convertToParamMap({
      page: '-1',
      size: '500',
      sort: 'passwordHash',
      direction: 'sideways',
    }))).toEqual(DEFAULT_USER_QUERY);
  });

  it('serializes pagination and sorting values', () => {
    expect(userQueryToParams({ page: 3, size: 10, sort: 'role', direction: 'asc' })).toEqual({
      page: '3',
      size: '10',
      sort: 'role',
      direction: 'asc',
    });
  });
});

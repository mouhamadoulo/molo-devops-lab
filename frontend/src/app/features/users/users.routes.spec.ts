import { roleGuard } from '../../core/auth/role.guard';
import { USER_ROUTES } from './users.routes';

describe('USER_ROUTES', () => {
  it('guards the administration page for ADMIN only', () => {
    expect(USER_ROUTES).toHaveLength(1);
    expect(USER_ROUTES[0]?.path).toBe('');
    expect(USER_ROUTES[0]?.canActivate).toEqual([roleGuard]);
    expect(USER_ROUTES[0]?.data?.['roles']).toEqual(['ADMIN']);
  });
});

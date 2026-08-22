import { roleGuard } from '../../core/auth/role.guard';
import { PRODUCT_ROUTES } from './products.routes';

describe('PRODUCT_ROUTES', () => {
  it('keeps read routes public to authenticated users and guards writes by role', () => {
    expect(PRODUCT_ROUTES.map((route) => route.path)).toEqual(['new', ':id/edit', ':id', '']);

    const create = PRODUCT_ROUTES[0];
    const edit = PRODUCT_ROUTES[1];
    const detail = PRODUCT_ROUTES[2];

    expect(create.canActivate).toEqual([roleGuard]);
    expect(create.data?.['roles']).toEqual(['ADMIN', 'EDITOR']);
    expect(edit.canActivate).toEqual([roleGuard]);
    expect(edit.data?.['roles']).toEqual(['ADMIN', 'EDITOR']);
    expect(detail.canActivate).toBeUndefined();
  });
});

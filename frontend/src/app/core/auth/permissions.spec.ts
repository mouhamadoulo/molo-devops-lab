import { hasPermission } from './permissions';

describe('permission map', () => {
  it('keeps user administration exclusive to administrators', () => {
    expect(hasPermission('ADMIN', 'manageUsers')).toBe(true);
    expect(hasPermission('EDITOR', 'manageUsers')).toBe(false);
    expect(hasPermission('VIEWER', 'manageUsers')).toBe(false);
  });
});

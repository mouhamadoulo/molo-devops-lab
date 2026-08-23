import { UserRole } from './auth.models';

export type Permission =
  | 'manageUsers'
  | 'createProduct'
  | 'editProduct'
  | 'deleteProduct'
  | 'manageProductImages';

const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  ADMIN: ['manageUsers', 'createProduct', 'editProduct', 'deleteProduct', 'manageProductImages'],
  EDITOR: ['createProduct', 'editProduct', 'manageProductImages'],
  VIEWER: []
};

export function hasPermission(role: UserRole | null, permission: Permission): boolean {
  return role !== null && ROLE_PERMISSIONS[role].includes(permission);
}

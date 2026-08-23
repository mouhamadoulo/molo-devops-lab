import { UserRole } from '../../../core/auth/auth.models';

export const USER_ROLES: readonly UserRole[] = ['ADMIN', 'EDITOR', 'VIEWER'];

export const USER_ROLE_LABELS: Readonly<Record<UserRole, string>> = {
  ADMIN: 'Administrateur',
  EDITOR: 'Éditeur',
  VIEWER: 'Lecteur',
};

export interface UserAccount {
  readonly id: number;
  readonly email: string;
  readonly displayName: string;
  readonly role: UserRole;
  readonly enabled: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface UserPage {
  readonly content: readonly UserAccount[];
  readonly page: number;
  readonly size: number;
  readonly totalElements: number;
  readonly totalPages: number;
  readonly last: boolean;
}

export interface CreateUserRequest {
  readonly email: string;
  readonly displayName: string;
  readonly password: string;
  readonly role: UserRole;
}

export interface UpdateUserRequest {
  readonly displayName: string;
  readonly role: UserRole;
}

export interface ResetPasswordRequest {
  readonly password: string;
}

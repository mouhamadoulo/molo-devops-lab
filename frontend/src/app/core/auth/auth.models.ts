export type UserRole = 'ADMIN' | 'EDITOR' | 'VIEWER';

export interface CurrentUser {
  id: number;
  email: string;
  displayName: string;
  role: UserRole;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface SessionResponse {
  accessToken: string;
  user: CurrentUser;
}

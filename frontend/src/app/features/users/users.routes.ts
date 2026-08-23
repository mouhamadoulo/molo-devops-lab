import { Routes } from '@angular/router';
import { roleGuard } from '../../core/auth/role.guard';

export const USER_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    canActivate: [roleGuard],
    data: { roles: ['ADMIN'] },
    loadComponent: () => import('./pages/users-page/users-page').then((module) => module.UsersPage),
  },
];

import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { roleGuard } from './core/auth/role.guard';

export const routes: Routes = [
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./core/layout/app-shell/app-shell').then((module) => module.AppShell),
    children: [
      {
        path: 'products',
        loadComponent: () => import('./features/products/pages/products-page').then((module) => module.ProductsPage)
      },
      {
        path: 'users',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN'] },
        loadComponent: () => import('./features/users/pages/users-page').then((module) => module.UsersPage)
      }
    ]
  },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/pages/login-page/login-page').then((module) => module.LoginPage)
  },
  {
    path: 'forbidden',
    loadComponent: () => import('./features/errors/forbidden-page/forbidden-page').then((module) => module.ForbiddenPage)
  },
  {
    path: '',
    redirectTo: 'products',
    pathMatch: 'full'
  }
];

import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./core/layout/app-shell/app-shell').then((module) => module.AppShell),
    children: [
      {
        path: '',
        redirectTo: 'products',
        pathMatch: 'full'
      },
      {
        path: 'products',
        loadChildren: () => import('./features/products/products.routes').then((module) => module.PRODUCT_ROUTES)
      },
      {
        path: 'users',
        loadChildren: () => import('./features/users/users.routes').then((module) => module.USER_ROUTES)
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
  }
];

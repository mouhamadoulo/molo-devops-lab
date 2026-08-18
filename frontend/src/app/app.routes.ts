import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: 'products',
    canActivate: [authGuard],
    loadComponent: () => import('./features/auth/login-page').then((module) => module.LoginPage)
  },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login-page').then((module) => module.LoginPage)
  },
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full'
  }
];

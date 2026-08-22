import { Routes } from '@angular/router';
import { roleGuard } from '../../core/auth/role.guard';

export const PRODUCT_ROUTES: Routes = [
  {
    path: 'new',
    canActivate: [roleGuard],
    data: { roles: ['ADMIN', 'EDITOR'] },
    loadComponent: () => import('./pages/product-form-page/product-form-page').then((module) => module.ProductFormPage),
  },
  {
    path: ':id/edit',
    canActivate: [roleGuard],
    data: { roles: ['ADMIN', 'EDITOR'] },
    loadComponent: () => import('./pages/product-form-page/product-form-page').then((module) => module.ProductFormPage),
  },
  {
    path: ':id',
    loadComponent: () => import('./pages/product-detail-page/product-detail-page').then((module) => module.ProductDetailPage),
  },
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./pages/product-list-page/product-list-page').then((module) => module.ProductListPage),
  },
];

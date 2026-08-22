import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthStore } from '../../../../core/auth/auth.store';
import { ApiError } from '../../../../core/http/problem-detail';
import { ProductPage, ProductSummary } from '../../models/product';
import { DEFAULT_PRODUCT_QUERY, ProductQuery } from '../../models/product-query';
import { ProductsStore } from '../../services/products.store';
import { ProductListPage } from './product-list-page';

registerLocaleData(localeFr);

describe('ProductListPage', () => {
  let fixture: ComponentFixture<ProductListPage>;
  let status: ReturnType<typeof signal<'loading' | 'error' | 'empty' | 'success'>>;
  let products: ReturnType<typeof signal<readonly ProductSummary[]>>;
  let error: ReturnType<typeof signal<ApiError | null>>;
  let query: ReturnType<typeof signal<ProductQuery>>;
  let currentPage: ReturnType<typeof signal<ProductPage | null>>;
  let router: { navigate: ReturnType<typeof vi.fn> };
  let store: { reload: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    status = signal('success');
    products = signal([product()]);
    error = signal(null);
    query = signal(DEFAULT_PRODUCT_QUERY);
    currentPage = signal(page([product()]));
    store = { reload: vi.fn() };
    router = { navigate: vi.fn().mockResolvedValue(true) };

    await TestBed.configureTestingModule({
      imports: [ProductListPage],
      providers: [
        {
          provide: ProductsStore,
          useValue: {
            ...store,
            status,
            products,
            error,
            query,
            page: currentPage,
            totalElements: signal(1),
          },
        },
        { provide: AuthStore, useValue: { role: signal('ADMIN') } },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: {} },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProductListPage);
    fixture.detectChanges();
  });

  it('renders the operational table and mobile card from the same catalog state', () => {
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('h1')?.textContent).toContain('Produits');
    expect(host.querySelector('table')?.textContent).toContain('Portable Atlas');
    expect(host.querySelector('[data-mobile-cards]')?.textContent).toContain('Portable Atlas');
    expect(host.getAttribute('aria-busy')).toBe('false');
  });

  it('renders the primary image once per responsive composition without repeating the product name', () => {
    const imageProduct: ProductSummary = {
      ...product(),
      primaryImage: {
        id: 11,
        contentType: 'image/webp',
        sizeBytes: 2048,
        width: 640,
        height: 480,
        position: 0,
        primary: true,
        url: 'https://images.example.test/atlas.webp',
      },
    };
    products.set([imageProduct]);
    currentPage.set(page([imageProduct]));
    fixture.detectChanges();

    const images = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLImageElement>('picture img[alt=""][loading="lazy"]');
    expect(images).toHaveLength(2);
  });

  it('replaces URL parameters and resets the page when a filter changes', () => {
    query.set({ ...DEFAULT_PRODUCT_QUERY, page: 4, size: 40 });

    fixture.componentInstance.updateFilters({ search: 'audio', category: 'AUDIO' });

    expect(router.navigate).toHaveBeenCalledWith([], {
      relativeTo: {},
      queryParams: {
        search: 'audio',
        category: 'AUDIO',
        available: null,
        page: '0',
        size: '40',
        sort: 'name',
        direction: 'asc',
      },
      replaceUrl: true,
    });
  });

  it('distinguishes a filtered empty result and retries a failed load', () => {
    status.set('empty');
    products.set([]);
    currentPage.set(page([]));
    query.set({ ...DEFAULT_PRODUCT_QUERY, search: 'introuvable' });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Aucun résultat');

    status.set('error');
    error.set({
      status: 503,
      title: 'Catalogue indisponible',
      detail: 'Le service ne répond pas.',
      fieldErrors: {},
    });
    fixture.detectChanges();
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button[data-retry]')?.click();

    expect(store.reload).toHaveBeenCalledOnce();
  });

  it('updates the page without dropping filters or sorting', () => {
    query.set({
      ...DEFAULT_PRODUCT_QUERY,
      search: 'atlas',
      category: 'LAPTOP',
      sort: 'price',
      direction: 'desc',
    });

    fixture.componentInstance.updatePagination({
      pageIndex: 2,
      pageSize: 20,
      length: 120,
      previousPageIndex: 1,
    });

    expect(router.navigate).toHaveBeenCalledWith([], {
      relativeTo: {},
      queryParams: {
        search: 'atlas',
        category: 'LAPTOP',
        available: null,
        page: '2',
        size: '20',
        sort: 'price',
        direction: 'desc',
      },
      replaceUrl: true,
    });
  });

  it('resets the page when the page size changes', () => {
    query.set({ ...DEFAULT_PRODUCT_QUERY, page: 3 });

    fixture.componentInstance.updatePagination({
      pageIndex: 3,
      pageSize: 40,
      length: 120,
      previousPageIndex: 2,
    });

    expect(router.navigate).toHaveBeenCalledWith([], {
      relativeTo: {},
      queryParams: {
        search: null,
        category: null,
        available: null,
        page: '0',
        size: '40',
        sort: 'name',
        direction: 'asc',
      },
      replaceUrl: true,
    });
  });
});

function product(): ProductSummary {
  return {
    id: 7,
    name: 'Portable Atlas',
    description: 'Poste de travail mobile',
    category: 'LAPTOP',
    price: 1499.9,
    stockQuantity: 12,
    available: true,
    createdAt: '2026-08-18T10:00:00Z',
    updatedAt: '2026-08-18T10:00:00Z',
    primaryImage: null,
  };
}

function page(content: readonly ProductSummary[]): ProductPage {
  return {
    content,
    page: 0,
    size: 20,
    totalElements: content.length,
    totalPages: content.length === 0 ? 0 : 1,
    last: true,
  };
}

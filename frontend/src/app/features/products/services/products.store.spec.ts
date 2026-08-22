import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { ProductPage, ProductRequest } from '../models/product';
import { ProductsApiService } from './products-api.service';
import { ProductsStore } from './products.store';

describe('ProductsStore', () => {
  let queryParams: Subject<ReturnType<typeof convertToParamMap>>;
  let api: {
    list: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  let store: ProductsStore;

  beforeEach(() => {
    queryParams = new Subject();
    api = {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        ProductsStore,
        { provide: ProductsApiService, useValue: api },
        { provide: ActivatedRoute, useValue: { queryParamMap: queryParams } },
      ],
    });
    store = TestBed.inject(ProductsStore);
  });

  it('publishes loading then success or empty from the current URL query', () => {
    api.list.mockReturnValueOnce(of(page([product()]))).mockReturnValueOnce(of(page([])));

    queryParams.next(convertToParamMap({ search: 'atlas' }));
    expect(store.status()).toBe('success');
    expect(store.products()).toHaveLength(1);
    expect(store.query().search).toBe('atlas');

    queryParams.next(convertToParamMap({ search: 'inconnu' }));
    expect(store.status()).toBe('empty');
    expect(store.products()).toEqual([]);
  });

  it('maps an API failure to an error state safe for display', () => {
    api.list.mockReturnValue(throwError(() => new Error('database credentials leaked')));

    queryParams.next(convertToParamMap({}));

    expect(store.status()).toBe('error');
    expect(store.error()?.detail).not.toContain('database credentials');
  });

  it('ignores an obsolete response after the URL query changes', () => {
    const oldResponse = new Subject<ProductPage>();
    const currentResponse = new Subject<ProductPage>();
    api.list.mockReturnValueOnce(oldResponse).mockReturnValueOnce(currentResponse);

    queryParams.next(convertToParamMap({ search: 'ancien' }));
    queryParams.next(convertToParamMap({ search: 'actuel' }));
    oldResponse.next(page([{ ...product(), name: 'Ancien' }]));
    expect(store.status()).toBe('loading');

    currentResponse.next(page([{ ...product(), name: 'Actuel' }]));
    expect(store.status()).toBe('success');
    expect(store.products()[0]?.name).toBe('Actuel');
  });

  it('reloads the current query after a successful mutation', async () => {
    api.list.mockReturnValue(of(page([product()])));
    api.create.mockReturnValue(of(product()));
    queryParams.next(convertToParamMap({ category: 'LAPTOP' }));

    await store.create(productRequest());

    expect(api.list).toHaveBeenCalledTimes(2);
    expect(api.list.mock.calls[1]?.[0].category).toBe('LAPTOP');
  });
});

function productRequest(): ProductRequest {
  return {
    name: 'Portable Atlas',
    description: 'Poste de travail mobile',
    category: 'LAPTOP',
    price: 1499.9,
    stockQuantity: 12,
    available: true,
  };
}

function product() {
  return {
    id: 7,
    ...productRequest(),
    createdAt: '2026-08-18T10:00:00Z',
    updatedAt: '2026-08-18T10:00:00Z',
    primaryImage: null,
  };
}

function page(content: ReturnType<typeof product>[]): ProductPage {
  return {
    content,
    page: 0,
    size: 20,
    totalElements: content.length,
    totalPages: content.length === 0 ? 0 : 1,
    last: true,
  };
}

import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { ProductRequest } from '../models/product';
import { DEFAULT_PRODUCT_QUERY } from '../models/product-query';
import { ProductsApiService } from './products-api.service';

describe('ProductsApiService', () => {
  let api: ProductsApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ProductsApiService, provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(ProductsApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('translates the URL query contract to Spring pagination parameters', () => {
    api.list({
      ...DEFAULT_PRODUCT_QUERY,
      search: 'portable',
      category: 'LAPTOP',
      available: true,
      page: 2,
      size: 40,
      sort: 'price',
      direction: 'desc',
    }).subscribe();

    const request = http.expectOne((candidate) => candidate.url === `${environment.apiUrl}/products`);
    expect(request.request.params.get('search')).toBe('portable');
    expect(request.request.params.get('category')).toBe('LAPTOP');
    expect(request.request.params.get('available')).toBe('true');
    expect(request.request.params.get('page')).toBe('2');
    expect(request.request.params.get('size')).toBe('40');
    expect(request.request.params.get('sort')).toBe('price,desc');
    request.flush(page());
  });

  it('exposes typed CRUD requests against the product resource', () => {
    const body = productRequest();

    api.get(7).subscribe();
    http.expectOne(`${environment.apiUrl}/products/7`).flush(product());

    api.create(body).subscribe();
    const create = http.expectOne(`${environment.apiUrl}/products`);
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toEqual(body);
    create.flush(product());

    api.update(7, body).subscribe();
    const update = http.expectOne(`${environment.apiUrl}/products/7`);
    expect(update.request.method).toBe('PUT');
    expect(update.request.body).toEqual(body);
    update.flush(product());

    api.delete(7).subscribe();
    const remove = http.expectOne(`${environment.apiUrl}/products/7`);
    expect(remove.request.method).toBe('DELETE');
    remove.flush(null);
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

function page() {
  return {
    content: [product()],
    page: 2,
    size: 40,
    totalElements: 81,
    totalPages: 3,
    last: true,
  };
}

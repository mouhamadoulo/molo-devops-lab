import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ProductDetail, ProductRequest } from '../../models/product';
import { ProductsApiService } from '../../services/products-api.service';
import { ProductFormPage } from './product-form-page';

describe('ProductFormPage', () => {
  let fixture: ComponentFixture<ProductFormPage>;
  let api: {
    get: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  let snackbar: { open: ReturnType<typeof vi.fn> };
  let router: { navigate: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    api = {
      get: vi.fn().mockReturnValue(of(product())),
      create: vi.fn().mockReturnValue(of(product())),
      update: vi.fn().mockReturnValue(of(product())),
    };
    snackbar = { open: vi.fn() };
    router = { navigate: vi.fn().mockResolvedValue(true) };
  });

  it('creates a product and navigates to its detail', async () => {
    await createPage(null);

    await fixture.componentInstance.save(request());

    expect(api.create).toHaveBeenCalledWith(request());
    expect(api.update).not.toHaveBeenCalled();
    expect(snackbar.open).toHaveBeenCalledWith('Produit créé.', 'Fermer', expect.anything());
    expect(router.navigate).toHaveBeenCalledWith(['/products', 7]);
  });

  it('loads and updates the routed product', async () => {
    await createPage('7');

    expect(api.get).toHaveBeenCalledWith(7);
    expect(fixture.componentInstance.product()?.name).toBe('Portable Atlas');
    await fixture.componentInstance.save(request());

    expect(api.update).toHaveBeenCalledWith(7, request());
    expect(snackbar.open).toHaveBeenCalledWith('Produit mis à jour.', 'Fermer', expect.anything());
  });

  it('maps backend field errors without navigating away', async () => {
    api.create.mockReturnValue(throwError(() => new HttpErrorResponse({
      status: 400,
      error: {
        title: 'Validation failed',
        detail: 'Request validation failed',
        errors: { name: 'Ce nom existe déjà.' },
        requestId: 'request-create-42',
      },
    })));
    await createPage(null);

    await fixture.componentInstance.save(request());

    expect(fixture.componentInstance.apiError()?.fieldErrors).toEqual({ name: 'Ce nom existe déjà.' });
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('rejects an invalid edit identifier without falling back to creation', async () => {
    await createPage('invalid');

    expect(fixture.componentInstance.editing).toBe(true);
    expect(fixture.componentInstance.loadError()?.title).toBe('Produit invalide');
    expect(api.get).not.toHaveBeenCalled();

    await fixture.componentInstance.save(request());
    expect(api.create).not.toHaveBeenCalled();
    expect(api.update).not.toHaveBeenCalled();
  });

  async function createPage(id: string | null): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [ProductFormPage],
      providers: [
        { provide: ProductsApiService, useValue: api },
        { provide: MatSnackBar, useValue: snackbar },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => id } } } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ProductFormPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }
});

function request(): ProductRequest {
  return {
    name: 'Portable Atlas',
    description: 'Poste de travail mobile',
    category: 'LAPTOP',
    price: 1499.9,
    stockQuantity: 12,
    available: true,
  };
}

function product(): ProductDetail {
  return {
    id: 7,
    ...request(),
    createdAt: '2026-08-18T10:00:00Z',
    updatedAt: '2026-08-18T10:00:00Z',
    primaryImage: null,
  };
}

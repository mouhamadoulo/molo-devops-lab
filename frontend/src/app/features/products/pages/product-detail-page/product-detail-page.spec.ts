import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { AuthStore } from '../../../../core/auth/auth.store';
import { ProductDetail } from '../../models/product';
import { ProductsApiService } from '../../services/products-api.service';
import { ProductDetailPage } from './product-detail-page';

registerLocaleData(localeFr);

describe('ProductDetailPage', () => {
  let fixture: ComponentFixture<ProductDetailPage>;
  let role: ReturnType<typeof signal<'ADMIN' | 'EDITOR' | 'VIEWER'>>;
  let api: { get: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
  let dialog: { open: ReturnType<typeof vi.fn> };
  let snackbar: { open: ReturnType<typeof vi.fn> };
  let router: { navigate: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    role = signal('VIEWER');
    api = { get: vi.fn().mockReturnValue(of(product())), delete: vi.fn().mockReturnValue(of(undefined)) };
    dialog = { open: vi.fn().mockReturnValue({ afterClosed: () => of(true) }) };
    snackbar = { open: vi.fn() };
    router = { navigate: vi.fn().mockResolvedValue(true) };

    await TestBed.configureTestingModule({
      imports: [ProductDetailPage],
      providers: [
        { provide: ProductsApiService, useValue: api },
        { provide: AuthStore, useValue: { role } },
        { provide: MatDialog, useValue: dialog },
        { provide: MatSnackBar, useValue: snackbar },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => '7' } } } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProductDetailPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('keeps a viewer in read-only detail mode', () => {
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('h1')?.textContent).toContain('Portable Atlas');
    expect(host.textContent).toContain('Poste de travail mobile');
    expect(host.querySelector('[data-edit-product]')).toBeNull();
    expect(host.querySelector('[data-delete-product]')).toBeNull();
  });

  it('allows editors to modify but reserves deletion for administrators', () => {
    role.set('EDITOR');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-edit-product]')).not.toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-delete-product]')).toBeNull();

    role.set('ADMIN');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-delete-product]')).not.toBeNull();
  });

  it('confirms deletion, restores dialog focus and returns to the catalogue', async () => {
    role.set('ADMIN');
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-delete-product]')?.click();
    await fixture.whenStable();

    expect(dialog.open).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ restoreFocus: true }));
    expect(api.delete).toHaveBeenCalledWith(7);
    expect(snackbar.open).toHaveBeenCalledWith('Produit supprimé.', 'Fermer', expect.anything());
    expect(router.navigate).toHaveBeenCalledWith(['/products']);
  });
});

function product(): ProductDetail {
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

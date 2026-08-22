import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ApiError } from '../../../../core/http/problem-detail';
import { ProductDetail, ProductRequest } from '../../models/product';
import { ProductForm } from './product-form';

describe('ProductForm', () => {
  let fixture: ComponentFixture<ProductForm>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ProductForm] }).compileComponents();
    fixture = TestBed.createComponent(ProductForm);
    fixture.detectChanges();
  });

  it('announces required and bounded field errors without submitting', () => {
    const save = vi.fn();
    fixture.componentInstance.save.subscribe(save);
    fixture.componentInstance.form.setValue({
      name: '   ',
      description: 'x'.repeat(2_001),
      category: 'LAPTOP',
      price: -1,
      stockQuantity: -1,
      available: true,
    });

    fixture.componentInstance.submit();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent;
    expect(text).toContain('Le nom est requis');
    expect(text).toContain('2 000 caractères maximum');
    expect(text).toContain('Le prix doit être positif ou nul');
    expect(text).toContain('Le stock doit être positif ou nul');
    expect(save).not.toHaveBeenCalled();
  });

  it('emits the typed API request and normalizes an empty description', () => {
    let emitted: ProductRequest | undefined;
    fixture.componentInstance.save.subscribe((request) => emitted = request);
    fixture.componentInstance.form.setValue({
      name: 'Portable Atlas',
      description: '   ',
      category: 'LAPTOP',
      price: 1499.9,
      stockQuantity: 12,
      available: true,
    });

    fixture.componentInstance.submit();

    expect(emitted).toEqual({
      name: 'Portable Atlas',
      description: null,
      category: 'LAPTOP',
      price: 1499.9,
      stockQuantity: 12,
      available: true,
    });
  });

  it('patches an existing product and displays server validation beside its field', () => {
    fixture.componentRef.setInput('initialValue', product());
    fixture.componentRef.setInput('apiError', validationError());
    fixture.detectChanges();

    expect(fixture.componentInstance.form.controls.name.value).toBe('Portable Atlas');
    expect(fixture.componentInstance.form.controls.name.getError('server')).toBe('Ce nom existe déjà.');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Ce nom existe déjà.');
    expect((fixture.nativeElement as HTMLElement).querySelector('#name')?.getAttribute('aria-invalid')).toBe('true');
  });

  it('clears stale server validation when the page starts another submission', () => {
    fixture.componentRef.setInput('apiError', validationError());
    fixture.detectChanges();
    expect(fixture.componentInstance.form.controls.name.hasError('server')).toBe(true);

    fixture.componentRef.setInput('apiError', null);
    fixture.detectChanges();

    expect(fixture.componentInstance.form.controls.name.hasError('server')).toBe(false);
  });

  it('rejects unsupported price precision and fractional stock before the API call', () => {
    const save = vi.fn();
    fixture.componentInstance.save.subscribe(save);
    fixture.componentInstance.form.setValue({
      name: 'Portable Atlas',
      description: '',
      category: 'LAPTOP',
      price: 10_000_000_000.123,
      stockQuantity: 1.5,
      available: true,
    });

    fixture.componentInstance.submit();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent;
    expect(text).toContain('10 chiffres entiers et 2 décimales');
    expect(text).toContain('Le stock doit être un nombre entier');
    expect(save).not.toHaveBeenCalled();
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

function validationError(): ApiError {
  return {
    status: 400,
    title: 'Validation impossible',
    detail: 'Corrigez les champs signalés.',
    fieldErrors: { name: 'Ce nom existe déjà.' },
    requestId: 'request-form-42',
  };
}

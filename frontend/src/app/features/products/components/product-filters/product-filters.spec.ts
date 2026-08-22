import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DEFAULT_PRODUCT_QUERY } from '../../models/product-query';
import { ProductFilters } from './product-filters';

describe('ProductFilters', () => {
  let fixture: ComponentFixture<ProductFilters>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ProductFilters] }).compileComponents();
    fixture = TestBed.createComponent(ProductFilters);
    fixture.componentRef.setInput('query', DEFAULT_PRODUCT_QUERY);
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses Material fields for search, category and availability', () => {
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('mat-form-field')).toHaveLength(3);
  });

  it('debounces and trims the search before emitting it', async () => {
    vi.useFakeTimers();
    const change = vi.fn();
    fixture.componentInstance.filtersChange.subscribe(change);
    const search = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input[type="search"]');

    search!.value = '  atlas  ';
    search!.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(300);

    expect(change).toHaveBeenCalledWith({ search: 'atlas' });
  });

  it('emits the same search again after an external clear from the URL', async () => {
    vi.useFakeTimers();
    const change = vi.fn();
    fixture.componentInstance.filtersChange.subscribe(change);
    const search = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input[type="search"]')!;

    search.value = 'atlas';
    search.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(300);

    fixture.componentRef.setInput('query', { ...DEFAULT_PRODUCT_QUERY, search: 'atlas' });
    fixture.detectChanges();
    fixture.componentRef.setInput('query', DEFAULT_PRODUCT_QUERY);
    fixture.detectChanges();

    search.value = 'atlas';
    search.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(300);

    expect(change).toHaveBeenCalledTimes(2);
    expect(change).toHaveBeenLastCalledWith({ search: 'atlas' });
  });
});

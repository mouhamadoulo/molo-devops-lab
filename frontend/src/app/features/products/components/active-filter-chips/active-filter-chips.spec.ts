import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DEFAULT_PRODUCT_QUERY } from '../../models/product-query';
import { ActiveFilterChips } from './active-filter-chips';

describe('ActiveFilterChips', () => {
  let fixture: ComponentFixture<ActiveFilterChips>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ActiveFilterChips] }).compileComponents();
    fixture = TestBed.createComponent(ActiveFilterChips);
  });

  it('labels every active catalog filter and removes one without touching the others', () => {
    const change = vi.fn();
    fixture.componentRef.setInput('query', {
      ...DEFAULT_PRODUCT_QUERY,
      search: 'atlas',
      category: 'LAPTOP',
      available: false,
    });
    fixture.componentInstance.filtersChange.subscribe(change);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('Recherche : atlas');
    expect(host.textContent).toContain('Ordinateur portable');
    expect(host.textContent).toContain('Indisponible');

    host.querySelector<HTMLButtonElement>('[data-clear-search]')?.click();

    expect(change).toHaveBeenCalledWith({ search: '' });
  });

  it('clears search, category and availability together', () => {
    const change = vi.fn();
    fixture.componentRef.setInput('query', {
      ...DEFAULT_PRODUCT_QUERY,
      category: 'AUDIO',
      available: true,
    });
    fixture.componentInstance.filtersChange.subscribe(change);
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-clear-all]')?.click();

    expect(change).toHaveBeenCalledWith({ search: '', category: null, available: null });
  });
});

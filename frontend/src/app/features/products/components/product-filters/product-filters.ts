import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, output } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { debounceTime, Subject } from 'rxjs';
import { PRODUCT_CATEGORIES, PRODUCT_CATEGORY_LABELS } from '../../models/product';
import { ProductQuery } from '../../models/product-query';

@Component({
  selector: 'app-product-filters',
  imports: [MatFormField, MatInput, MatLabel],
  templateUrl: './product-filters.html',
  styleUrl: './product-filters.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductFilters {
  private readonly destroyRef = inject(DestroyRef);
  private readonly searchChanges = new Subject<string>();

  readonly query = input.required<ProductQuery>();
  readonly filtersChange = output<Partial<ProductQuery>>();
  readonly categories = PRODUCT_CATEGORIES;
  readonly categoryLabels = PRODUCT_CATEGORY_LABELS;

  constructor() {
    this.searchChanges.pipe(
      debounceTime(300),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe((search) => this.filtersChange.emit({ search: search.trim() }));
  }

  onSearch(event: Event): void {
    this.searchChanges.next((event.target as HTMLInputElement).value);
  }

  onCategory(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.filtersChange.emit({ category: value ? value as ProductQuery['category'] : null });
  }

  onAvailability(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.filtersChange.emit({ available: value === '' ? null : value === 'true' });
  }

  clear(): void {
    this.filtersChange.emit({ search: '', category: null, available: null });
  }
}

import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatChip, MatChipRemove, MatChipSet } from '@angular/material/chips';
import { PRODUCT_CATEGORY_LABELS } from '../../models/product';
import { ProductQuery } from '../../models/product-query';

@Component({
  selector: 'app-active-filter-chips',
  imports: [MatChip, MatChipRemove, MatChipSet],
  templateUrl: './active-filter-chips.html',
  styleUrl: './active-filter-chips.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActiveFilterChips {
  readonly query = input.required<ProductQuery>();
  readonly filtersChange = output<Partial<ProductQuery>>();
  readonly categoryLabels = PRODUCT_CATEGORY_LABELS;

  clearSearch(): void {
    this.filtersChange.emit({ search: '' });
  }

  clearCategory(): void {
    this.filtersChange.emit({ category: null });
  }

  clearAvailability(): void {
    this.filtersChange.emit({ available: null });
  }

  clearAll(): void {
    this.filtersChange.emit({ search: '', category: null, available: null });
  }
}

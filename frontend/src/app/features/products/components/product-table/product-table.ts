import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PRODUCT_CATEGORY_LABELS, ProductSummary } from '../../models/product';
import { ProductQuery, ProductSort, SortDirection } from '../../models/product-query';

@Component({
  selector: 'app-product-table',
  imports: [CurrencyPipe, RouterLink],
  templateUrl: './product-table.html',
  styleUrl: './product-table.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductTable {
  readonly products = input.required<readonly ProductSummary[]>();
  readonly query = input.required<ProductQuery>();
  readonly sortChange = output<{ sort: ProductSort; direction: SortDirection }>();
  readonly categoryLabels = PRODUCT_CATEGORY_LABELS;

  sortBy(sort: ProductSort): void {
    const direction = this.query().sort === sort && this.query().direction === 'asc' ? 'desc' : 'asc';
    this.sortChange.emit({ sort, direction });
  }

  sortLabel(sort: ProductSort, label: string): string {
    if (this.query().sort !== sort) return `Trier par ${label}`;
    return `Trier par ${label}, ordre ${this.query().direction === 'asc' ? 'croissant' : 'décroissant'}`;
  }
}

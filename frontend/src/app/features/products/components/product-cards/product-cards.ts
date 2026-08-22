import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PRODUCT_CATEGORY_LABELS, ProductSummary } from '../../models/product';

@Component({
  selector: 'app-product-cards',
  imports: [CurrencyPipe, RouterLink],
  templateUrl: './product-cards.html',
  styleUrl: './product-cards.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductCards {
  readonly products = input.required<readonly ProductSummary[]>();
  readonly categoryLabels = PRODUCT_CATEGORY_LABELS;
}

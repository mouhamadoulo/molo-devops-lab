import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatPaginator, MatPaginatorIntl, PageEvent } from '@angular/material/paginator';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthStore } from '../../../../core/auth/auth.store';
import { hasPermission } from '../../../../core/auth/permissions';
import { DataState } from '../../../../shared/ui/data-state/data-state';
import { PageHeader } from '../../../../shared/ui/page-header/page-header';
import { ActiveFilterChips } from '../../components/active-filter-chips/active-filter-chips';
import { ProductCards } from '../../components/product-cards/product-cards';
import { ProductFilters } from '../../components/product-filters/product-filters';
import { ProductTable } from '../../components/product-table/product-table';
import { ProductQuery, productQueryToParams } from '../../models/product-query';
import { ProductsStore } from '../../services/products.store';

@Component({
  selector: 'app-product-list-page',
  imports: [ActiveFilterChips, DataState, MatPaginator, PageHeader, ProductCards, ProductFilters, ProductTable, RouterLink],
  templateUrl: './product-list-page.html',
  styleUrl: './product-list-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.aria-busy]': "store.status() === 'loading'" },
  providers: [{ provide: MatPaginatorIntl, useFactory: frenchPaginatorIntl }],
})
export class ProductListPage {
  readonly store = inject(ProductsStore);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly canCreate = computed(() => hasPermission(this.auth.role(), 'createProduct'));
  readonly hasActiveFilters = computed(() => {
    const query = this.store.query();
    return Boolean(query.search || query.category || query.available !== null);
  });

  updateFilters(patch: Partial<ProductQuery>): void {
    this.navigate({ ...this.store.query(), ...patch, page: 0 });
  }

  updatePagination(event: PageEvent): void {
    this.navigate({
      ...this.store.query(),
      page: event.pageSize === this.store.query().size ? event.pageIndex : 0,
      size: event.pageSize,
    });
  }

  private navigate(query: ProductQuery): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: productQueryToParams(query),
      replaceUrl: true,
    });
  }
}

function frenchPaginatorIntl(): MatPaginatorIntl {
  const intl = new MatPaginatorIntl();
  intl.itemsPerPageLabel = 'Éléments par page';
  intl.nextPageLabel = 'Page suivante';
  intl.previousPageLabel = 'Page précédente';
  intl.firstPageLabel = 'Première page';
  intl.lastPageLabel = 'Dernière page';
  intl.getRangeLabel = (page, pageSize, length) => {
    if (length === 0 || pageSize === 0) return `0 sur ${length}`;
    const start = page * pageSize;
    const end = Math.min(start + pageSize, length);
    return `${start + 1} à ${end} sur ${length}`;
  };
  return intl;
}

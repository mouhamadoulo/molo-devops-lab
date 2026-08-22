import { computed, inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { BehaviorSubject, catchError, combineLatest, concat, firstValueFrom, map, of, switchMap } from 'rxjs';
import { ApiError } from '../../../core/http/problem-detail';
import { mapApiError } from '../../../core/http/api-error.mapper';
import { ProductDetail, ProductPage, ProductRequest, ProductSummary } from '../models/product';
import { DEFAULT_PRODUCT_QUERY, ProductQuery, productQueryFromParamMap } from '../models/product-query';
import { ProductsApiService } from './products-api.service';

type ProductsState =
  | { readonly status: 'loading'; readonly query: ProductQuery }
  | { readonly status: 'error'; readonly query: ProductQuery; readonly error: ApiError }
  | { readonly status: 'empty'; readonly query: ProductQuery; readonly page: ProductPage }
  | { readonly status: 'success'; readonly query: ProductQuery; readonly page: ProductPage };

@Injectable({ providedIn: 'root' })
export class ProductsStore {
  private readonly api = inject(ProductsApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly reloadTrigger = new BehaviorSubject<void>(undefined);

  private readonly state = toSignal(
    combineLatest([this.route.queryParamMap, this.reloadTrigger]).pipe(
      map(([params]) => productQueryFromParamMap(params)),
      switchMap((query) => concat(
        of<ProductsState>({ status: 'loading', query }),
        this.api.list(query).pipe(
          map((page): ProductsState => ({
            status: page.content.length === 0 ? 'empty' : 'success',
            query,
            page,
          })),
          catchError((error: unknown) => of<ProductsState>({
            status: 'error',
            query,
            error: mapApiError(error),
          })),
        ),
      )),
    ),
    { initialValue: { status: 'loading', query: DEFAULT_PRODUCT_QUERY } as ProductsState },
  );

  readonly status = computed(() => this.state().status);
  readonly query = computed(() => this.state().query);
  readonly page = computed(() => {
    const state = this.state();
    return 'page' in state ? state.page : null;
  });
  readonly products = computed<readonly ProductSummary[]>(() => this.page()?.content ?? []);
  readonly error = computed(() => {
    const state = this.state();
    return state.status === 'error' ? state.error : null;
  });
  readonly totalElements = computed(() => this.page()?.totalElements ?? 0);

  reload(): void {
    this.reloadTrigger.next();
  }

  async create(request: ProductRequest): Promise<ProductDetail> {
    const product = await firstValueFrom(this.api.create(request));
    this.reload();
    return product;
  }

  async update(id: number, request: ProductRequest): Promise<ProductDetail> {
    const product = await firstValueFrom(this.api.update(id, request));
    this.reload();
    return product;
  }

  async delete(id: number): Promise<void> {
    await firstValueFrom(this.api.delete(id));
    this.reload();
  }
}

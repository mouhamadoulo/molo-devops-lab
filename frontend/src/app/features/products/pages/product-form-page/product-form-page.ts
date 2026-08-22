import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, OnInit, signal, ViewChild } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { mapApiError } from '../../../../core/http/api-error.mapper';
import { ApiError } from '../../../../core/http/problem-detail';
import { DataState, DataStateKind } from '../../../../shared/ui/data-state/data-state';
import { PageHeader } from '../../../../shared/ui/page-header/page-header';
import { ProductForm } from '../../components/product-form/product-form';
import { ProductDetail, ProductRequest } from '../../models/product';
import { ProductsApiService } from '../../services/products-api.service';

@Component({
  selector: 'app-product-form-page',
  imports: [DataState, PageHeader, ProductForm],
  templateUrl: './product-form-page.html',
  styleUrl: './product-form-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.aria-busy]': 'loading() || submitting()' },
})
export class ProductFormPage implements OnInit {
  private readonly api = inject(ProductsApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snackbar = inject(MatSnackBar);
  private readonly rawProductId = this.route.snapshot.paramMap.get('id');
  private readonly productId = parseProductId(this.rawProductId);
  private readonly invalidProductId = this.rawProductId !== null && this.productId === null;

  @ViewChild('errorSummary') private errorSummary?: ElementRef<HTMLElement>;

  readonly product = signal<ProductDetail | null>(null);
  readonly loadError = signal<ApiError | null>(this.invalidProductId ? invalidProductError() : null);
  readonly apiError = signal<ApiError | null>(null);
  readonly loading = signal(this.productId !== null && !this.invalidProductId);
  readonly submitting = signal(false);
  readonly editing = this.rawProductId !== null;
  readonly status = computed<DataStateKind>(() => this.loading() ? 'loading' : this.loadError() ? 'error' : 'success');
  readonly title = computed(() => this.editing ? `Modifier ${this.product()?.name ?? 'le produit'}` : 'Créer un produit');

  ngOnInit(): void {
    if (this.productId !== null) void this.load();
  }

  async load(): Promise<void> {
    if (this.productId === null) return;
    this.loading.set(true);
    this.loadError.set(null);
    try {
      this.product.set(await firstValueFrom(this.api.get(this.productId)));
    } catch (error: unknown) {
      this.loadError.set(mapApiError(error));
    } finally {
      this.loading.set(false);
    }
  }

  async save(request: ProductRequest): Promise<void> {
    if (this.invalidProductId) return;
    this.apiError.set(null);
    this.submitting.set(true);
    try {
      const saved = this.productId === null
        ? await firstValueFrom(this.api.create(request))
        : await firstValueFrom(this.api.update(this.productId, request));
      this.snackbar.open(this.editing ? 'Produit mis à jour.' : 'Produit créé.', 'Fermer', { duration: 4_000 });
      await this.router.navigate(['/products', saved.id]);
    } catch (error: unknown) {
      this.apiError.set(mapApiError(error));
      queueMicrotask(() => this.errorSummary?.nativeElement.focus());
    } finally {
      this.submitting.set(false);
    }
  }

  cancel(): void {
    void this.router.navigate(this.productId === null ? ['/products'] : ['/products', this.productId]);
  }
}

function parseProductId(value: string | null): number | null {
  if (value === null) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function invalidProductError(): ApiError {
  return {
    status: 400,
    title: 'Produit invalide',
    detail: "L’identifiant demandé n’est pas valide. Revenez au catalogue puis sélectionnez un produit.",
    fieldErrors: {},
  };
}

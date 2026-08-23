import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthStore } from '../../../../core/auth/auth.store';
import { hasPermission } from '../../../../core/auth/permissions';
import { mapApiError } from '../../../../core/http/api-error.mapper';
import { ApiError } from '../../../../core/http/problem-detail';
import { ConfirmDialog } from '../../../../shared/ui/confirm-dialog/confirm-dialog';
import { DataState, DataStateKind } from '../../../../shared/ui/data-state/data-state';
import { PageHeader } from '../../../../shared/ui/page-header/page-header';
import { ImageGalleryManager } from '../../components/image-gallery-manager/image-gallery-manager';
import { PRODUCT_CATEGORY_LABELS, ProductDetail } from '../../models/product';
import { ProductsApiService } from '../../services/products-api.service';

@Component({
  selector: 'app-product-detail-page',
  imports: [CurrencyPipe, DataState, DatePipe, ImageGalleryManager, PageHeader, RouterLink],
  templateUrl: './product-detail-page.html',
  styleUrl: './product-detail-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.aria-busy]': "status() === 'loading'" },
})
export class ProductDetailPage implements OnInit {
  private readonly api = inject(ProductsApiService);
  private readonly auth = inject(AuthStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly snackbar = inject(MatSnackBar);
  private readonly productId = Number(this.route.snapshot.paramMap.get('id'));

  readonly product = signal<ProductDetail | null>(null);
  readonly error = signal<ApiError | null>(null);
  readonly loading = signal(true);
  readonly status = computed<DataStateKind>(() => this.loading() ? 'loading' : this.error() ? 'error' : 'success');
  readonly canEdit = computed(() => hasPermission(this.auth.role(), 'editProduct'));
  readonly canDelete = computed(() => hasPermission(this.auth.role(), 'deleteProduct'));
  readonly canManageImages = computed(() => hasPermission(this.auth.role(), 'manageProductImages'));
  readonly categoryLabels = PRODUCT_CATEGORY_LABELS;

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.product.set(await firstValueFrom(this.api.get(this.productId)));
    } catch (error: unknown) {
      this.error.set(mapApiError(error));
    } finally {
      this.loading.set(false);
    }
  }

  async deleteProduct(): Promise<void> {
    const product = this.product();
    if (!product || !this.canDelete()) return;

    const confirmed = await firstValueFrom(this.dialog.open(ConfirmDialog, {
      data: {
        title: 'Supprimer le produit ?',
        message: `« ${product.name} » sera supprimé définitivement, ainsi que ses images.`,
        confirmLabel: 'Supprimer',
      },
      autoFocus: 'first-tabbable',
      restoreFocus: true,
      width: 'min(28rem, calc(100vw - 2rem))',
    }).afterClosed());
    if (!confirmed) return;

    try {
      await firstValueFrom(this.api.delete(product.id));
      this.snackbar.open('Produit supprimé.', 'Fermer', { duration: 4_000 });
      await this.router.navigate(['/products']);
    } catch (error: unknown) {
      this.error.set(mapApiError(error));
    }
  }
}

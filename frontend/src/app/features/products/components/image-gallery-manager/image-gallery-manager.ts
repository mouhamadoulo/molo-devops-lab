import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { lastValueFrom, tap } from 'rxjs';
import { mapApiError } from '../../../../core/http/api-error.mapper';
import { ApiError } from '../../../../core/http/problem-detail';
import { ConfirmDialog } from '../../../../shared/ui/confirm-dialog/confirm-dialog';
import { ProductImage } from '../../models/product-image';
import { ProductImagesApiService } from '../../services/product-images-api.service';

const MAX_IMAGE_COUNT = 5;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

interface PendingUpload {
  readonly id: number;
  readonly name: string;
  readonly previewUrl: string;
  readonly progress: number | null;
}

@Component({
  selector: 'app-image-gallery-manager',
  templateUrl: './image-gallery-manager.html',
  styleUrl: './image-gallery-manager.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.aria-busy]': 'loading() || uploading()' },
})
export class ImageGalleryManager implements OnInit {
  private readonly api = inject(ProductImagesApiService);
  private readonly dialog = inject(MatDialog);
  private nextUploadId = 1;

  readonly productId = input.required<number>();
  readonly productName = input.required<string>();
  readonly canManage = input(false);
  readonly images = signal<readonly ProductImage[]>([]);
  readonly loading = signal(true);
  readonly error = signal<ApiError | null>(null);
  readonly pendingUploads = signal<readonly PendingUpload[]>([]);
  readonly announcements = signal<readonly string[]>([]);
  readonly selectedImageId = signal<number | null>(null);
  readonly mutating = signal(false);
  readonly uploading = computed(() => this.pendingUploads().length > 0);
  readonly activeImage = computed(() => {
    const images = this.images();
    return images.find(({ id }) => id === this.selectedImageId())
      ?? images.find(({ primary }) => primary)
      ?? images[0]
      ?? null;
  });

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const images = await lastValueFrom(this.api.list(this.productId()));
      this.images.set(sortImages(images));
      this.selectedImageId.set(images.find(({ primary }) => primary)?.id ?? images[0]?.id ?? null);
    } catch (error: unknown) {
      this.error.set(mapApiError(error));
    } finally {
      this.loading.set(false);
    }
  }

  selectImage(imageId: number): void {
    this.selectedImageId.set(imageId);
  }

  async onFileSelection(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (input.files) await this.addFiles(Array.from(input.files));
    input.value = '';
  }

  async onDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    if (event.dataTransfer?.files) await this.addFiles(Array.from(event.dataTransfer.files));
  }

  allowDrop(event: DragEvent): void {
    event.preventDefault();
  }

  async addFiles(files: readonly File[]): Promise<void> {
    if (!this.canManage()) return;

    const accepted: File[] = [];
    const rejections: string[] = [];
    for (const file of files) {
      if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
        rejections.push(`${file.name} : format non pris en charge`);
      } else if (file.size > MAX_IMAGE_SIZE) {
        rejections.push(`${file.name} : taille maximale de 5 Mo dÃ©passÃ©e`);
      } else if (this.images().length + accepted.length >= MAX_IMAGE_COUNT) {
        rejections.push(`${file.name} : limite de 5 images atteinte`);
      } else {
        accepted.push(file);
      }
    }
    this.announcements.set(rejections);

    for (const file of accepted) {
      await this.upload(file);
    }
  }

  async moveImage(imageId: number, direction: -1 | 1): Promise<void> {
    if (!this.canManage() || this.mutating()) return;
    const previous = this.images();
    const currentIndex = previous.findIndex(({ id }) => id === imageId);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= previous.length) return;

    this.mutating.set(true);
    const reordered = [...previous];
    [reordered[currentIndex], reordered[targetIndex]] = [reordered[targetIndex], reordered[currentIndex]];
    const optimistic = reordered.map((image, position) => ({ ...image, position }));
    this.images.set(optimistic);

    try {
      const saved = await lastValueFrom(this.api.reorder(this.productId(), optimistic.map(({ id }) => id)));
      this.images.set(sortImages(saved));
      this.appendAnnouncement('Nouvel ordre enregistrÃ©.');
    } catch (error: unknown) {
      this.images.set(previous);
      this.appendAnnouncement(formatApiError(mapApiError(error)));
    } finally {
      this.mutating.set(false);
    }
  }

  async makePrimary(imageId: number): Promise<void> {
    if (!this.canManage() || this.mutating()) return;
    this.mutating.set(true);
    const previous = this.images();
    this.images.update((images) => images.map((image) => ({ ...image, primary: image.id === imageId })));
    this.selectedImageId.set(imageId);

    try {
      const saved = await lastValueFrom(this.api.makePrimary(this.productId(), imageId));
      this.images.update((images) => images.map((image) => ({
        ...image,
        ...(image.id === saved.id ? saved : {}),
        primary: image.id === saved.id,
      })));
      this.appendAnnouncement('Image principale mise Ã  jour.');
    } catch (error: unknown) {
      this.images.set(previous);
      this.appendAnnouncement(formatApiError(mapApiError(error)));
    } finally {
      this.mutating.set(false);
    }
  }

  async deleteImage(image: ProductImage): Promise<void> {
    if (!this.canManage() || this.mutating()) return;
    const confirmed = await lastValueFrom(this.dialog.open(ConfirmDialog, {
      data: {
        title: 'Supprimer cette image ?',
        message: 'Lâ€™image sera retirÃ©e dÃ©finitivement de la galerie produit.',
        confirmLabel: 'Supprimer lâ€™image',
      },
      autoFocus: 'first-tabbable',
      restoreFocus: true,
      width: 'min(28rem, calc(100vw - 2rem))',
    }).afterClosed());
    if (!confirmed) return;

    this.mutating.set(true);
    try {
      this.images.update((images) => images.filter(({ id }) => id !== image.id));
      await lastValueFrom(this.api.delete(this.productId(), image.id));
      await this.load();
      this.appendAnnouncement('Image supprimÃ©e.');
    } catch (error: unknown) {
      await this.load();
      this.appendAnnouncement(formatApiError(mapApiError(error)));
    } finally {
      this.mutating.set(false);
    }
  }

  private async upload(file: File): Promise<void> {
    const id = this.nextUploadId++;
    const previewUrl = URL.createObjectURL(file);
    this.pendingUploads.update((uploads) => [...uploads, { id, name: file.name, previewUrl, progress: 0 }]);

    try {
      const result = await lastValueFrom(this.api.upload(this.productId(), file).pipe(
        tap((event) => {
          if (event.kind === 'progress') this.updateProgress(id, event.progress);
        }),
      ));
      if (result.kind === 'completed') {
        this.images.update((images) => sortImages([...images, result.image]));
        this.selectedImageId.set(result.image.id);
        this.announcements.update((messages) => [...messages, `${file.name} : image ajoutÃ©e`]);
      }
    } catch (error: unknown) {
      const apiError = mapApiError(error);
      this.announcements.update((messages) => [...messages, `${file.name} : ${formatApiError(apiError)}`]);
    } finally {
      URL.revokeObjectURL(previewUrl);
      this.pendingUploads.update((uploads) => uploads.filter((upload) => upload.id !== id));
    }
  }

  private updateProgress(id: number, progress: number | null): void {
    this.pendingUploads.update((uploads) => uploads.map((upload) => upload.id === id
      ? { ...upload, progress }
      : upload));
  }

  private appendAnnouncement(message: string): void {
    this.announcements.update((messages) => [...messages, message]);
  }
}

function sortImages(images: readonly ProductImage[]): readonly ProductImage[] {
  return [...images].sort((left, right) => left.position - right.position);
}

function formatApiError(error: ApiError): string {
  return error.requestId
    ? `${error.detail} RÃ©fÃ©rence support : ${error.requestId}.`
    : error.detail;
}

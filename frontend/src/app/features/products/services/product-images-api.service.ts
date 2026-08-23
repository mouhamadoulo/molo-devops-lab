import { HttpClient, HttpEventType } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { filter, map, Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ProductImage } from '../models/product-image';

export type ProductImageUploadEvent =
  | { readonly kind: 'progress'; readonly progress: number | null }
  | { readonly kind: 'completed'; readonly image: ProductImage };

@Injectable({ providedIn: 'root' })
export class ProductImagesApiService {
  private readonly http = inject(HttpClient);
  private readonly productsUrl = `${environment.apiUrl}/products`;

  list(productId: number): Observable<readonly ProductImage[]> {
    return this.http.get<readonly ProductImage[]>(`${this.productsUrl}/${productId}/images`);
  }

  upload(productId: number, file: File): Observable<ProductImageUploadEvent> {
    const body = new FormData();
    body.append('file', file, file.name);

    return this.http.post<ProductImage>(`${this.productsUrl}/${productId}/images`, body, {
      observe: 'events',
      reportProgress: true,
    }).pipe(
      map((event): ProductImageUploadEvent | null => {
        if (event.type === HttpEventType.UploadProgress) {
          return {
            kind: 'progress',
            progress: event.total ? Math.round((event.loaded / event.total) * 100) : null,
          };
        }
        if (event.type === HttpEventType.Response && event.body) {
          return { kind: 'completed', image: event.body };
        }
        return null;
      }),
      filter((event): event is ProductImageUploadEvent => event !== null),
    );
  }

  reorder(productId: number, imageIds: readonly number[]): Observable<readonly ProductImage[]> {
    return this.http.put<readonly ProductImage[]>(`${this.productsUrl}/${productId}/images/order`, { imageIds });
  }

  makePrimary(productId: number, imageId: number): Observable<ProductImage> {
    return this.http.put<ProductImage>(`${this.productsUrl}/${productId}/images/${imageId}/primary`, null);
  }

  delete(productId: number, imageId: number): Observable<void> {
    return this.http.delete<void>(`${this.productsUrl}/${productId}/images/${imageId}`);
  }
}

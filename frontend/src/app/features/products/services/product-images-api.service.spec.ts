import { HttpEventType } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { ProductImage } from '../models/product-image';
import { ProductImagesApiService, ProductImageUploadEvent } from './product-images-api.service';

describe('ProductImagesApiService', () => {
  let api: ProductImagesApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ProductImagesApiService, provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(ProductImagesApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('uploads the selected file and exposes transport progress before completion', () => {
    const events: ProductImageUploadEvent[] = [];
    const file = new File(['image-content'], 'portable.png', { type: 'image/png' });

    api.upload(7, file).subscribe((event) => events.push(event));

    const request = http.expectOne(`${environment.apiUrl}/products/7/images`);
    expect(request.request.method).toBe('POST');
    expect(request.request.reportProgress).toBe(true);
    expect(request.request.body).toBeInstanceOf(FormData);
    const uploadedFile = (request.request.body as FormData).get('file') as File;
    expect(uploadedFile.name).toBe('portable.png');
    expect(uploadedFile.type).toBe('image/png');
    expect(uploadedFile.size).toBe(file.size);

    request.event({ type: HttpEventType.UploadProgress, loaded: 3, total: 4 });
    request.flush(image());

    expect(events).toEqual([
      { kind: 'progress', progress: 75 },
      { kind: 'completed', image: image() },
    ]);
  });

  it('uses the product image resource for listing, ordering, primary selection and deletion', () => {
    api.list(7).subscribe();
    const list = http.expectOne(`${environment.apiUrl}/products/7/images`);
    expect(list.request.method).toBe('GET');
    list.flush([image()]);

    api.reorder(7, [12, 11]).subscribe();
    const reorder = http.expectOne(`${environment.apiUrl}/products/7/images/order`);
    expect(reorder.request.method).toBe('PUT');
    expect(reorder.request.body).toEqual({ imageIds: [12, 11] });
    reorder.flush([image()]);

    api.makePrimary(7, 12).subscribe();
    const primary = http.expectOne(`${environment.apiUrl}/products/7/images/12/primary`);
    expect(primary.request.method).toBe('PUT');
    primary.flush(image());

    api.delete(7, 12).subscribe();
    const remove = http.expectOne(`${environment.apiUrl}/products/7/images/12`);
    expect(remove.request.method).toBe('DELETE');
    remove.flush(null);
  });
});

function image(): ProductImage {
  return {
    id: 12,
    contentType: 'image/png',
    sizeBytes: 13,
    width: 640,
    height: 480,
    position: 0,
    primary: true,
    url: 'https://objects.example.test/products/7/image-12',
  };
}

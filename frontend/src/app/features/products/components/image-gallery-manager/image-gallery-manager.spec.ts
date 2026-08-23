import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { of, Subject, throwError } from 'rxjs';
import { ProductImage } from '../../models/product-image';
import { ProductImageUploadEvent, ProductImagesApiService } from '../../services/product-images-api.service';
import { ImageGalleryManager } from './image-gallery-manager';

describe('ImageGalleryManager', () => {
  let fixture: ComponentFixture<ImageGalleryManager>;
  let api: {
    list: ReturnType<typeof vi.fn>;
    upload: ReturnType<typeof vi.fn>;
    reorder: ReturnType<typeof vi.fn>;
    makePrimary: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  let createObjectUrl: ReturnType<typeof vi.fn>;
  let revokeObjectUrl: ReturnType<typeof vi.fn>;
  let dialog: { open: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    api = {
      list: vi.fn().mockReturnValue(of([image(11, true), image(12, false)])),
      upload: vi.fn(),
      reorder: vi.fn(),
      makePrimary: vi.fn(),
      delete: vi.fn(),
    };
    createObjectUrl = vi.fn().mockReturnValue('blob:preview');
    revokeObjectUrl = vi.fn();
    dialog = { open: vi.fn().mockReturnValue({ afterClosed: () => of(true) }) };
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectUrl });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectUrl });

    await TestBed.configureTestingModule({
      imports: [ImageGalleryManager],
      providers: [
        { provide: ProductImagesApiService, useValue: api },
        { provide: MatDialog, useValue: dialog },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ImageGalleryManager);
    fixture.componentRef.setInput('productId', 7);
    fixture.componentRef.setInput('productName', 'Portable Atlas');
  });

  it('loads an ordered gallery without exposing mutation controls to viewers', async () => {
    fixture.componentRef.setInput('canManage', false);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelectorAll('[data-gallery-thumbnail]')).toHaveLength(2);
    expect(host.querySelector('img')?.getAttribute('alt')).toBe('Image principale de Portable Atlas');
    expect(host.querySelector('[data-gallery-thumbnail]')?.getAttribute('role')).toBeNull();
    expect(host.querySelector('[data-image-management]')).toBeNull();
    expect(host.textContent).toContain('2 images');
  });

  it('validates selections, reports upload progress and revokes the local preview', async () => {
    api.list.mockReturnValue(of([image(11, true), image(12), image(13), image(14)]));
    const upload = new Subject<ProductImageUploadEvent>();
    api.upload.mockReturnValue(upload);
    fixture.componentRef.setInput('canManage', true);
    fixture.detectChanges();
    await fixture.whenStable();

    const valid = file('portable.png', 'image/png', 128);
    const overCapacity = file('clavier.webp', 'image/webp', 128);
    const unsupported = file('plan.svg', 'image/svg+xml', 128);
    const oversized = file('grand.jpg', 'image/jpeg', 5 * 1024 * 1024 + 1);

    const uploadFinished = fixture.componentInstance.addFiles([valid, overCapacity, unsupported, oversized]);
    upload.next({ kind: 'progress', progress: 50 });
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(api.upload).toHaveBeenCalledWith(7, valid);
    expect(host.querySelector('progress')?.getAttribute('value')).toBe('50');
    expect(host.querySelector('progress')?.getAttribute('aria-label')).toBe('Progression de portable.png');
    expect(host.querySelector('[aria-live="polite"]')?.textContent).toContain('clavier.webp : limite de 5 images atteinte');
    expect(host.querySelector('[aria-live="polite"]')?.textContent).toContain('plan.svg : format non pris en charge');
    expect(host.querySelector('[aria-live="polite"]')?.textContent).toContain('grand.jpg : taille maximale de 5 Mo dÃ©passÃ©e');

    upload.next({ kind: 'completed', image: image(15) });
    upload.complete();
    await uploadFinished;
    fixture.detectChanges();

    expect(createObjectUrl).toHaveBeenCalledWith(valid);
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:preview');
    expect(fixture.componentInstance.images().map(({ id }) => id)).toEqual([11, 12, 13, 14, 15]);
  });

  it('handles multiple input files and a dropped file through the public event wiring', async () => {
    api.list.mockReturnValue(of([]));
    api.upload.mockImplementation((_productId: number, selectedFile: File) => of({
      kind: 'completed',
      image: image(selectedFile.name === 'a.png' ? 31 : selectedFile.name === 'b.png' ? 32 : 33),
    } satisfies ProductImageUploadEvent));
    fixture.componentRef.setInput('canManage', true);
    fixture.detectChanges();
    await fixture.whenStable();

    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { value: fileList([file('a.png', 'image/png', 16), file('b.png', 'image/png', 16)]) });
    await fixture.componentInstance.onFileSelection({ target: input } as unknown as Event);

    const preventDefault = vi.fn();
    await fixture.componentInstance.onDrop({
      preventDefault,
      dataTransfer: { files: fileList([file('c.webp', 'image/webp', 16)]) },
    } as unknown as DragEvent);

    expect(api.upload).toHaveBeenCalledTimes(3);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(fixture.componentInstance.images().map(({ id }) => id)).toEqual([31, 32, 33]);
  });

  it('rolls the visual order back when persistence fails', async () => {
    api.reorder.mockReturnValue(throwError(() => new HttpErrorResponse({
      status: 500,
      error: {
        title: 'Ordre non enregistrÃ©',
        detail: 'RÃ©essayez dans quelques instants.',
        requestId: 'request-gallery-42',
      },
    })));
    fixture.componentRef.setInput('canManage', true);
    fixture.detectChanges();
    await fixture.whenStable();

    await fixture.componentInstance.moveImage(12, -1);
    fixture.detectChanges();

    expect(api.reorder).toHaveBeenCalledWith(7, [12, 11]);
    expect(fixture.componentInstance.images().map(({ id }) => id)).toEqual([11, 12]);
    expect((fixture.nativeElement as HTMLElement).querySelector('[aria-live="polite"]')?.textContent)
      .toContain('RÃ©essayez dans quelques instants.');
    expect((fixture.nativeElement as HTMLElement).querySelector('[aria-live="polite"]')?.textContent)
      .toContain('request-gallery-42');
  });

  it('ignores a second mutation until the first server response settles', async () => {
    const reorder = new Subject<readonly ProductImage[]>();
    api.reorder.mockReturnValue(reorder);
    api.makePrimary.mockReturnValue(of(image(12, true)));
    fixture.componentRef.setInput('canManage', true);
    fixture.detectChanges();
    await fixture.whenStable();

    const firstMutation = fixture.componentInstance.moveImage(12, -1);
    await fixture.componentInstance.makePrimary(12);

    expect(api.reorder).toHaveBeenCalledOnce();
    expect(api.makePrimary).not.toHaveBeenCalled();
    reorder.next([image(12), image(11, true)]);
    reorder.complete();
    await firstMutation;
  });

  it('shows the support reference when the gallery cannot load', async () => {
    api.list.mockReturnValue(throwError(() => new HttpErrorResponse({
      status: 503,
      error: {
        title: 'Galerie indisponible',
        detail: 'RÃ©essayez plus tard.',
        requestId: 'request-load-17',
      },
    })));
    fixture.componentRef.setInput('canManage', false);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('request-load-17');
  });

  it('keeps exactly one primary image after promotion', async () => {
    api.makePrimary.mockReturnValue(of(image(12, true)));
    fixture.componentRef.setInput('canManage', true);
    fixture.detectChanges();
    await fixture.whenStable();

    await fixture.componentInstance.makePrimary(12);

    expect(api.makePrimary).toHaveBeenCalledWith(7, 12);
    expect(fixture.componentInstance.images().filter(({ primary }) => primary).map(({ id }) => id)).toEqual([12]);
  });

  it('confirms deletion, restores focus and reloads the backend-selected primary image', async () => {
    api.list
      .mockReturnValueOnce(of([image(11, true), image(12)]))
      .mockReturnValueOnce(of([image(12, true)]));
    api.delete.mockReturnValue(of(undefined));
    fixture.componentRef.setInput('canManage', true);
    fixture.detectChanges();
    await fixture.whenStable();

    await fixture.componentInstance.deleteImage(image(11, true));

    expect(dialog.open).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ restoreFocus: true }));
    expect(api.delete).toHaveBeenCalledWith(7, 11);
    expect(fixture.componentInstance.images().map(({ id }) => id)).toEqual([12]);
    expect(fixture.componentInstance.images()[0]?.primary).toBe(true);
  });

  it('reloads the authoritative gallery and reports the support reference after deletion fails', async () => {
    api.list
      .mockReturnValueOnce(of([image(11, true), image(12)]))
      .mockReturnValueOnce(of([image(11, true), image(12)]));
    api.delete.mockReturnValue(throwError(() => new HttpErrorResponse({
      status: 503,
      error: {
        title: 'Suppression impossible',
        detail: 'La galerie nâ€™a pas Ã©tÃ© modifiÃ©e.',
        requestId: 'request-delete-9',
      },
    })));
    fixture.componentRef.setInput('canManage', true);
    fixture.detectChanges();
    await fixture.whenStable();

    await fixture.componentInstance.deleteImage(image(11, true));
    fixture.detectChanges();

    expect(api.list).toHaveBeenCalledTimes(2);
    expect(fixture.componentInstance.images().map(({ id }) => id)).toEqual([11, 12]);
    expect((fixture.nativeElement as HTMLElement).querySelector('[aria-live="polite"]')?.textContent)
      .toContain('request-delete-9');
  });
});

function image(id: number, primary = false): ProductImage {
  return {
    id,
    contentType: 'image/png',
    sizeBytes: 128,
    width: 640,
    height: 480,
    position: id - 11,
    primary,
    url: `https://objects.example.test/products/7/image-${id}`,
  };
}

function file(name: string, type: string, size: number): File {
  return new File([new Uint8Array(size)], name, { type });
}

function fileList(files: readonly File[]): FileList {
  return {
    ...files,
    length: files.length,
    item: (index: number) => files[index] ?? null,
  } as FileList;
}

import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ConfirmDialog } from './confirm-dialog';

describe('ConfirmDialog', () => {
  it('describes the destructive action and exposes explicit cancel and confirm values', async () => {
    const dialogRef = { close: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [ConfirmDialog],
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            title: 'Supprimer le produit ?',
            message: 'Cette action est définitive.',
            confirmLabel: 'Supprimer',
          },
        },
        { provide: MatDialogRef, useValue: dialogRef },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(ConfirmDialog);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.textContent).toContain('Supprimer le produit ?');
    expect(host.textContent).toContain('Cette action est définitive.');
    host.querySelector<HTMLButtonElement>('[data-cancel]')?.click();
    expect(dialogRef.close).toHaveBeenLastCalledWith(false);
    host.querySelector<HTMLButtonElement>('[data-confirm]')?.click();
    expect(dialogRef.close).toHaveBeenLastCalledWith(true);
  });
});

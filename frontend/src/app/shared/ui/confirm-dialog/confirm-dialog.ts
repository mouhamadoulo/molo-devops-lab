import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';

export interface ConfirmDialogData {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel: string;
}

@Component({
  selector: 'app-confirm-dialog',
  imports: [MatButton, MatDialogActions, MatDialogContent, MatDialogTitle],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>{{ data.message }}</mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton="outlined" type="button" data-cancel (click)="close(false)">Annuler</button>
      <button matButton="filled" type="button" class="danger-action" data-confirm (click)="close(true)">
        {{ data.confirmLabel }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    h2 { color: var(--ink); }
    mat-dialog-content { max-inline-size: 52ch; color: var(--ink-muted); line-height: 1.5; }
    mat-dialog-actions { gap: .75rem; padding-block: 1rem 1.25rem; }
    button { min-block-size: 2.75rem; }
    .danger-action { --mat-button-filled-container-color: var(--danger); --mat-button-filled-label-text-color: var(--accent-ink); }
    @media (max-width: 480px) { mat-dialog-actions { display: grid; } button { inline-size: 100%; } }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmDialog {
  readonly data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<ConfirmDialog, boolean>);

  close(confirmed: boolean): void {
    this.dialogRef.close(confirmed);
  }
}

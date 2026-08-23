import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator, MatPaginatorIntl, PageEvent } from '@angular/material/paginator';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { lastValueFrom } from 'rxjs';
import { AuthStore } from '../../../../core/auth/auth.store';
import { mapApiError } from '../../../../core/http/api-error.mapper';
import { ApiError } from '../../../../core/http/problem-detail';
import { ConfirmDialog } from '../../../../shared/ui/confirm-dialog/confirm-dialog';
import { DataState } from '../../../../shared/ui/data-state/data-state';
import { PageHeader } from '../../../../shared/ui/page-header/page-header';
import { UserEditorMode, UserEditorPanel } from '../../components/user-editor-panel/user-editor-panel';
import {
  UserAction,
  UserEnabledAction,
  UserList,
} from '../../components/user-list/user-list';
import {
  CreateUserRequest,
  ResetPasswordRequest,
  UpdateUserRequest,
  UserAccount,
} from '../../models/user';
import { UserQuery, userQueryToParams } from '../../models/user-query';
import { UsersStore } from '../../services/users.store';

@Component({
  selector: 'app-users-page',
  imports: [DataState, MatPaginator, PageHeader, UserEditorPanel, UserList],
  templateUrl: './users-page.html',
  styleUrl: './users-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: MatPaginatorIntl, useFactory: frenchUsersPaginatorIntl }],
})
export class UsersPage {
  readonly store = inject(UsersStore);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);
  private readonly snackbar = inject(MatSnackBar);
  private readonly editorPanel = viewChild(UserEditorPanel);
  private restoreFocusTarget: HTMLElement | null = null;

  readonly editorMode = signal<UserEditorMode | null>(null);
  readonly selectedUser = signal<UserAccount | null>(null);
  readonly mutationError = signal<ApiError | null>(null);
  readonly actionError = signal<ApiError | null>(null);
  readonly submitting = signal(false);
  readonly pendingUserId = signal<number | null>(null);
  readonly announcement = signal('');
  readonly currentUserId = computed(() => this.auth.user()?.id ?? -1);
  readonly countLabel = computed(() => {
    const count = this.store.totalElements();
    return `${count} ${count > 1 ? 'utilisateurs' : 'utilisateur'}`;
  });

  updateQuery(patch: Partial<UserQuery>): void {
    const query = { ...this.store.query(), ...patch };
    void this.router.navigate([], {
      relativeTo: this.route,
      replaceUrl: true,
      queryParams: userQueryToParams(query),
    });
  }

  updatePagination(event: PageEvent): void {
    this.updateQuery({
      page: event.pageSize === this.store.query().size ? event.pageIndex : 0,
      size: event.pageSize,
    });
  }

  openCreate(trigger: EventTarget | null): void {
    if (trigger instanceof HTMLElement) this.openEditor('create', null, trigger);
  }

  openEdit(action: UserAction): void {
    this.openEditor('edit', action.user, action.trigger);
  }

  openPassword(action: UserAction): void {
    this.openEditor('password', action.user, action.trigger);
  }

  async requestEditorClose(dirty: boolean): Promise<void> {
    if (dirty && !await this.confirmDiscard()) return;
    this.closeEditor();
  }

  async createUser(request: CreateUserRequest): Promise<void> {
    if (this.submitting()) return;
    this.beginMutation();
    try {
      await this.store.create(request);
      this.finishEditorSuccess('Compte créé', `Le compte de ${request.displayName} est créé.`);
    } catch (error: unknown) {
      this.mutationError.set(mapApiError(error));
    } finally {
      this.submitting.set(false);
    }
  }

  async updateUser(request: UpdateUserRequest): Promise<void> {
    const user = this.selectedUser();
    if (!user || this.submitting()) return;
    this.beginMutation();
    try {
      await this.store.update(user.id, request);
      this.finishEditorSuccess('Compte modifié', `Le compte de ${request.displayName} est modifié.`);
    } catch (error: unknown) {
      this.mutationError.set(mapApiError(error));
    } finally {
      this.submitting.set(false);
    }
  }

  async resetPassword(request: ResetPasswordRequest): Promise<void> {
    const user = this.selectedUser();
    if (!user || this.submitting()) return;
    this.beginMutation();
    try {
      await this.store.resetPassword(user.id, request);
      this.finishEditorSuccess(
        'Mot de passe réinitialisé',
        `Le mot de passe de ${user.displayName} est réinitialisé.`,
      );
    } catch (error: unknown) {
      this.mutationError.set(mapApiError(error));
    } finally {
      this.submitting.set(false);
    }
  }

  async changeEnabled(action: UserEnabledAction): Promise<void> {
    if (this.pendingUserId() !== null || action.user.id === this.currentUserId()) return;
    if (!action.enabled && !await this.confirmDisable(action)) return;

    this.actionError.set(null);
    this.pendingUserId.set(action.user.id);
    try {
      await this.store.setEnabled(action.user.id, action.enabled);
      const state = action.enabled ? 'activé' : 'désactivé';
      this.announcement.set(`Le compte de ${action.user.displayName} est ${state}.`);
      this.snackbar.open(action.enabled ? 'Compte activé' : 'Compte désactivé', 'Fermer', {
        duration: 4000,
      });
    } catch (error: unknown) {
      const apiError = mapApiError(error);
      this.actionError.set(apiError);
      this.announcement.set(`${apiError.title}. ${apiError.detail}`);
    } finally {
      this.pendingUserId.set(null);
      queueMicrotask(() => action.trigger.focus());
    }
  }

  private openEditor(mode: UserEditorMode, user: UserAccount | null, trigger: HTMLElement): void {
    this.restoreFocusTarget = trigger;
    this.selectedUser.set(user);
    this.mutationError.set(null);
    this.editorMode.set(mode);
    queueMicrotask(() => this.editorPanel()?.focusHeading());
  }

  private closeEditor(): void {
    this.editorMode.set(null);
    this.selectedUser.set(null);
    this.mutationError.set(null);
    queueMicrotask(() => this.restoreFocusTarget?.focus());
  }

  private beginMutation(): void {
    this.mutationError.set(null);
    this.submitting.set(true);
  }

  private finishEditorSuccess(message: string, announcement: string): void {
    this.snackbar.open(message, 'Fermer', { duration: 4000 });
    this.announcement.set(announcement);
    this.closeEditor();
  }

  private async confirmDiscard(): Promise<boolean> {
    const confirmed = await lastValueFrom(this.dialog.open(ConfirmDialog, {
      data: {
        title: 'Abandonner les modifications ?',
        message: 'Les informations saisies ne seront pas enregistrées.',
        confirmLabel: 'Abandonner',
      },
      restoreFocus: false,
    }).afterClosed());
    return confirmed === true;
  }

  private async confirmDisable(action: UserEnabledAction): Promise<boolean> {
    const confirmed = await lastValueFrom(this.dialog.open(ConfirmDialog, {
      data: {
        title: 'Désactiver ce compte ?',
        message: `Le compte de ${action.user.displayName} ne pourra plus accéder à la console.`,
        confirmLabel: 'Désactiver le compte',
      },
      restoreFocus: false,
    }).afterClosed());
    if (!confirmed) action.trigger.focus();
    return confirmed === true;
  }
}

function frenchUsersPaginatorIntl(): MatPaginatorIntl {
  const intl = new MatPaginatorIntl();
  intl.itemsPerPageLabel = 'Utilisateurs par page';
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

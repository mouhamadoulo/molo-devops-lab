import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { AuthStore } from '../../../../core/auth/auth.store';
import { ApiError } from '../../../../core/http/problem-detail';
import { UserAccount, UserPage } from '../../models/user';
import { DEFAULT_USER_QUERY } from '../../models/user-query';
import { UsersStore } from '../../services/users.store';
import { UsersPage } from './users-page';

describe('UsersPage', () => {
  let fixture: ComponentFixture<UsersPage>;
  let component: UsersPage;
  let trigger: HTMLButtonElement;
  let store: {
    status: ReturnType<typeof signal<'success'>>;
    query: ReturnType<typeof signal<typeof DEFAULT_USER_QUERY>>;
    page: ReturnType<typeof signal<UserPage | null>>;
    users: ReturnType<typeof signal<readonly UserAccount[]>>;
    error: ReturnType<typeof signal<ApiError | null>>;
    totalElements: ReturnType<typeof signal<number>>;
    reload: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    setEnabled: ReturnType<typeof vi.fn>;
    resetPassword: ReturnType<typeof vi.fn>;
  };
  let router: { navigate: ReturnType<typeof vi.fn> };
  let dialog: { open: ReturnType<typeof vi.fn> };
  let snackbar: { open: ReturnType<typeof vi.fn> };
  const route = {};

  beforeEach(async () => {
    const account = user();
    store = {
      status: signal('success'),
      query: signal(DEFAULT_USER_QUERY),
      page: signal(page([account])),
      users: signal([account]),
      error: signal(null),
      totalElements: signal(1),
      reload: vi.fn(),
      create: vi.fn().mockResolvedValue(account),
      update: vi.fn().mockResolvedValue(account),
      setEnabled: vi.fn().mockResolvedValue(account),
      resetPassword: vi.fn().mockResolvedValue(undefined),
    };
    router = { navigate: vi.fn() };
    dialog = { open: vi.fn().mockReturnValue({ afterClosed: () => of(true) }) };
    snackbar = { open: vi.fn() };
    trigger = document.createElement('button');
    trigger.textContent = 'Action';
    document.body.appendChild(trigger);

    await TestBed.configureTestingModule({
      imports: [UsersPage],
      providers: [
        { provide: UsersStore, useValue: store },
        { provide: AuthStore, useValue: { user: signal({
          id: 1, email: 'admin@example.test', displayName: 'Ada Admin', role: 'ADMIN',
        }) } },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: route },
        { provide: MatDialog, useValue: dialog },
        { provide: MatSnackBar, useValue: snackbar },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(UsersPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => trigger.remove());

  it('opens create, edit and password modes with the selected account', () => {
    component.openCreate(trigger);
    expect(component.editorMode()).toBe('create');
    expect(component.selectedUser()).toBeNull();

    component.openEdit({ user: user(), trigger });
    expect(component.editorMode()).toBe('edit');
    expect(component.selectedUser()?.id).toBe(7);

    component.openPassword({ user: user(), trigger });
    expect(component.editorMode()).toBe('password');
  });

  it('reflects pagination and sorting in URL parameters', () => {
    component.updateQuery({ page: 2, sort: 'createdAt', direction: 'desc' });

    expect(router.navigate).toHaveBeenCalledWith([], {
      relativeTo: route,
      replaceUrl: true,
      queryParams: { page: '2', size: '20', sort: 'createdAt', direction: 'desc' },
    });
  });

  it('creates a user, closes the editor and announces success', async () => {
    component.openCreate(trigger);

    await component.createUser({
      email: 'new@example.test',
      displayName: 'Nouveau Compte',
      password: 'secure-password',
      role: 'VIEWER',
    });

    expect(store.create).toHaveBeenCalledWith({
      email: 'new@example.test',
      displayName: 'Nouveau Compte',
      password: 'secure-password',
      role: 'VIEWER',
    });
    expect(component.editorMode()).toBeNull();
    expect(component.announcement()).toContain('Nouveau Compte');
    expect(snackbar.open).toHaveBeenCalledWith('Compte créé', 'Fermer', { duration: 4000 });
  });

  it('keeps the editor open and maps API validation errors', async () => {
    component.openEdit({ user: user(), trigger });
    store.update.mockRejectedValue(new HttpErrorResponse({
      status: 400,
      error: {
        status: 400,
        title: 'Validation impossible',
        detail: 'Corrigez le nom.',
        errors: { displayName: 'Nom invalide.' },
        requestId: 'request-page-42',
      },
    }));

    await component.updateUser({ displayName: 'Édith', role: 'EDITOR' });

    expect(component.editorMode()).toBe('edit');
    expect(component.mutationError()?.fieldErrors['displayName']).toBe('Nom invalide.');
    expect(component.mutationError()?.requestId).toBe('request-page-42');
  });

  it('confirms disable, updates the account and restores the action focus', async () => {
    await component.changeEnabled({ user: user(), enabled: false, trigger });
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    expect(dialog.open).toHaveBeenCalled();
    expect(store.setEnabled).toHaveBeenCalledWith(7, false);
    expect(snackbar.open).toHaveBeenCalledWith('Compte désactivé', 'Fermer', { duration: 4000 });
    expect(component.announcement()).toBe('Le compte de Édith Martin est désactivé.');
    expect(document.activeElement).toBe(trigger);
  });

  it('keeps dirty content when discarding is cancelled', async () => {
    component.openEdit({ user: user(), trigger });
    dialog.open.mockReturnValue({ afterClosed: () => of(false) });

    await component.requestEditorClose(true);

    expect(component.editorMode()).toBe('edit');
  });

  it('resets a password and reports enabled-state business failures', async () => {
    component.openPassword({ user: user(), trigger });
    await component.resetPassword({ password: 'replacement-password' });
    expect(store.resetPassword).toHaveBeenCalledWith(7, { password: 'replacement-password' });
    expect(snackbar.open).toHaveBeenCalledWith('Mot de passe réinitialisé', 'Fermer', { duration: 4000 });

    store.setEnabled.mockRejectedValue(new HttpErrorResponse({
      status: 400,
      error: { status: 400, title: 'Opération impossible', detail: 'Conservez un administrateur actif.' },
    }));
    await component.changeEnabled({ user: user(), enabled: false, trigger });
    expect(component.actionError()?.detail).toBe('Conservez un administrateur actif.');
  });
});

function user(): UserAccount {
  return {
    id: 7,
    email: 'editor@example.test',
    displayName: 'Édith Martin',
    role: 'EDITOR',
    enabled: true,
    createdAt: '2026-08-18T10:00:00Z',
    updatedAt: '2026-08-18T10:00:00Z',
  };
}

function page(content: readonly UserAccount[]): UserPage {
  return {
    content,
    page: 0,
    size: 20,
    totalElements: content.length,
    totalPages: 1,
    last: true,
  };
}

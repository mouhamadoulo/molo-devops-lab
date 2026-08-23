import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ApiError } from '../../../../core/http/problem-detail';
import { UserAccount } from '../../models/user';
import { UserEditorMode, UserEditorPanel } from './user-editor-panel';

describe('UserEditorPanel', () => {
  let fixture: ComponentFixture<UserEditorPanel>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [UserEditorPanel] }).compileComponents();
    fixture = TestBed.createComponent(UserEditorPanel);
  });

  it('normalizes and emits a valid creation request', () => {
    render('create');
    const emitted = vi.fn();
    fixture.componentInstance.createUser.subscribe(emitted);
    fixture.componentInstance.accountForm.setValue({
      email: '  editor@example.test  ',
      displayName: '  Édith Martin  ',
      role: 'EDITOR',
      password: 'secure-password',
      confirmation: 'secure-password',
    });

    fixture.componentInstance.submitAccount();

    expect(emitted).toHaveBeenCalledWith({
      email: 'editor@example.test',
      displayName: 'Édith Martin',
      role: 'EDITOR',
      password: 'secure-password',
    });
  });

  it('rejects invalid creation fields before emitting', () => {
    render('create');
    const emitted = vi.fn();
    fixture.componentInstance.createUser.subscribe(emitted);
    fixture.componentInstance.accountForm.setValue({
      email: 'invalid',
      displayName: '   ',
      role: 'VIEWER',
      password: 'short',
      confirmation: 'different',
    });

    fixture.componentInstance.submitAccount();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent;
    expect(text).toContain('adresse e-mail valide');
    expect(text).toContain('Le nom est requis');
    expect(text).toContain('entre 12 et 128 caractères');
    expect(text).toContain('mots de passe doivent être identiques');
    expect(emitted).not.toHaveBeenCalled();
  });

  it('loads an account and emits only editable fields', () => {
    render('edit', user());
    const emitted = vi.fn();
    fixture.componentInstance.updateUser.subscribe(emitted);
    fixture.componentInstance.accountForm.patchValue({ displayName: '  Édith Durand  ', role: 'VIEWER' });

    fixture.componentInstance.submitAccount();

    expect(fixture.componentInstance.accountForm.controls.email.value).toBe('editor@example.test');
    expect((fixture.nativeElement as HTMLElement).querySelector('#user-email')?.getAttribute('readonly')).not.toBeNull();
    expect(emitted).toHaveBeenCalledWith({ displayName: 'Édith Durand', role: 'VIEWER' });
  });

  it('emits a valid password without its confirmation', () => {
    render('password', user());
    const emitted = vi.fn();
    fixture.componentInstance.resetPassword.subscribe(emitted);
    fixture.componentInstance.passwordForm.setValue({
      password: 'replacement-password',
      confirmation: 'replacement-password',
    });

    fixture.componentInstance.submitPassword();

    expect(emitted).toHaveBeenCalledWith({ password: 'replacement-password' });
  });

  it('maps server field errors and exposes the safe request reference', () => {
    render('create');
    fixture.componentInstance.accountForm.setValue({
      email: 'editor@example.test',
      displayName: 'Édith Martin',
      role: 'EDITOR',
      password: 'secure-password',
      confirmation: 'secure-password',
    });
    fixture.componentRef.setInput('apiError', validationError());
    fixture.detectChanges();

    expect(fixture.componentInstance.accountForm.controls.email.getError('server')).toBe('Adresse déjà utilisée.');
    const alert = (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Corrigez les champs signalés.');
    expect(alert?.textContent).toContain('request-user-42');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Adresse déjà utilisée.');
  });

  it('reports dirty close requests, disables submit and supports focus transfer', () => {
    render('edit', user(), null, true);
    fixture.componentInstance.accountForm.controls.displayName.setValue('Modifié');
    fixture.componentInstance.accountForm.markAsDirty();
    const emitted = vi.fn();
    fixture.componentInstance.closeRequested.subscribe(emitted);

    fixture.componentInstance.requestClose();
    fixture.componentInstance.focusHeading();

    expect(emitted).toHaveBeenCalledWith(true);
    expect((fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
    expect(document.activeElement).toBe((fixture.nativeElement as HTMLElement).querySelector('h2'));
  });

  function render(
    mode: UserEditorMode,
    account: UserAccount | null = null,
    error: ApiError | null = null,
    submitting = false,
  ): void {
    fixture.componentRef.setInput('mode', mode);
    fixture.componentRef.setInput('user', account);
    fixture.componentRef.setInput('apiError', error);
    fixture.componentRef.setInput('submitting', submitting);
    fixture.detectChanges();
  }
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

function validationError(): ApiError {
  return {
    status: 400,
    title: 'Validation impossible',
    detail: 'Corrigez les champs signalés.',
    fieldErrors: { email: 'Adresse déjà utilisée.' },
    requestId: 'request-user-42',
  };
}

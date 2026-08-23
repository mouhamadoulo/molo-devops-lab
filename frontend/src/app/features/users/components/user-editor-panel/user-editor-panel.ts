import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatError, MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatOption, MatSelect } from '@angular/material/select';
import { UserRole } from '../../../../core/auth/auth.models';
import { ApiError } from '../../../../core/http/problem-detail';
import {
  CreateUserRequest,
  ResetPasswordRequest,
  UpdateUserRequest,
  USER_ROLE_LABELS,
  USER_ROLES,
  UserAccount,
} from '../../models/user';

export type UserEditorMode = 'create' | 'edit' | 'password';

@Component({
  selector: 'app-user-editor-panel',
  imports: [
    MatButton,
    MatError,
    MatFormField,
    MatHint,
    MatInput,
    MatLabel,
    MatOption,
    MatSelect,
    ReactiveFormsModule,
  ],
  templateUrl: './user-editor-panel.html',
  styleUrl: './user-editor-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.aria-busy]': 'submitting()' },
})
export class UserEditorPanel {
  private readonly formBuilder = inject(FormBuilder).nonNullable;
  private readonly heading = viewChild.required<ElementRef<HTMLHeadingElement>>('heading');

  readonly mode = input.required<UserEditorMode>();
  readonly user = input<UserAccount | null>(null);
  readonly apiError = input<ApiError | null>(null);
  readonly submitting = input(false);
  readonly createUser = output<CreateUserRequest>();
  readonly updateUser = output<UpdateUserRequest>();
  readonly resetPassword = output<ResetPasswordRequest>();
  readonly closeRequested = output<boolean>();

  readonly roles = USER_ROLES;
  readonly roleLabels = USER_ROLE_LABELS;
  readonly title = computed(() => {
    switch (this.mode()) {
      case 'create': return 'Créer un utilisateur';
      case 'edit': return 'Modifier le compte';
      case 'password': return 'Réinitialiser le mot de passe';
    }
  });

  readonly accountForm = this.formBuilder.group({
    email: ['', [Validators.required, Validators.email]],
    displayName: ['', [nonBlank, Validators.maxLength(120)]],
    role: this.formBuilder.control<UserRole>('VIEWER', Validators.required),
    password: ['', [Validators.required, Validators.minLength(12), Validators.maxLength(128)]],
    confirmation: ['', Validators.required],
  }, { validators: passwordConfirmation });

  readonly passwordForm = this.formBuilder.group({
    password: ['', [Validators.required, Validators.minLength(12), Validators.maxLength(128)]],
    confirmation: ['', Validators.required],
  }, { validators: passwordConfirmation });

  constructor() {
    effect(() => this.resetForMode(this.mode(), this.user()));
    effect(() => this.applyServerErrors(this.apiError()));
  }

  submitAccount(): void {
    this.accountForm.controls.email.setValue(this.accountForm.controls.email.value.trim());
    this.accountForm.controls.displayName.setValue(this.accountForm.controls.displayName.value.trim());
    if (this.accountForm.invalid) {
      this.accountForm.markAllAsTouched();
      return;
    }

    const value = this.accountForm.getRawValue();
    if (this.mode() === 'create') {
      this.createUser.emit({
        email: value.email,
        displayName: value.displayName,
        password: value.password,
        role: value.role,
      });
      return;
    }

    this.updateUser.emit({
      displayName: value.displayName,
      role: value.role,
    });
  }

  submitPassword(): void {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    this.resetPassword.emit({ password: this.passwordForm.getRawValue().password });
  }

  requestClose(): void {
    const dirty = this.mode() === 'password' ? this.passwordForm.dirty : this.accountForm.dirty;
    this.closeRequested.emit(dirty);
  }

  focusHeading(): void {
    this.heading().nativeElement.focus();
  }

  private resetForMode(mode: UserEditorMode, user: UserAccount | null): void {
    if (mode === 'edit') {
      this.accountForm.controls.password.disable({ emitEvent: false });
      this.accountForm.controls.confirmation.disable({ emitEvent: false });
      this.accountForm.reset({
        email: user?.email ?? '',
        displayName: user?.displayName ?? '',
        role: user?.role ?? 'VIEWER',
        password: '',
        confirmation: '',
      });
      return;
    }

    if (mode === 'create') {
      this.accountForm.controls.password.enable({ emitEvent: false });
      this.accountForm.controls.confirmation.enable({ emitEvent: false });
      this.accountForm.reset({
        email: '',
        displayName: '',
        role: 'VIEWER',
        password: '',
        confirmation: '',
      });
      return;
    }

    this.passwordForm.reset({ password: '', confirmation: '' });
  }

  private applyServerErrors(error: ApiError | null): void {
    clearServerErrors(this.accountForm.controls);
    clearServerErrors(this.passwordForm.controls);
    if (!error) return;

    for (const [field, message] of Object.entries(error.fieldErrors)) {
      const control = this.mode() === 'password'
        ? this.passwordForm.get(field)
        : this.accountForm.get(field);
      if (!control) continue;
      control.setErrors({ ...control.errors, server: message });
      control.markAsTouched();
    }
  }
}

function nonBlank(control: AbstractControl<string>): ValidationErrors | null {
  return control.value.trim().length > 0 ? null : { required: true };
}

function passwordConfirmation(control: AbstractControl): ValidationErrors | null {
  const password = control.get('password')?.value;
  const confirmation = control.get('confirmation')?.value;
  return password === confirmation ? null : { passwordMismatch: true };
}

function clearServerErrors(controls: Readonly<Record<string, AbstractControl>>): void {
  for (const control of Object.values(controls)) {
    if (!control.hasError('server')) continue;
    const errors = { ...control.errors };
    delete errors['server'];
    control.setErrors(Object.keys(errors).length > 0 ? errors : null);
  }
}

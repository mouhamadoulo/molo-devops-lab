import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, throwError } from 'rxjs';

import { AuthStore } from '../../../../core/auth/auth.store';
import { LoginPage } from './login-page';

describe('LoginPage', () => {
  let fixture: ComponentFixture<LoginPage>;
  let store: { login: ReturnType<typeof vi.fn>; error: ReturnType<typeof signal<string | null>> };
  let router: { navigateByUrl: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    store = { login: vi.fn(), error: signal(null) };
    router = { navigateByUrl: vi.fn().mockResolvedValue(true) };
    await TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [
        { provide: AuthStore, useValue: store },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => '/products' } } } }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();
  });

  it('shows field errors and does not submit an invalid form', () => {
    fixture.componentInstance.submit();
    fixture.detectChanges();

    expect(store.login).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Saisissez une adresse e-mail valide');
    expect(fixture.nativeElement.textContent).toContain('Le mot de passe est requis');
  });

  it('submits typed credentials once and navigates to the return URL', () => {
    const result = new Subject<never>();
    store.login.mockReturnValue(result);
    fixture.componentInstance.form.setValue({ email: 'admin@example.test', password: 'secret-password' });

    fixture.componentInstance.submit();
    expect(fixture.componentInstance.pending()).toBe(true);
    result.complete();

    expect(store.login).toHaveBeenCalledWith({ email: 'admin@example.test', password: 'secret-password' });
    expect(router.navigateByUrl).toHaveBeenCalledWith('/products');
  });

  it('shows a generic error summary and moves focus to it', async () => {
    store.login.mockReturnValue(throwError(() => new Error('sensitive backend detail')));
    fixture.componentInstance.form.setValue({ email: 'admin@example.test', password: 'wrong-password' });

    fixture.componentInstance.submit();
    fixture.detectChanges();
    await fixture.whenStable();

    const summary = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement;
    expect(summary.textContent).toContain('Connexion impossible');
    expect(document.activeElement).toBe(summary);
  });
});

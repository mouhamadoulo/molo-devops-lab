import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UserAccount } from '../../models/user';
import { DEFAULT_USER_QUERY, UserQuery } from '../../models/user-query';
import { UserList } from './user-list';

describe('UserList', () => {
  let fixture: ComponentFixture<UserList>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [UserList] }).compileComponents();
    fixture = TestBed.createComponent(UserList);
  });

  it('renders the named table and mobile cards with explicit role and status', () => {
    render([user()]);

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('table')?.getAttribute('aria-label')).toBe('Utilisateurs administrés');
    expect(host.querySelector('[data-mobile-users]')).not.toBeNull();
    expect(host.textContent).toContain('Édith Martin');
    expect(host.textContent).toContain('Éditeur');
    expect(host.textContent).toContain('Actif');
  });

  it('toggles the active sort direction and resets the page', () => {
    render([user()], { ...DEFAULT_USER_QUERY, page: 2, sort: 'email', direction: 'asc' });
    const emitted = vi.fn();
    fixture.componentInstance.sortChange.subscribe(emitted);

    fixture.componentInstance.changeSort('email');

    expect(emitted).toHaveBeenCalledWith({ page: 0, sort: 'email', direction: 'desc' });
  });

  it('emits account actions with the originating control', () => {
    render([user()]);
    const edit = vi.fn();
    const password = vi.fn();
    const enabled = vi.fn();
    fixture.componentInstance.edit.subscribe(edit);
    fixture.componentInstance.password.subscribe(password);
    fixture.componentInstance.enabledChange.subscribe(enabled);
    const host = fixture.nativeElement as HTMLElement;

    host.querySelector<HTMLButtonElement>('[aria-label="Modifier Édith Martin"]')?.click();
    host.querySelector<HTMLButtonElement>('[aria-label="Réinitialiser le mot de passe de Édith Martin"]')?.click();
    host.querySelector<HTMLButtonElement>('[aria-label="Désactiver Édith Martin"]')?.click();

    expect(edit.mock.calls[0]?.[0].user.id).toBe(7);
    expect(edit.mock.calls[0]?.[0].trigger).toBeInstanceOf(HTMLElement);
    expect(password.mock.calls[0]?.[0].user.id).toBe(7);
    expect(enabled.mock.calls[0]?.[0]).toMatchObject({ user: { id: 7 }, enabled: false });
  });

  it('prevents self-disable with an explicit explanation', () => {
    render([user({ id: 1 })], DEFAULT_USER_QUERY, 1);

    const action = (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-enabled-action]');
    expect(action?.disabled).toBe(true);
    expect(action?.getAttribute('aria-describedby')).toBe('self-disable-1');
    expect((fixture.nativeElement as HTMLElement).querySelector('#self-disable-1')?.textContent)
      .toContain('propre compte');
  });

  it('disables every action only for the pending account', () => {
    render([
      user({ id: 7, displayName: 'Édith Martin' }),
      user({ id: 8, displayName: 'Victor Hugo', email: 'viewer@example.test', role: 'VIEWER' }),
    ], DEFAULT_USER_QUERY, 1, 7);

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector<HTMLButtonElement>('[aria-label="Modifier Édith Martin"]')?.disabled).toBe(true);
    expect(host.querySelector<HTMLButtonElement>('[aria-label="Modifier Victor Hugo"]')?.disabled).toBe(false);
    expect(host.textContent).toContain('Lecteur');
  });

  function render(
    users: readonly UserAccount[],
    query: UserQuery = DEFAULT_USER_QUERY,
    currentUserId = 1,
    pendingUserId: number | null = null,
  ): void {
    fixture.componentRef.setInput('users', users);
    fixture.componentRef.setInput('query', query);
    fixture.componentRef.setInput('currentUserId', currentUserId);
    fixture.componentRef.setInput('pendingUserId', pendingUserId);
    fixture.detectChanges();
  }
});

function user(patch: Partial<UserAccount> = {}): UserAccount {
  return {
    id: 7,
    email: 'editor@example.test',
    displayName: 'Édith Martin',
    role: 'EDITOR',
    enabled: true,
    createdAt: '2026-08-18T10:00:00Z',
    updatedAt: '2026-08-18T10:00:00Z',
    ...patch,
  };
}

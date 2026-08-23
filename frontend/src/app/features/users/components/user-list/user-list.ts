import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { USER_ROLE_LABELS, UserAccount } from '../../models/user';
import { UserQuery, UserSort } from '../../models/user-query';

export interface UserAction {
  readonly user: UserAccount;
  readonly trigger: HTMLElement;
}

export interface UserEnabledAction extends UserAction {
  readonly enabled: boolean;
}

@Component({
  selector: 'app-user-list',
  templateUrl: './user-list.html',
  styleUrl: './user-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserList {
  readonly users = input.required<readonly UserAccount[]>();
  readonly query = input.required<UserQuery>();
  readonly currentUserId = input.required<number>();
  readonly pendingUserId = input<number | null>(null);
  readonly sortChange = output<Partial<UserQuery>>();
  readonly edit = output<UserAction>();
  readonly password = output<UserAction>();
  readonly enabledChange = output<UserEnabledAction>();

  readonly roleLabels = USER_ROLE_LABELS;

  changeSort(sort: UserSort): void {
    this.sortChange.emit({
      page: 0,
      sort,
      direction: this.query().sort === sort && this.query().direction === 'asc' ? 'desc' : 'asc',
    });
  }

  sortLabel(sort: UserSort, label: string): string {
    if (this.query().sort !== sort) return `Trier par ${label}`;
    return `Trier par ${label}, ordre ${this.query().direction === 'asc' ? 'croissant' : 'décroissant'}`;
  }

  formatDate(value: string): string {
    return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(value));
  }

  editAccount(user: UserAccount, event: MouseEvent): void {
    const trigger = event.currentTarget;
    if (trigger instanceof HTMLElement) this.edit.emit({ user, trigger });
  }

  editPassword(user: UserAccount, event: MouseEvent): void {
    const trigger = event.currentTarget;
    if (trigger instanceof HTMLElement) this.password.emit({ user, trigger });
  }

  toggleEnabled(user: UserAccount, event: MouseEvent): void {
    const trigger = event.currentTarget;
    if (trigger instanceof HTMLElement) {
      this.enabledChange.emit({ user, enabled: !user.enabled, trigger });
    }
  }

  enabledActionLabel(user: UserAccount): string {
    if (user.id === this.currentUserId()) {
      return 'Vous ne pouvez pas désactiver votre propre compte';
    }
    return `${user.enabled ? 'Désactiver' : 'Activer'} ${user.displayName}`;
  }

  isPending(user: UserAccount): boolean {
    return this.pendingUserId() === user.id;
  }
}

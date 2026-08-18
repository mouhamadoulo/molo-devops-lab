import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthStore } from '../../auth/auth.store';
import { hasPermission } from '../../auth/permissions';

@Component({
  selector: 'app-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppShell {
  private readonly store = inject(AuthStore);
  private readonly router = inject(Router);

  readonly user = this.store.user;
  readonly canManageUsers = computed(() => hasPermission(this.store.role(), 'manageUsers'));

  logout(): void {
    this.store.logout().subscribe({
      complete: () => void this.router.navigateByUrl('/login'),
      error: () => void this.router.navigateByUrl('/login')
    });
  }
}

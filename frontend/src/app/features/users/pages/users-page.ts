import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-users-page',
  template: `<section><p>Administration</p><h1>Utilisateurs</h1><span>Gérez ici les comptes et leurs rôles.</span></section>`,
  styles: [`p{margin:0 0 .5rem;color:var(--accent);font-size:.75rem;font-weight:750;letter-spacing:.1em;text-transform:uppercase}h1{margin:0;color:var(--ink);font-size:2.2rem;letter-spacing:-.04em}span{display:block;margin-top:.75rem;color:var(--ink-muted)}`],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UsersPage {}

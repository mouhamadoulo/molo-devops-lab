import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-login-page',
  template: `
    <main aria-labelledby="login-title">
      <h1 id="login-title">Connexion</h1>
    </main>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoginPage {}

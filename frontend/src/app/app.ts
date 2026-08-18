import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthStore } from './core/auth/auth.store';
import { LoadingScreen } from './shared/ui/loading-screen/loading-screen';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, LoadingScreen],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class App {
  readonly auth = inject(AuthStore);
}

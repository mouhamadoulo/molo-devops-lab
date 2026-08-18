import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-loading-screen',
  template: `<div class="loading" role="status"><span aria-hidden="true"></span><p>Restauration de la session</p></div>`,
  styles: [`.loading{min-height:100dvh;display:grid;place-content:center;justify-items:center;gap:1rem;color:var(--ink-muted);background:var(--canvas)}span{width:2rem;height:2rem;border:3px solid var(--line);border-top-color:var(--accent);border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){span{animation-duration:2s}}`],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoadingScreen {}

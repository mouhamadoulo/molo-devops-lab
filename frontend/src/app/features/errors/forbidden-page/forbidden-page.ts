import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-forbidden-page',
  imports: [RouterLink],
  template: `<main class="forbidden"><p>Erreur 403</p><h1>Accès refusé</h1><span>Votre rôle ne permet pas d’ouvrir cette page.</span><a routerLink="/products">Revenir aux produits</a></main>`,
  styles: [`.forbidden{min-height:100dvh;display:grid;place-content:center;justify-items:start;gap:.8rem;padding:2rem;background:var(--canvas)}p{margin:0;color:var(--accent);font-weight:750}h1{margin:0;color:var(--ink);font-size:clamp(2rem,7vw,4rem);letter-spacing:-.05em}span{color:var(--ink-muted)}a{min-height:2.75rem;display:inline-flex;align-items:center;margin-top:1rem;padding:0 1rem;border-radius:.6rem;color:var(--accent-ink);background:var(--accent);text-decoration:none;font-weight:700}a:focus-visible{outline:3px solid var(--focus-ring);outline-offset:3px}`],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ForbiddenPage {}

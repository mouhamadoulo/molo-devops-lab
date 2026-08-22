import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-page-header',
  template: `
    <header>
      <div>
        <p>{{ eyebrow() }}</p>
        <h1>{{ title() }}</h1>
        @if (description()) { <span>{{ description() }}</span> }
      </div>
      <ng-content />
    </header>
  `,
  styles: [`
    :host{display:block}header{display:flex;align-items:flex-start;justify-content:space-between;gap:2rem}p{margin:0 0 .5rem;color:var(--accent);font-size:.75rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase}h1{margin:0;color:var(--ink);font-size:2.25rem;line-height:1.1;letter-spacing:-.04em;text-wrap:balance}span{display:block;max-inline-size:65ch;margin-block-start:.7rem;color:var(--ink-muted);line-height:1.5}@media(max-width:600px){header{display:grid;gap:1.25rem}h1{font-size:1.8rem}}
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PageHeader {
  readonly eyebrow = input('Catalogue');
  readonly title = input.required<string>();
  readonly description = input('');
}

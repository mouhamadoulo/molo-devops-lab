import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-products-page',
  template: `<section class="page"><div><p>Catalogue</p><h1>Produits</h1><span>Le catalogue sécurisé est prêt à recevoir ses parcours métier.</span></div><button type="button" disabled>Ajouter un produit</button></section>`,
  styles: [`.page{display:flex;align-items:flex-start;justify-content:space-between;gap:2rem}.page p{margin:0 0 .5rem;color:var(--accent);font-size:.75rem;font-weight:750;letter-spacing:.1em;text-transform:uppercase}.page h1{margin:0;color:var(--ink);font-size:2.2rem;letter-spacing:-.04em}.page span{display:block;margin-top:.75rem;color:var(--ink-muted)}button{min-height:2.75rem;padding:0 1rem;border:0;border-radius:.6rem;color:var(--accent-ink);background:var(--accent);font-weight:700;opacity:.55}@media(max-width:600px){.page{display:grid}}`],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProductsPage {}

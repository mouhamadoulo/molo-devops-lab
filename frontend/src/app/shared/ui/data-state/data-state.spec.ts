import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DataState } from './data-state';

describe('DataState', () => {
  let fixture: ComponentFixture<DataState>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [DataState] }).compileComponents();
    fixture = TestBed.createComponent(DataState);
  });

  it.each([
    ['loading', 'Chargement du catalogue', 'status'],
    ['error', 'Catalogue indisponible', 'alert'],
    ['empty', 'Aucun produit', 'status'],
    ['success', 'Catalogue chargé', 'status'],
  ] as const)('renders only the %s state', (state, expectedText, expectedRole) => {
    fixture.componentRef.setInput('state', state);
    fixture.componentRef.setInput('loadingLabel', 'Chargement du catalogue');
    fixture.componentRef.setInput('emptyTitle', 'Aucun produit');
    fixture.componentRef.setInput('successLabel', 'Catalogue chargé');
    fixture.componentRef.setInput('error', {
      status: 503,
      title: 'Catalogue indisponible',
      detail: 'Le service ne répond pas.',
      fieldErrors: {},
      requestId: 'request-42',
    });
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain(expectedText);
    expect(host.querySelectorAll('[data-state]').length).toBe(1);
    expect(host.querySelector(`[role="${expectedRole}"]`)).not.toBeNull();
  });

  it('emits retry from the error state', () => {
    const retry = vi.fn();
    fixture.componentRef.setInput('state', 'error');
    fixture.componentRef.setInput('error', {
      status: 503,
      title: 'Catalogue indisponible',
      detail: 'Le service ne répond pas.',
      fieldErrors: {},
    });
    fixture.componentInstance.retry.subscribe(retry);
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button')?.click();

    expect(retry).toHaveBeenCalledOnce();
  });

  it('renders a stable skeleton layout while data is loading', () => {
    fixture.componentRef.setInput('state', 'loading');
    fixture.componentRef.setInput('loadingLabel', 'Chargement du catalogue');
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelectorAll('[data-skeleton-row]')).toHaveLength(4);
    expect(host.querySelector('.spinner')).toBeNull();
  });
});

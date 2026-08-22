import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ApiError } from '../../../core/http/problem-detail';

export type DataStateKind = 'loading' | 'error' | 'empty' | 'success';

@Component({
  selector: 'app-data-state',
  templateUrl: './data-state.html',
  styleUrl: './data-state.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DataState {
  readonly state = input.required<DataStateKind>();
  readonly error = input<ApiError | null>(null);
  readonly loadingLabel = input('Chargement des données');
  readonly emptyTitle = input('Aucune donnée');
  readonly emptyMessage = input('Aucun élément ne correspond à cette vue.');
  readonly successLabel = input('Données chargées');
  readonly retry = output<void>();
}

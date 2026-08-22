import { HttpErrorResponse } from '@angular/common/http';
import { ApiError, ProblemDetail } from './problem-detail';

const DEFAULT_ERROR: ApiError = {
  status: 500,
  title: 'Une erreur est survenue',
  detail: 'Réessayez dans quelques instants.',
  fieldErrors: {},
};

export function mapApiError(error: unknown): ApiError {
  if (!(error instanceof HttpErrorResponse)) {
    return DEFAULT_ERROR;
  }

  if (error.status === 0) {
    return {
      status: 0,
      title: 'Service indisponible',
      detail: 'Vérifiez votre connexion, puis réessayez.',
      fieldErrors: {},
    };
  }

  const problem = isProblemDetail(error.error) ? error.error : {};
  return {
    status: error.status,
    title: problem.title ?? DEFAULT_ERROR.title,
    detail: problem.detail ?? DEFAULT_ERROR.detail,
    fieldErrors: isStringRecord(problem.errors) ? problem.errors : {},
    ...(typeof problem.requestId === 'string' ? { requestId: problem.requestId } : {}),
  };
}

function isProblemDetail(value: unknown): value is ProblemDetail {
  return typeof value === 'object' && value !== null;
}

function isStringRecord(value: unknown): value is Readonly<Record<string, string>> {
  return typeof value === 'object'
    && value !== null
    && Object.values(value).every((entry) => typeof entry === 'string');
}

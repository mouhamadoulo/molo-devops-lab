import { HttpErrorResponse } from '@angular/common/http';
import { mapApiError } from './api-error.mapper';

describe('mapApiError', () => {
  it('maps Problem Details and validation fields without exposing unknown payload values', () => {
    const result = mapApiError(new HttpErrorResponse({
      status: 400,
      error: {
        type: '/problems/validation',
        title: 'Validation failed',
        detail: 'Request validation failed',
        errors: { name: 'must not be blank', price: 'must be greater than or equal to 0.00' },
        requestId: 'request-42',
        internalTrace: 'must stay hidden',
      },
    }));

    expect(result).toEqual({
      status: 400,
      title: 'Validation failed',
      detail: 'Request validation failed',
      fieldErrors: { name: 'must not be blank', price: 'must be greater than or equal to 0.00' },
      requestId: 'request-42',
    });
  });

  it('returns an actionable connection error for a network failure', () => {
    const result = mapApiError(new HttpErrorResponse({ status: 0 }));

    expect(result.status).toBe(0);
    expect(result.title).toBe('Service indisponible');
    expect(result.detail).toContain('Vérifiez votre connexion');
    expect(result.fieldErrors).toEqual({});
  });
});

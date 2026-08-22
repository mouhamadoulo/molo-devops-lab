import { describe, expect, it } from 'vitest';
import { environment } from './environment';

describe('development environment', () => {
  it('routes API calls through the same-origin development proxy', () => {
    expect(environment.apiUrl).toBe('/api/v1');
  });
});

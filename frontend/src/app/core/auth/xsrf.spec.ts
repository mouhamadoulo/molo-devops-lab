import { readCookie, xsrfHeaders } from './xsrf';

describe('XSRF helpers', () => {
  it('reads and decodes the requested cookie', () => {
    expect(readCookie('theme=dark; XSRF-TOKEN=a%2Bb%3D; session=value', 'XSRF-TOKEN'))
      .toBe('a+b=');
  });

  it('adds the XSRF header only when the cookie exists', () => {
    expect(xsrfHeaders('XSRF-TOKEN=csrf-value').get('X-XSRF-TOKEN')).toBe('csrf-value');
    expect(xsrfHeaders('theme=dark').has('X-XSRF-TOKEN')).toBe(false);
  });
});

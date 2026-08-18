import { HttpHeaders } from '@angular/common/http';

const XSRF_COOKIE = 'XSRF-TOKEN';
const XSRF_HEADER = 'X-XSRF-TOKEN';

export function readCookie(cookieHeader: string, name: string): string | null {
  const prefix = `${name}=`;
  for (const part of cookieHeader.split(';')) {
    const cookie = part.trim();
    if (cookie.startsWith(prefix)) {
      return decodeURIComponent(cookie.slice(prefix.length));
    }
  }
  return null;
}

export function xsrfHeaders(cookieHeader: string): HttpHeaders {
  const token = readCookie(cookieHeader, XSRF_COOKIE);
  return token === null ? new HttpHeaders() : new HttpHeaders({ [XSRF_HEADER]: token });
}

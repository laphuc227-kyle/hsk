// API Client helper to route requests to backend with optional Firebase ID token
import { getAuthIdToken } from './firebase';

export function isStaticHost(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host.includes('github.io') || host.includes('pages.dev') || host.includes('vercel.app');
}

export function getApiUrl(endpoint: string): string {
  const clean = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return clean;
}

export async function authorizedFetch(endpoint: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAuthIdToken().catch(() => null);
  const headers = new Headers(init.headers || {});
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(getApiUrl(endpoint), {
    ...init,
    headers,
  });
}

// API Client helper to route requests to backend
// When running on static hosting (e.g. GitHub Pages), routes calls to the deployed Cloud Run server

export const CLOUD_BACKEND_URL = 'https://ais-pre-vo4xafilrcvc4rmpfvc2w3-140551598657.asia-east1.run.app';

export function getApiUrl(endpoint: string): string {
  const clean = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    // When on GitHub Pages or custom static domains, call the deployed backend
    if (host.includes('github.io') || host.includes('pages.dev') || host.includes('vercel.app')) {
      return `${CLOUD_BACKEND_URL}${clean}`;
    }
  }

  // Local development or running directly on Cloud Run
  return clean;
}

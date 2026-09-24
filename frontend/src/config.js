/**
 * Frontend Runtime Configuration
 */
const isBrowser = typeof window !== 'undefined' && typeof window.location !== 'undefined';

export const config = {
  apiBaseUrl:
    isBrowser &&
    (window.location.origin.includes(':3000') || window.location.origin.includes(':8080'))
      ? '/api/v1'
      : 'http://localhost:3000/api/v1',
  appName: 'Young Tours & Travels',
  version: '1.0.0',
};

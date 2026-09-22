/**
 * Frontend Runtime Configuration
 */
export const config = {
  apiBaseUrl:
    window.location.origin.includes(':3000') || window.location.origin.includes(':8080')
      ? '/api/v1'
      : 'http://localhost:3000/api/v1',
  appName: 'Young Tours & Travels',
  version: '1.0.0',
};

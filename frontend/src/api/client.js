import { config } from '../config.js';

/**
 * Standard API Client with uniform error handling and response unwrapping.
 */
export class ApiClient {
  constructor(baseUrl = config.apiBaseUrl) {
    this.baseUrl = baseUrl;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers || {}),
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      const json = await response.json();

      if (!response.ok || !json.success) {
        const errorMsg =
          json.error?.message || `HTTP Error ${response.status}: ${response.statusText}`;
        const error = new Error(errorMsg);
        error.code = json.error?.code;
        error.details = json.error?.details;
        throw error;
      }

      return json.data;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[API Client Error] ${options.method || 'GET'} ${url}:`, err);
      throw err;
    }
  }

  async get(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'GET' });
  }

  async post(endpoint, body, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async checkHealth() {
    return this.get('/health');
  }
}

export const api = new ApiClient();

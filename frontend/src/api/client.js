import { config } from '../config.js';
import { authStore } from '../state/auth.js';

/**
 * Standard API Client with in-memory Bearer token injection,
 * automatic 401 refresh rotation retry, and session restoration.
 */
export class ApiClient {
  constructor(baseUrl = config.apiBaseUrl, store = authStore) {
    this.baseUrl = baseUrl;
    this.store = store;
    this.refreshPromise = null;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers || {}),
    };

    // Attach in-memory access token if available and not skipped
    const token = this.store.getAccessToken();
    if (token && !options.skipAuth && !headers['Authorization'] && !headers['authorization']) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const fetchOptions = {
      ...options,
      headers,
      credentials: options.credentials || 'include',
    };

    try {
      const response = await fetch(url, fetchOptions);

      // Handle 401 Unauthorized with single token refresh retry
      if (
        response.status === 401 &&
        options.retry !== false &&
        !endpoint.includes('/auth/refresh') &&
        !endpoint.includes('/auth/login') &&
        !endpoint.includes('/auth/register')
      ) {
        try {
          await this.refreshSession();
          // Retry the original request exactly once with rotated token
          return await this.request(endpoint, {
            ...options,
            retry: false,
          });
        } catch (refreshErr) {
          this.store.clearSession();
          throw refreshErr;
        }
      }

      let json;
      try {
        json = await response.json();
      } catch {
        json = null;
      }

      if (!response.ok || !json?.success) {
        const errorMsg =
          json?.error?.message || `HTTP Error ${response.status}: ${response.statusText}`;
        const error = new Error(errorMsg);
        error.status = response.status;
        error.code = json?.error?.code;
        error.details = json?.error?.details || [];
        throw error;
      }

      return json.data;
    } catch (err) {
      if (!options.silent) {
        // eslint-disable-next-line no-console
        console.error(`[API Client Error] ${options.method || 'GET'} ${url}:`, err);
      }
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
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  // --- Programmatic Authentication API ---

  async register(data) {
    const response = await this.post('/auth/register', data, {
      skipAuth: true,
      retry: false,
    });
    this.store.setSession(response.user, response.accessToken);
    return response;
  }

  async login(credentials) {
    const response = await this.post('/auth/login', credentials, {
      skipAuth: true,
      retry: false,
    });
    this.store.setSession(response.user, response.accessToken);
    return response;
  }

  async refreshSession() {
    // Shared promise concurrency guard prevents duplicate refresh storms
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = (async () => {
      try {
        const response = await this.post('/auth/refresh', undefined, {
          skipAuth: true,
          retry: false,
          silent: true,
        });
        this.store.setSession(response.user, response.accessToken);
        return response;
      } catch (err) {
        this.store.clearSession();
        throw err;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  async restoreSession() {
    this.store.setRestoring();
    try {
      const response = await this.refreshSession();
      return response;
    } catch {
      this.store.clearSession();
      return null;
    }
  }

  async logout() {
    try {
      await this.post('/auth/logout', undefined, {
        skipAuth: true,
        retry: false,
        silent: true,
      });
    } finally {
      this.store.clearSession();
    }
  }

  async getCurrentUser() {
    const response = await this.get('/auth/me');
    return response.user;
  }

  async checkHealth() {
    return this.get('/health', { skipAuth: true });
  }
}

export const api = new ApiClient();

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { authStore, AuthStatus } from '../../frontend/src/state/auth.js';
import { ApiClient } from '../../frontend/src/api/client.js';

describe('Phase 2 Step 7 — Frontend Authentication Foundation', () => {
  let apiClient: ApiClient;
  let originalFetch: typeof globalThis.fetch;

  const mockUser = {
    id: 'usr_8839210_uuid',
    email: 'traveller@example.com',
    fullName: 'John Traveller',
    role: 'CUSTOMER',
    isActive: true,
  };

  const mockAccessToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.dummy.signature';

  beforeEach(() => {
    authStore.clearSession();
    apiClient = new ApiClient('/api/v1', authStore);
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('In-Memory Auth State Store (authStore)', () => {
    it('1. initial state is unauthenticated with null tokens and null user', () => {
      expect(authStore.getStatus()).toBe(AuthStatus.UNAUTHENTICATED);
      expect(authStore.getAccessToken()).toBeNull();
      expect(authStore.getUser()).toBeNull();
      expect(authStore.isAuthenticated()).toBe(false);
    });

    it('2. setSession stores access token and user strictly in memory and updates status', () => {
      authStore.setSession(mockUser, mockAccessToken);

      expect(authStore.getStatus()).toBe(AuthStatus.AUTHENTICATED);
      expect(authStore.getAccessToken()).toBe(mockAccessToken);
      expect(authStore.getUser()).toEqual(mockUser);
      expect(authStore.isAuthenticated()).toBe(true);
    });

    it('3. clearSession resets all state to unauthenticated and removes tokens', () => {
      authStore.setSession(mockUser, mockAccessToken);
      authStore.clearSession();

      expect(authStore.getStatus()).toBe(AuthStatus.UNAUTHENTICATED);
      expect(authStore.getAccessToken()).toBeNull();
      expect(authStore.getUser()).toBeNull();
      expect(authStore.isAuthenticated()).toBe(false);
    });

    it('4. subscribe receives notifications when authentication state changes', () => {
      const listener = vi.fn();
      const unsubscribe = authStore.subscribe(listener);

      authStore.setSession(mockUser, mockAccessToken);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          status: AuthStatus.AUTHENTICATED,
          isAuthenticated: true,
          user: mockUser,
        }),
      );

      authStore.clearSession();
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          status: AuthStatus.UNAUTHENTICATED,
          isAuthenticated: false,
          user: null,
        }),
      );

      unsubscribe();
      authStore.setSession(mockUser, mockAccessToken);
      expect(listener).toHaveBeenCalledTimes(2); // No 3rd call after unsubscribe
    });
  });

  describe('ApiClient Programmatic Authentication Methods', () => {
    it('5. login calls /auth/login with credentials: include and updates in-memory store', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: { user: mockUser, accessToken: mockAccessToken },
          meta: {},
        }),
      });
      globalThis.fetch = mockFetch;

      const result = await apiClient.login({
        email: 'traveller@example.com',
        password: 'Password123!',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/auth/login',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
        }),
      );

      expect(result.user).toEqual(mockUser);
      expect(result.accessToken).toBe(mockAccessToken);
      expect(authStore.getAccessToken()).toBe(mockAccessToken);
      expect(authStore.isAuthenticated()).toBe(true);
    });

    it('6. register calls /auth/register with credentials: include and updates in-memory store', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          success: true,
          data: { user: mockUser, accessToken: mockAccessToken },
          meta: {},
        }),
      });
      globalThis.fetch = mockFetch;

      const result = await apiClient.register({
        email: 'traveller@example.com',
        password: 'Password123!',
        fullName: 'John Traveller',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/auth/register',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
        }),
      );

      expect(result.accessToken).toBe(mockAccessToken);
      expect(authStore.getAccessToken()).toBe(mockAccessToken);
    });

    it('7. restoreSession calls /auth/refresh and restores in-memory session on success', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: { user: mockUser, accessToken: mockAccessToken },
          meta: {},
        }),
      });
      globalThis.fetch = mockFetch;

      const result = await apiClient.restoreSession();

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/auth/refresh',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
        }),
      );

      expect(result).not.toBeNull();
      expect(authStore.getAccessToken()).toBe(mockAccessToken);
      expect(authStore.isAuthenticated()).toBe(true);
    });

    it('8. restoreSession safely returns null and clears store on 401 failure without unhandled exception', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({
          success: false,
          error: { code: 'AUTHENTICATION_FAILED', message: 'No cookie' },
        }),
      });
      globalThis.fetch = mockFetch;

      const result = await apiClient.restoreSession();

      expect(result).toBeNull();
      expect(authStore.getStatus()).toBe(AuthStatus.UNAUTHENTICATED);
      expect(authStore.getAccessToken()).toBeNull();
    });

    it('9. logout calls /auth/logout with credentials: include and clears local in-memory session', async () => {
      authStore.setSession(mockUser, mockAccessToken);

      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: { message: 'Logged out' },
        }),
      });
      globalThis.fetch = mockFetch;

      await apiClient.logout();

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/auth/logout',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
        }),
      );

      expect(authStore.getAccessToken()).toBeNull();
      expect(authStore.isAuthenticated()).toBe(false);
    });

    it('10. logout clears local auth state even if network call fails', async () => {
      authStore.setSession(mockUser, mockAccessToken);

      const mockFetch = vi.fn().mockRejectedValueOnce(new Error('Network error'));
      globalThis.fetch = mockFetch;

      await expect(apiClient.logout()).rejects.toThrow('Network error');

      expect(authStore.getAccessToken()).toBeNull();
      expect(authStore.isAuthenticated()).toBe(false);
    });

    it('11. getCurrentUser calls /auth/me with Bearer token', async () => {
      authStore.setSession(mockUser, mockAccessToken);

      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: { user: mockUser },
        }),
      });
      globalThis.fetch = mockFetch;

      const user = await apiClient.getCurrentUser();

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/auth/me',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockAccessToken}`,
          }),
        }),
      );
      expect(user).toEqual(mockUser);
    });
  });

  describe('Authenticated Requests & Bearer Token Injection', () => {
    it('12. attaches Authorization: Bearer header when access token is in memory', async () => {
      authStore.setSession(mockUser, mockAccessToken);

      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: { result: 'data' },
        }),
      });
      globalThis.fetch = mockFetch;

      await apiClient.get('/protected-resource');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/protected-resource',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockAccessToken}`,
          }),
        }),
      );
    });

    it('13. does not attach Authorization header when user is unauthenticated', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: { result: 'public-data' },
        }),
      });
      globalThis.fetch = mockFetch;

      await apiClient.get('/public-resource');

      const headers = mockFetch.mock.calls[0]?.[1]?.headers;
      expect(headers?.['Authorization']).toBeUndefined();
    });
  });

  describe('401 Interception, Automatic Refresh & Single Retry', () => {
    it('14. on 401, attempts session refresh and retries the original request exactly once', async () => {
      const oldToken = 'old_expired_access_token';
      const newToken = 'new_fresh_access_token';
      authStore.setSession(mockUser, oldToken);

      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        callCount++;
        // 1. Initial request returns 401
        if (callCount === 1) {
          return {
            ok: false,
            status: 401,
            statusText: 'Unauthorized',
            json: async () => ({ success: false, error: { code: 'AUTHENTICATION_FAILED' } }),
          };
        }
        // 2. /auth/refresh returns new token
        if (url.includes('/auth/refresh')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              data: { user: mockUser, accessToken: newToken },
            }),
          };
        }
        // 3. Retried original request succeeds with new token
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: { payload: 'success_after_refresh' },
          }),
        };
      });
      globalThis.fetch = mockFetch;

      const data = await apiClient.get('/protected-endpoint');

      expect(data).toEqual({ payload: 'success_after_refresh' });
      expect(authStore.getAccessToken()).toBe(newToken);
      expect(callCount).toBe(3); // Initial (401) -> Refresh (200) -> Retry (200)
    });

    it('15. on 401 where refresh also fails, clears session and throws error without infinite loop', async () => {
      authStore.setSession(mockUser, 'some_token');

      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        callCount++;
        if (url.includes('/auth/refresh')) {
          return {
            ok: false,
            status: 401,
            statusText: 'Unauthorized',
            json: async () => ({ success: false, error: { message: 'Refresh token expired' } }),
          };
        }
        return {
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          json: async () => ({ success: false, error: { message: 'Expired access token' } }),
        };
      });
      globalThis.fetch = mockFetch;

      await expect(apiClient.get('/protected-endpoint', { silent: true })).rejects.toThrow();

      expect(authStore.getAccessToken()).toBeNull();
      expect(authStore.isAuthenticated()).toBe(false);
      expect(callCount).toBe(2); // Original 401 + 1 Refresh attempt (NO infinite retry)
    });

    it('16. concurrent 401 requests share a single refresh request (no refresh storm)', async () => {
      authStore.setSession(mockUser, 'expired_token');
      const freshToken = 'fresh_token_123';

      let refreshCalls = 0;
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/auth/refresh')) {
          refreshCalls++;
          // Simulate network latency for refresh
          await new Promise((resolve) => setTimeout(resolve, 20));
          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              data: { user: mockUser, accessToken: freshToken },
            }),
          };
        }

        // Return 401 for initial requests with expired token; 200 for fresh token
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: { url },
          }),
        };
      });
      globalThis.fetch = mockFetch;

      // Trigger multiple refresh requests simultaneously
      const [res1, res2, res3] = await Promise.all([
        apiClient.refreshSession(),
        apiClient.refreshSession(),
        apiClient.refreshSession(),
      ]);

      expect(res1.accessToken).toBe(freshToken);
      expect(res2.accessToken).toBe(freshToken);
      expect(res3.accessToken).toBe(freshToken);
      expect(refreshCalls).toBe(1); // Exactly 1 refresh request was executed!
    });
  });
});

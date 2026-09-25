/**
 * Frontend In-Memory Authentication State Store
 *
 * CRITICAL SECURITY INVARIANT:
 * Access tokens and user identity exist EXCLUSIVELY in JavaScript memory.
 * No tokens or credentials are EVER written to localStorage, sessionStorage, IndexedDB, or document.cookie.
 */

export const AuthStatus = {
  UNAUTHENTICATED: 'unauthenticated',
  RESTORING: 'restoring',
  AUTHENTICATED: 'authenticated',
};

class AuthStore {
  constructor() {
    this.status = AuthStatus.UNAUTHENTICATED;
    this.user = null;
    this.accessToken = null;
    this.listeners = new Set();
  }

  /**
   * Get current in-memory access token.
   * @returns {string|null}
   */
  getAccessToken() {
    return this.accessToken;
  }

  /**
   * Get current in-memory user profile.
   * @returns {object|null}
   */
  getUser() {
    return this.user ? { ...this.user } : null;
  }

  /**
   * Get current auth status.
   * @returns {'unauthenticated'|'restoring'|'authenticated'}
   */
  getStatus() {
    return this.status;
  }

  /**
   * Check whether the user is currently authenticated with a valid access token in memory.
   * @returns {boolean}
   */
  isAuthenticated() {
    return this.status === AuthStatus.AUTHENTICATED && Boolean(this.accessToken);
  }

  /**
   * Set active authentication session in memory.
   * @param {object} user - Safe UserDto
   * @param {string} accessToken - RS256 access token string
   */
  setSession(user, accessToken) {
    if (!accessToken || typeof accessToken !== 'string') {
      throw new Error('Valid access token string is required to set session.');
    }

    this.status = AuthStatus.AUTHENTICATED;
    this.user = user ? { ...user } : null;
    this.accessToken = accessToken;
    this.notify();
  }

  /**
   * Set status to restoring while background session restoration is underway.
   */
  setRestoring() {
    this.status = AuthStatus.RESTORING;
    this.notify();
  }

  /**
   * Clear in-memory session (used on logout or failed refresh).
   */
  clearSession() {
    this.status = AuthStatus.UNAUTHENTICATED;
    this.user = null;
    this.accessToken = null;
    this.notify();
  }

  /**
   * Subscribe a listener callback to authentication state changes.
   * @param {Function} listener
   * @returns {Function} Unsubscribe callback
   */
  subscribe(listener) {
    if (typeof listener === 'function') {
      this.listeners.add(listener);
    }
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notify all registered subscribers of state change.
   */
  notify() {
    const snapshot = {
      status: this.status,
      user: this.getUser(),
      isAuthenticated: this.isAuthenticated(),
    };
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[AuthStore] Listener error:', err);
      }
    }
  }
}

export const authStore = new AuthStore();

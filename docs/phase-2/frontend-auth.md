# Phase 2 — Frontend Authentication & State Architecture

This document describes the client-side authentication architecture, in-memory state management, transparent session recovery, and UI component integration.

---

## 1. Core Principles & Zero-Storage Invariant

```
+─────────────────────────────────────────────────────────────────────────────+
│                       BROWSER JAVASCRIPT MEMORY                             │
│                                                                             │
│  +───────────────────────────────────────────────────────────────────────+  │
│  │                    authStore (In-Memory Singleton)                    │  │
│  │                                                                       │  │
│  │  • status: 'unauthenticated' | 'restoring' | 'authenticated'          │  │
│  │  • user: { id, email, fullName, role, ... }                           │  │
│  │  • accessToken: "eyJhbGciOiJSUzI1NiIs..."                             │  │
│  │  • listeners: Set<Function>                                           │  │
│  +───────────────────────────────────┬───────────────────────────────────+  │
│                                      │                                      │
│                Subscribes            ▼            Injects Bearer Token      │
│  +─────────────────────────+                   +─────────────────────────+  │
│  │    Navbar & AuthModal   │                   │        ApiClient        │  │
│  │    (Reactive UI Sync)   │                   │  (Transparent 401 Retry)│  │
│  +─────────────────────────+                   +────────────┬────────────+  │
+─────────────────────────────────────────────────────────────┼───────────────+
                                                              │
                                       Fetch with             │
                                       credentials: 'include' │
                                                              ▼
                                            [Fastify /api/v1/auth]
                                            (Reads/Writes HttpOnly Cookie)
```

### Critical Security Invariant

- **Zero Browser Persistence:** Access tokens and user profiles exist exclusively in volatile JavaScript runtime memory (`authStore`).
- **No Local Storage:** No tokens or user credentials are ever stored in `localStorage`, `sessionStorage`, or `IndexedDB`.
- **Cookie Isolation:** The browser's native cookie jar manages the refresh token via `HttpOnly` flags, rendering it completely inaccessible to client-side scripts.

---

## 2. Component Specifications

### 2.1 `AuthStore`

- **Location:** [`frontend/src/state/auth.js`](file:///d:/Desktop/Travel-Web-/frontend/src/state/auth.js)
- **Purpose:** Centralized observable state store managing user authentication status.

#### State Model

```typescript
type AuthStatus = 'unauthenticated' | 'restoring' | 'authenticated';

interface AuthState {
  status: AuthStatus;
  user: UserDto | null;
  accessToken: string | null;
}
```

#### API Methods

| Method                    | Description                                                   | State Impact                                      |
| ------------------------- | ------------------------------------------------------------- | ------------------------------------------------- |
| `getAccessToken()`        | Returns in-memory JWT string or `null`                        | None (Read-only)                                  |
| `getUser()`               | Returns shallow copy of current `UserDto` or `null`           | None (Read-only)                                  |
| `getStatus()`             | Returns active `AuthStatus` enum value                        | None (Read-only)                                  |
| `isAuthenticated()`       | Returns `true` if status is `authenticated` with active token | None (Read-only)                                  |
| `setSession(user, token)` | Sets active user and access token in memory                   | `status -> 'authenticated'`, notifies listeners   |
| `setRestoring()`          | Indicates session restoration is in progress                  | `status -> 'restoring'`, notifies listeners       |
| `clearSession()`          | Clears user and access token                                  | `status -> 'unauthenticated'`, notifies listeners |
| `subscribe(callback)`     | Registers listener callback; returns unsubscribe function     | Subscribes callback to state changes              |

---

### 2.2 `ApiClient`

- **Location:** [`frontend/src/api/client.js`](file:///d:/Desktop/Travel-Web-/frontend/src/api/client.js)
- **Purpose:** HTTP client wrapper providing automatic token injection, transparent 401 error recovery, and session restoration.

#### Key Behaviors

1. **Bearer Token Injection:** Automatically attaches `Authorization: Bearer <accessToken>` to outgoing requests if a token exists in `authStore`.
2. **Cookie Inclusion:** Sets `credentials: 'include'` on all requests to ensure browser refresh cookies are delivered to authentication endpoints.
3. **Single-Flight Refresh Lock:** Implements a shared promise (`this.refreshPromise`) during token refresh. Concurrent requests encountering 401 wait on the same refresh operation, eliminating race conditions.
4. **Transparent 401 Recovery:**
   - When an API request receives `401 Unauthorized`, it attempts `refreshSession()`.
   - If refresh succeeds, the new token is stored, and the original request is retried once.
   - If refresh fails, `authStore.clearSession()` resets the client state to unauthenticated.
5. **Page Reload Session Restoration:** `restoreSession()` sends `POST /api/v1/auth/refresh` on application initialization. If the user has a valid refresh cookie, the in-memory session is re-established seamlessly.

---

### 2.3 `AuthModal` & `Navbar`

- **Location:** [`frontend/src/components/authModal.js`](file:///d:/Desktop/Travel-Web-/frontend/src/components/authModal.js), [`frontend/src/components/navbar.js`](file:///d:/Desktop/Travel-Web-/frontend/src/components/navbar.js)
- **Purpose:** Accessible user interface for user registration, login, and session controls.

#### Features

- **Dual Modal Tabs:** Switches between "Sign In" and "Create Account" views.
- **Inline Validation:** Validates email format, password complexity, and required fields before sending network requests.
- **Error Mapping:** Maps backend validation errors directly to field error labels.
- **Navbar Synchronization:** Subscribes to `authStore` changes to toggle between "Sign In" CTA and user profile greeting with "Sign Out" button.
- **Accessibility:** Supports keyboard navigation (`Escape` to close), focus trapping, and ARIA attributes.

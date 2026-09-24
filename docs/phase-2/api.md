# Phase 2 — Authentication API Specification

This document provides the complete technical specification for all REST API endpoints under `/api/v1/auth/`.

---

## 1. Global API Standards

### 1.1 Canonical Response Envelopes

All endpoints return JSON formatted according to the frozen Phase 0.4 API Architecture.

#### Success Envelope

```json
{
  "success": true,
  "data": {},
  "meta": {
    "timestamp": "2026-09-25T03:30:00.000Z",
    "requestId": "req-1a2b3c4d"
  }
}
```

#### Error Envelope

```json
{
  "success": false,
  "error": {
    "code": "AUTHENTICATION_FAILED",
    "message": "Invalid email or password.",
    "details": []
  },
  "meta": {
    "timestamp": "2026-09-25T03:30:00.000Z",
    "requestId": "req-1a2b3c4d"
  }
}
```

### 1.2 Rate Limiting Policies

| Endpoint                | Method | Maximum Requests | Window     | Error Code                  |
| ----------------------- | ------ | ---------------- | ---------- | --------------------------- |
| `/api/v1/auth/register` | `POST` | 10               | 15 minutes | `RATE_LIMIT_EXCEEDED` (429) |
| `/api/v1/auth/login`    | `POST` | 20               | 15 minutes | `RATE_LIMIT_EXCEEDED` (429) |
| `/api/v1/auth/refresh`  | `POST` | 60               | 15 minutes | `RATE_LIMIT_EXCEEDED` (429) |
| `/api/v1/auth/logout`   | `POST` | 60               | 15 minutes | `RATE_LIMIT_EXCEEDED` (429) |
| `/api/v1/auth/me`       | `GET`  | 100 (Global)     | 1 minute   | `RATE_LIMIT_EXCEEDED` (429) |

---

## 2. Endpoints

### 2.1 Customer Registration

`POST /api/v1/auth/register`

Registers a new customer account, issues initial authentication tokens, and sets the secure refresh cookie.

- **Authentication:** None (Public)
- **Rate Limit:** 10 requests / 15 minutes per IP

#### Request Body

```json
{
  "email": "customer@example.com",
  "password": "Password123!",
  "fullName": "Jane Doe",
  "mobileContact": "+919876543210"
}
```

#### Field Validation Rules (`registerSchema`)

- `email`: Required, valid email string, normalized to lowercase, trimmed, max 255 chars.
- `password`: Required, min 8 chars, max 128 chars, must contain at least 1 uppercase letter, 1 lowercase letter, and 1 number.
- `fullName`: Required string, trimmed, min 2 chars, max 255 chars.
- `mobileContact`: Optional string, trimmed, max 30 chars.

#### Success Response (`201 Created`)

- **Headers:** `Set-Cookie: refreshToken=<opaque_token>; Path=/api/v1/auth; HttpOnly; SameSite=Strict; Max-Age=604800`

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "email": "customer@example.com",
      "fullName": "Jane Doe",
      "mobileContact": "+919876543210",
      "role": "CUSTOMER",
      "isActive": true,
      "createdAt": "2026-09-25T03:30:00.000Z",
      "lastLoginAt": null
    },
    "accessToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
  },
  "meta": {
    "timestamp": "2026-09-25T03:30:00.000Z",
    "requestId": "req-01"
  }
}
```

#### Error Responses

- `400 Bad Request` (`VALIDATION_ERROR`): Malformed schema or invalid password complexity.
- `409 Conflict` (`CONFLICT`): An account with this email address already exists.
- `429 Too Many Requests` (`RATE_LIMIT_EXCEEDED`): Registration rate limit exceeded.

---

### 2.2 User Login

`POST /api/v1/auth/login`

Authenticates a user by email and password, updates `last_login_at`, and returns tokens.

- **Authentication:** None (Public)
- **Rate Limit:** 20 requests / 15 minutes per IP

#### Request Body

```json
{
  "email": "customer@example.com",
  "password": "Password123!"
}
```

#### Field Validation Rules (`loginSchema`)

- `email`: Required, valid email string, trimmed, normalized to lowercase.
- `password`: Required string, min 1 char.

#### Success Response (`200 OK`)

- **Headers:** `Set-Cookie: refreshToken=<opaque_token>; Path=/api/v1/auth; HttpOnly; SameSite=Strict; Max-Age=604800`

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "email": "customer@example.com",
      "fullName": "Jane Doe",
      "mobileContact": "+919876543210",
      "role": "CUSTOMER",
      "isActive": true,
      "createdAt": "2026-09-25T03:30:00.000Z",
      "lastLoginAt": "2026-09-25T03:30:00.000Z"
    },
    "accessToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
  },
  "meta": {
    "timestamp": "2026-09-25T03:30:00.000Z",
    "requestId": "req-02"
  }
}
```

#### Error Responses

- `400 Bad Request` (`VALIDATION_ERROR`): Missing email or password.
- `401 Unauthorized` (`AUTHENTICATION_FAILED`): Invalid email or password (constant-time response).
- `403 Forbidden` (`ACCESS_FORBIDDEN`): User account is deactivated.
- `429 Too Many Requests` (`RATE_LIMIT_EXCEEDED`): Login rate limit exceeded.

---

### 2.3 Token Refresh & Session Rotation

`POST /api/v1/auth/refresh`

Rotates the refresh token read from the `refreshToken` HttpOnly cookie and issues a fresh RS256 access token.

- **Authentication:** Refresh Token Cookie
- **Rate Limit:** 60 requests / 15 minutes per IP

#### Request Headers / Cookies

- **Cookie:** `refreshToken=<256-bit opaque hex string>`

#### Success Response (`200 OK`)

- **Headers:** `Set-Cookie: refreshToken=<new_opaque_token>; Path=/api/v1/auth; HttpOnly; SameSite=Strict; Max-Age=604800`

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "email": "customer@example.com",
      "fullName": "Jane Doe",
      "mobileContact": "+919876543210",
      "role": "CUSTOMER",
      "isActive": true,
      "createdAt": "2026-09-25T03:30:00.000Z",
      "lastLoginAt": "2026-09-25T03:30:00.000Z"
    },
    "accessToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
  },
  "meta": {
    "timestamp": "2026-09-25T03:30:00.000Z",
    "requestId": "req-03"
  }
}
```

#### Error Responses

- `401 Unauthorized` (`AUTHENTICATION_FAILED`): Refresh token cookie is missing, empty, expired, or previously revoked (replay).
- `429 Too Many Requests` (`RATE_LIMIT_EXCEEDED`): Refresh rate limit exceeded.

---

### 2.4 User Logout

`POST /api/v1/auth/logout`

Revokes the refresh token record in PostgreSQL and clears the browser cookie.

- **Authentication:** Optional Refresh Cookie (Safe & Idempotent)
- **Rate Limit:** 60 requests / 15 minutes per IP

#### Request Headers / Cookies

- **Cookie:** `refreshToken=<opaque_token>`

#### Success Response (`200 OK`)

- **Headers:** `Set-Cookie: refreshToken=; Path=/api/v1/auth; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Strict`

```json
{
  "success": true,
  "data": {
    "message": "Logged out successfully"
  },
  "meta": {
    "timestamp": "2026-09-25T03:30:00.000Z",
    "requestId": "req-04"
  }
}
```

---

### 2.5 Current User Profile

`GET /api/v1/auth/me`

Returns current user profile data for the authenticated Bearer token.

- **Authentication:** Required (`Authorization: Bearer <accessToken>`)
- **Rate Limit:** Standard global API rate limit

#### Request Headers

- `Authorization: Bearer <RS256 JWT>`

#### Success Response (`200 OK`)

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "email": "customer@example.com",
      "fullName": "Jane Doe",
      "mobileContact": "+919876543210",
      "role": "CUSTOMER",
      "isActive": true,
      "createdAt": "2026-09-25T03:30:00.000Z",
      "lastLoginAt": "2026-09-25T03:30:00.000Z"
    }
  },
  "meta": {
    "timestamp": "2026-09-25T03:30:00.000Z",
    "requestId": "req-05"
  }
}
```

#### Error Responses

- `401 Unauthorized` (`UNAUTHORIZED` / `AUTHENTICATION_FAILED`): Missing Bearer header, malformed token, invalid signature, expired token, or deactivated user.

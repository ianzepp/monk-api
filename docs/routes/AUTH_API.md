# Auth API Routes

The Authentication API provides user login, token refresh, and user information endpoints.

## Base Path
All Auth API routes are prefixed with `/auth`

## Content Type
- **Request**: `application/json`
- **Response**: `application/json`

## Authentication
Auth API routes do not require authentication, except for `GET /auth/me` which requires a valid JWT token.

---

## POST /auth/login

Authenticate a user and receive JWT tokens for API access.

### Request Body
```json
{
  "tenant": "string",     // Required: Tenant identifier
  "username": "string"    // Required: Username for authentication
}
```

### Success Response (200)
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "username": "john.doe",
      "tenant": "my-company",
      "access_level": "user"
    },
    "expires_in": 3600
  }
}
```

### Error Responses

| Status | Error Code | Message | Condition |
|--------|------------|---------|-----------|
| 400 | `TENANT_MISSING` | "Tenant is required" | Missing tenant field |
| 400 | `USERNAME_MISSING` | "Username is required" | Missing username field |
| 401 | `AUTH_FAILED` | "Authentication failed" | Invalid credentials |

---

## POST /auth/refresh

Refresh an expired JWT token using a valid refresh token.

### Request Body
```json
{
  "token": "string"    // Required: Valid refresh token
}
```

### Success Response (200)
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expires_in": 3600
  }
}
```

### Error Responses

| Status | Error Code | Message | Condition |
|--------|------------|---------|-----------|
| 400 | `TOKEN_MISSING` | "Token is required for refresh" | Missing token field |
| 401 | `TOKEN_REFRESH_FAILED` | "Token refresh failed" | Invalid refresh token |

---

## GET /auth/me

Get current authenticated user information.

### Authentication Required
- **Header**: `Authorization: Bearer <jwt_token>`

### Request Body
None - GET request with no body.

### Success Response (200)
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "username": "john.doe",
      "tenant": "my-company",
      "access_level": "user",
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:30:00Z"
    },
    "token_info": {
      "issued_at": 1642248600,
      "expires_at": 1642252200,
      "remaining_seconds": 3600
    }
  }
}
```

### Error Responses

| Status | Error Code | Message | Condition |
|--------|------------|---------|-----------|
| 401 | `TOKEN_INVALID` | "Invalid or expired token" | Missing or invalid Authorization header |

---

## Error Response Format

All error responses follow the standardized format documented in [ERRORS.md](./ERRORS.md). In development mode, additional debugging information is included in the `data` field.

## Usage Examples

### Typical Authentication Flow

1. **Login**: POST `/auth/login` with tenant and username
2. **Store tokens**: Save both access token and refresh token
3. **API calls**: Use access token in Authorization header
4. **Token refresh**: When access token expires, use refresh token
5. **User info**: GET `/auth/me` to verify current user state

### Error Handling

```javascript
try {
  const response = await fetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenant: 'acme', username: 'john.doe' })
  });
  
  const result = await response.json();
  
  if (!result.success) {
    switch (result.error_code) {
      case 'TENANT_MISSING':
      case 'USERNAME_MISSING':
        // Handle validation errors
        break;
      case 'AUTH_FAILED':
        // Handle authentication failure
        break;
      default:
        // Handle unexpected errors
        break;
    }
  }
} catch (error) {
  // Handle network or parsing errors
}
```
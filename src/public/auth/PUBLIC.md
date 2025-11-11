# Public Authentication API

Public authentication endpoints for token acquisition and account management. These routes do not require authentication and are used to obtain JWT tokens for accessing protected APIs.

## Base Path
All public authentication routes are prefixed with `/auth`

## Endpoint Summary

| Method | Path | Description |
|--------|------|-------------|
| POST | [`/auth/login`](#post-authlogin) | Authenticate against an existing tenant and issue a JWT token. |
| POST | [`/auth/refresh`](#post-authrefresh) | Exchange an existing token for a fresh one with the same scope. |
| POST | [`/auth/register`](#post-authregister) | Provision a new tenant from the default template and return an initial token. |

## Content Type
- **Request**: `application/json`
- **Response**: `application/json`

## Authentication
Public auth routes do not require authentication - they are used to obtain tokens for accessing protected APIs.

---

## POST /auth/login

Authenticate a user against an existing tenant and receive a fresh JWT token scoped to that tenant. The login route validates the credentials, resolves tenant routing metadata, and issues the token that enables access to protected `/api/*` routes.

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
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "username": "john.doe",
      "tenant": "my-company",
      "database": "tenant_a1b2c3d4",
      "access": "full"
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

Exchange an existing JWT token (even if expired) for a new token while preserving the original tenant, user, and access scope. The refresh route validates signature integrity, re-hydrates the user context, and re-issues a token with a new expiration window.

### Request Body
```json
{
  "token": "string"    // Required: Current JWT token (may be expired)
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
| 401 | `TOKEN_REFRESH_FAILED` | "Token refresh failed" | Invalid or corrupted token |

---

## POST /auth/register

Create an empty tenant (cloned from the default template) and bootstrap a full-access user. A JWT token for the new user is returned so the caller can immediately interact with protected APIs.

### Request Body
```json
{
  "tenant": "string",     // Required: Tenant identifier
  "username": "string"    // Required: Desired username
}
```

### Success Response (200)
```json
{
  "success": true,
  "data": {
    "tenant": "string",     // Tenant name that was provisioned
    "database": "string",   // Backing database the tenant maps to
    "username": "string",   // Auth identifier for the newly created user
    "token": "string",      // JWT token for immediate access
    "expires_in": 86400     // Token lifetime in seconds (24h)
  }
}
```

### Error Responses

| Status | Error Code | Message | Condition |
|--------|------------|---------|-----------|
| 400 | `TENANT_MISSING` | "Tenant is required" | Missing tenant field |
| 400 | `USERNAME_MISSING` | "Username is required" | Missing username field |
| 404 | `TEMPLATE_NOT_FOUND` | "Template 'empty' not found" | Default template missing |
| 409 | `TENANT_EXISTS` | "Tenant '<name>' already exists" | Tenant name already registered |
| 500 | `TEMPLATE_CLONE_FAILED` | "Failed to clone template database: ..." | Template cloning failed |

---

## Token Usage

Once you have obtained a JWT token from the login endpoint, use it to access protected APIs:

### Making Authenticated Requests
```bash
# Use the token in Authorization header for all /api/* endpoints
curl -X GET http://localhost:9001/api/data/users \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Access user account management
curl -X GET http://localhost:9001/api/auth/whoami \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Token Lifecycle
1. **Login**: Get initial JWT token with tenant and username
2. **Use token**: Access protected APIs with Bearer token in Authorization header
3. **Refresh**: When token nears expiration, use refresh endpoint
4. **Logout**: Tokens are stateless - simply discard client-side

## Integration Examples

### JavaScript Client Integration
```javascript
// 1. Login and store token
const loginResponse = await fetch('/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ tenant: 'acme', username: 'john.doe' })
});

const { token } = (await loginResponse.json()).data;
localStorage.setItem('access_token', token);

// 2. Use token for API calls
const apiResponse = await fetch('/api/data/users', {
  headers: { 'Authorization': `Bearer ${token}` }
});

// 3. Handle token refresh
if (apiResponse.status === 401) {
  const refreshResponse = await fetch('/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token })
  });

  if (refreshResponse.ok) {
    const { token: newToken } = (await refreshResponse.json()).data;
    localStorage.setItem('access_token', newToken);
    // Retry original request with new token
  }
}
```

## Error Response Format

All error responses follow the standardized format documented in the main error handling specification. For detailed error handling patterns, see the protected Auth API documentation at `/docs/auth`.

## Next Steps

After obtaining a JWT token:

1. **Explore APIs**: Use `/docs/data`, `/docs/file`, `/docs/describe` for API references
2. **User management**: Access `/docs/auth` for account management operations
3. **Administrative tasks**: See `/docs/root` for elevated privilege operations

The public authentication endpoints provide the foundation for accessing all protected APIs in the Monk platform.

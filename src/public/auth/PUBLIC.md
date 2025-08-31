# Public Authentication API

Public authentication endpoints for token acquisition and account management. These routes do not require authentication and are used to obtain JWT tokens for accessing protected APIs.

## Base Path
All public authentication routes are prefixed with `/auth`

## Content Type
- **Request**: `application/json`
- **Response**: `application/json`

## Authentication
Public auth routes do not require authentication - they are used to obtain tokens for accessing protected APIs.

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
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "username": "john.doe",
      "tenant": "my-company",
      "database": "tenant_a1b2c3d4",
      "access": "admin"
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

Refresh an expired JWT token using the existing token.

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

Register a new user account (placeholder implementation).

### Request Body
```json
{
  "tenant": "string",     // Required: Tenant identifier
  "username": "string"    // Required: Desired username
}
```

### Error Responses

| Status | Error Code | Message | Condition |
|--------|------------|---------|-----------|
| 400 | `TENANT_MISSING` | "Tenant is required" | Missing tenant field |
| 400 | `USERNAME_MISSING` | "Username is required" | Missing username field |
| 403 | `UNIMPLEMENTED` | "Tenant self-registration is not yet implemented" | Feature not available |

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

1. **Explore APIs**: Use `/docs/data`, `/docs/file`, `/docs/meta` for API references
2. **User management**: Access `/docs/auth` for account management operations  
3. **Administrative tasks**: See `/docs/root` for elevated privilege operations

The public authentication endpoints provide the foundation for accessing all protected APIs in the Monk platform.
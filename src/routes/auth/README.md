# 30-Auth API Documentation

> **Public Authentication Interface**
>
> The Auth API provides public authentication endpoints for token acquisition and account creation. All endpoints are public (no JWT required). User identity and privilege management have moved to the User API (/api/user).

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Response Formats](#response-formats)
4. [Core Endpoints](#core-endpoints)
5. [User Information](#user-information)
6. [Privilege Escalation](#privilege-escalation)
7. [Security Model](#security-model)
8. [Error Handling](#error-handling)
9. [Testing](#testing)
10. [Common Use Cases](#common-use-cases)

## Overview

The Auth API provides public authentication services for the Monk platform. All endpoints are accessible without JWT tokens and handle initial user authentication and account creation.

### Key Capabilities
- **User Authentication**: Secure login and session management
- **Token Management**: Issue and refresh JWT tokens
- **Account Registration**: Create new tenant accounts
- **Tenant Discovery**: List available tenants (personal mode only)
- **Template Management**: List available account templates
- **Multi-tenant Support**: Tenant-isolated authentication with database routing

### Public Endpoints (No JWT Required)
```
POST /auth/login          # User login - obtain JWT token
POST /auth/register       # Create new tenant account
POST /auth/refresh        # Token refresh - exchange old for new token
GET  /auth/tenants        # List available tenants (personal mode)
GET  /auth/templates      # List available templates (personal mode)
POST /auth/fake           # Impersonate user (requires validation in handler)
```

### Related Protected Endpoints (JWT Required)
User identity and privilege management have moved to the User API:
```
GET  /api/user/whoami     # Get current user information
POST /api/user/sudo       # Escalate to sudo privileges
```

## Authentication

**All Auth API endpoints are public** - no JWT token required. These endpoints issue JWT tokens that are then used to access protected APIs under `/api/*`.

### Token Types Issued
- **User JWT**: Standard user authentication (24 hour expiration)
- **Sudo JWT**: Elevated privileges (15 minute expiration, obtained via `/api/user/sudo`)
- **Refresh JWT**: Long-lived token for renewal (30 day expiration)

## Response Formats

The Auth API supports multiple response formats for optimal integration with different clients, particularly LLM agents that benefit from token-efficient formats.

### Format Selection

The API determines response format using the following priority hierarchy:

1. **Query Parameter** (highest priority): `?format=json`, `?format=toon`, or `?format=yaml`
2. **Accept Header**: `Accept: application/json`, `Accept: application/toon`, or `Accept: application/yaml`
3. **JWT Preference**: `format` field in JWT payload (set at login)
4. **Default**: JSON format

### Supported Formats

#### JSON (Default)
Standard JSON format - compact, widely supported, ideal for web applications.

```bash
GET /api/user/whoami?format=json
Authorization: Bearer <token>
```

Response:
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Dr Root",
    "access": "root",
    "tenant": "my-tenant"
  }
}
```

#### TOON (Token-Oriented Object Notation)
Ultra-compact format optimized for LLM token efficiency - reduces token usage by 30-60% for array-heavy responses.

```bash
GET /api/user/whoami?format=toon
Authorization: Bearer <token>
```

Response:
```toon
success: true
data:
  id: 550e8400-e29b-41d4-a716-446655440000
  name: Dr Root
  access: root
  tenant: my-tenant
```

#### YAML (Yet Another Markup Language)
Human-readable format ideal for configuration, DevOps tools, and documentation - more readable than JSON for nested structures.

```bash
GET /api/user/whoami?format=yaml
Authorization: Bearer <token>
```

Response:
```yaml
success: true
data:
  id: 550e8400-e29b-41d4-a716-446655440000
  name: Dr Root
  access: root
  tenant: my-tenant
```

### Setting Format Preference in JWT

You can set a persistent format preference at login time by including a `format` field in your login request. This preference is embedded in your JWT token and automatically applied to all API requests.

**Login with Format Preference:**
```bash
POST /auth/login
Content-Type: application/json

{
  "tenant": "my-tenant",
  "username": "root",
  "format": "toon"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "username": "Dr Root",
      "tenant": "my-tenant",
      "access": "root",
      "format": "toon"
    }
  }
}
```

Now all subsequent API requests automatically use TOON format unless overridden:

```bash
# Uses TOON automatically (from JWT preference)
GET /api/user/whoami
Authorization: Bearer <token_with_toon_preference>

# Override to YAML for configuration export
GET /api/describe/users?format=yaml
Authorization: Bearer <token_with_toon_preference>
```

### Format Use Cases

**JSON Format:**
- Web applications and dashboards
- Mobile apps
- Standard REST API clients
- Debugging and development

**TOON Format:**
- LLM agents and AI assistants
- Token-constrained environments
- Large array responses (e.g., schema lists, user lists)
- Cost-sensitive LLM API usage

**YAML Format:**
- DevOps tools and configuration management
- Schema export for infrastructure-as-code
- Human-readable API documentation
- Developer debugging of complex nested objects

### Content-Type Headers

Responses include appropriate Content-Type headers:
- JSON: `Content-Type: application/json`
- TOON: `Content-Type: text/plain; charset=utf-8`
- YAML: `Content-Type: application/yaml; charset=utf-8`

## Core Endpoints

The Auth API provides public authentication endpoints. For user identity and privilege management, see the [User API Documentation](../user/README.md).

### User Identity and Privilege Management

The following endpoints have moved to the User API (`/api/user`):

- **GET /api/user/whoami** - Get current authenticated user information
- **POST /api/user/sudo** - Elevate privileges for protected operations

For detailed documentation on these endpoints, please refer to:
**[User API Documentation](../user/README.md)**

## Security Model

### Public Access
All Auth API endpoints are public and require no authentication. They handle:
- Initial user authentication
- JWT token issuance
- Account registration
- Tenant discovery (personal mode)

### Token Management Strategy
```javascript
// Store tokens issued by auth endpoints:
localStorage.setItem('user_token', userJwt);        // Long-lived (24 hours)
localStorage.setItem('refresh_token', refreshJwt); // Very long-lived (30 days)

// Use user token for protected API operations:
const headers = {
  'Authorization': `Bearer ${userToken}`,
  'Content-Type': 'application/json'
};

// Refresh when needed:
if (tokenExpired) {
  const response = await fetch('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ token: userToken })
  });
  const { token: newToken } = response.data;
  localStorage.setItem('user_token', newToken);
}
```

### Best Practices
1. **Secure token storage**: Use httpOnly cookies or secure localStorage
2. **Handle expiration**: Implement token refresh flow before expiration
3. **Validate on use**: Always handle 401 responses gracefully
4. **Logout properly**: Clear tokens on logout

## Error Handling

All error responses respect the format preference (JSON or TOON) set in the request. Error structure remains consistent across both formats.

### Common Error Responses

#### Invalid Credentials
```json
{
  "success": false,
  "error": {
    "type": "AuthenticationError",
    "message": "Authentication failed",
    "code": "AUTH_FAILED"
  }
}
```

#### Missing Required Fields
```json
{
  "success": false,
  "error": {
    "type": "ValidationError",
    "message": "Tenant is required",
    "code": "TENANT_MISSING"
  }
}
```

#### Token Refresh Failed
```json
{
  "success": false,
  "error": {
    "type": "AuthenticationError",
    "message": "Token refresh failed",
    "code": "TOKEN_REFRESH_FAILED"
  }
}
```

#### Tenant Already Exists
```json
{
  "success": false,
  "error": {
    "type": "ConflictError",
    "message": "Tenant 'example' already exists",
    "code": "TENANT_EXISTS"
  }
}
```

## Testing

For comprehensive testing information and test coverage details, please refer to the test suite documentation:

**[spec/30-auth-api/README.md](../spec/30-auth-api/README.md)**

This includes test scope, focus areas, and testing strategies for public authentication endpoints, including:
- Login and token acquisition
- Account registration
- Token refresh flows
- Tenant discovery (personal mode)
- Authentication error handling

## Common Use Cases

### Initial Authentication
```bash
# Login to get JWT token
curl -X POST http://localhost:9001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"tenant": "my-company", "username": "john.doe"}'

# Response includes JWT token for protected API access
```

### Account Registration
```bash
# Create new tenant account (personal mode)
curl -X POST http://localhost:9001/auth/register \
  -H "Content-Type: application/json" \
  -d '{"tenant": "my-app", "description": "My application"}'

# Response includes JWT token for immediate access
```

### Token Refresh
```bash
# Refresh expired or near-expiration token
curl -X POST http://localhost:9001/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"token": "CURRENT_JWT_TOKEN"}'

# Response includes new JWT token with fresh expiration
```

### Token Management in Applications
```javascript
// 1. Login and store token
const loginResponse = await fetch('/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ tenant: 'my-company', username: 'john.doe' })
});
const { token } = (await loginResponse.json()).data;
localStorage.setItem('access_token', token);

// 2. Use token for protected API calls
const apiResponse = await fetch('/api/data/users', {
  headers: { 'Authorization': `Bearer ${token}` }
});

// 3. Handle token refresh when needed
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

### Tenant Discovery (Personal Mode)
```bash
# List available tenants
curl -X GET http://localhost:9001/auth/tenants

# Response includes all tenants with their users
```

---

**Next: [31-Describe API Documentation](31-describe-api.md)** - Schema management and metadata operations

**Previous: [API Documentation Overview](API.md)** - Complete API reference

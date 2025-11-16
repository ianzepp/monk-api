# Auth API

The Auth API covers both **public token acquisition routes** and **protected user management routes**. Public endpoints issue JWT tokens to unauthenticated callers, while protected endpoints operate on authenticated users and handle privilege escalation.

## Base Paths
- **Public routes**: `/auth/*` (no authentication required)
- **Protected routes**: `/api/auth/*` (JWT required)

## Endpoint Summary

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| POST | [`/auth/login`](#post-authlogin) | Public | Authenticate against an existing tenant and issue a JWT token. |
| POST | [`/auth/refresh`](#post-authrefresh) | Public | Exchange an existing token for a fresh one with the same scope. |
| POST | [`/auth/register`](#post-authregister) | Public | Provision a new tenant from the default template and return an initial token. |
| GET | [`/auth/tenants`](#get-authtenants) | Public | List available tenants (personal mode only). |
| GET | [`/api/auth/whoami`](#get-apiauthwhoami) | Protected | Return canonical identity, tenant routing data, and ACL arrays for the caller. |
| POST | [`/api/auth/sudo`](#post-apiauthsudo) | Protected | Get short-lived sudo token for dangerous operations (user management). |

## Content Type
- **Request**: `application/json`
- **Response**: `application/json`

---

## Public Authentication Routes (No JWT Required)

Public routes issue tokens and can be called without prior authentication. They form the first step in every workflow before accessing protected APIs.

### POST /auth/login

Authenticate a user against an existing tenant and receive a fresh JWT token scoped to that tenant. The login route validates the credentials, resolves tenant routing metadata, and issues the token that enables access to protected `/api/*` routes.

#### Request Body
```json
{
  "tenant": "string",     // Required: Tenant identifier
  "username": "string"    // Required: Username for authentication
}
```

#### Success Response (200)
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

#### Error Responses

| Status | Error Code | Message | Condition |
|--------|------------|---------|-----------|
| 400 | `TENANT_MISSING` | "Tenant is required" | Missing tenant field |
| 400 | `USERNAME_MISSING` | "Username is required" | Missing username field |
| 401 | `AUTH_FAILED` | "Authentication failed" | Invalid credentials |

---

### POST /auth/refresh

Exchange an existing JWT token (even if expired) for a new token while preserving the original tenant, user, and access scope. The refresh route validates signature integrity, re-hydrates the user context, and re-issues a token with a new expiration window.

#### Request Body
```json
{
  "token": "string"    // Required: Current JWT token (may be expired)
}
```

#### Success Response (200)
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expires_in": 3600
  }
}
```

#### Error Responses

| Status | Error Code | Message | Condition |
|--------|------------|---------|-----------|
| 400 | `TOKEN_MISSING` | "Token is required for refresh" | Missing token field |
| 401 | `TOKEN_REFRESH_FAILED` | "Token refresh failed" | Invalid or corrupted token |

---

### POST /auth/register

Create an empty tenant (cloned from the default template) and bootstrap a full-access user. A JWT token for the new user is returned so the caller can immediately interact with protected APIs.

**Note**: The API server administrator controls the database naming mode via the `TENANT_NAMING_MODE` environment variable. This is not client-configurable for security reasons.

#### Request Body
```json
{
  "tenant": "string",        // Required: Tenant identifier
  "username": "string",      // Optional: Desired username
                             //           Required when server is in enterprise mode
                             //           Defaults to 'root' when server is in personal mode
  "database": "string",      // Optional: Custom database name (only when server is in personal mode)
                             //           Defaults to sanitized tenant name if not provided
  "description": "string"    // Optional: Human-readable description of the tenant
}
```

#### Server Naming Modes

The server administrator configures the database naming strategy via the `TENANT_NAMING_MODE` environment variable:

**Enterprise Mode (Default - `TENANT_NAMING_MODE=enterprise`)**
- Database names are SHA256 hashes (e.g., "tenant_a1b2c3d4e5f6789a")
- Prevents collisions, opaque naming
- Any Unicode characters allowed in tenant name
- Most secure for multi-tenant SaaS deployments
- `username` parameter is **required**

**Personal Mode (`TENANT_NAMING_MODE=personal`)**
- Database names are human-readable (e.g., "monk-irc" → "tenant_monk_irc")
- Useful for personal PaaS deployments where you control all tenants
- `username` parameter is **optional** (defaults to `'root'`)
- `database` parameter is **optional** (defaults to sanitized `tenant` name)
- Stricter tenant name validation (alphanumeric, hyphens, underscores, spaces only)

#### Example Usage

**Enterprise Mode Server:**
```bash
POST /auth/register
{
  "tenant": "acme-corp",
  "username": "full"
}
# Results: database = "tenant_a1b2c3d4e5f6789a" (hash)
```

**Personal Mode Server (minimal):**
```bash
POST /auth/register
{
  "tenant": "monk-irc"
}
# Results: username = "root", database = "tenant_monk_irc"
```

**Personal Mode Server (with description):**
```bash
POST /auth/register
{
  "tenant": "monk-irc",
  "description": "IRC bridge for Slack integration"
}
# Results: username = "root", database = "tenant_monk_irc"
```

**Personal Mode Server (custom database):**
```bash
POST /auth/register
{
  "tenant": "monk-irc",
  "username": "full",
  "database": "my-irc-bridge",
  "description": "IRC bridge for Slack integration"
}
# Results: username = "full", database = "tenant_my_irc_bridge"
```

#### Success Response (200)
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

#### Error Responses

| Status | Error Code | Message | Condition |
|--------|------------|---------|-----------|
| 400 | `TENANT_MISSING` | "Tenant is required" | Missing tenant field |
| 400 | `USERNAME_MISSING` | "Username is required" | Missing username when server is in enterprise mode |
| 400 | `DATABASE_NOT_ALLOWED` | "database parameter can only be specified when server is in personal mode" | database provided when server is in enterprise mode |
| 404 | `TEMPLATE_NOT_FOUND` | "Template 'empty' not found" | Default template missing |
| 409 | `TENANT_EXISTS` | "Tenant '<name>' already exists" | Tenant name already registered |
| 409 | `DATABASE_EXISTS` | "Database '<name>' already exists" | Database name collision (personal mode) |
| 500 | `TEMPLATE_CLONE_FAILED` | "Failed to clone template database: ..." | Template cloning failed |

---

### GET /auth/tenants

List all available tenants (personal mode only). This endpoint provides tenant discovery for personal PaaS deployments where a single administrator manages multiple tenants.

**Security Note**: This endpoint is only available when the server is running in `TENANT_NAMING_MODE=personal`. In enterprise mode, it returns a 403 error to prevent tenant enumeration in multi-tenant SaaS environments.

#### Request Body
None - GET request with no body.

#### Success Response (200)
```json
{
  "success": true,
  "data": [
    {
      "name": "monk-irc",
      "description": "IRC bridge for Slack integration",
      "users": ["root", "full"]
    },
    {
      "name": "my-app",
      "description": null,
      "users": ["root"]
    },
    {
      "name": "test-tenant",
      "description": "Testing environment",
      "users": ["root", "testuser"]
    }
  ]
}
```

#### Response Fields
- **name** (string): The tenant identifier used for login
- **description** (string|null): Optional human-readable description
- **users** (string[]): Array of available usernames for login (sorted alphabetically)

#### Filtering
The endpoint automatically filters:
- Only returns active tenants (`is_active = true`)
- Excludes template tenants (`tenant_type = 'normal'`)
- Excludes soft-deleted tenants (`trashed_at IS NULL`)
- Excludes hard-deleted tenants (`deleted_at IS NULL`)
- Tenants sorted alphabetically by name
- Users array: Limited to 10 users per tenant, sorted by creation date (oldest first)
- Users array includes only active, non-deleted users

#### Error Responses

| Status | Error Code | Message | Condition |
|--------|------------|---------|-----------|
| 403 | `TENANT_LIST_NOT_AVAILABLE` | "Tenant listing is only available in personal mode" | Server is in enterprise mode |

#### Example Usage

```bash
# List all tenants (personal mode server)
curl -X GET http://localhost:9001/auth/tenants

# Use with jq to extract tenant names
curl -X GET http://localhost:9001/auth/tenants | jq -r '.data[].name'
```

#### Use Cases
- **Tenant discovery**: List available tenants before login
- **Admin tools**: Build management interfaces for personal PaaS
- **CLI integration**: Provide autocomplete for tenant selection
- **Documentation**: Generate tenant inventory

---

## Token Usage

Once you have obtained a JWT token from a public endpoint, use it to access protected APIs:

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

---

## Protected Authentication Routes (JWT Required)

Protected routes operate on authenticated users. They require a valid Bearer token obtained from the public routes above.

### GET /api/auth/whoami

Return the fully hydrated user identity for the active JWT, including tenant metadata, ACL lists, and record status flags. Clients typically call this at startup to confirm the token is valid, discover the backing database, and personalize UI according to the access arrays.

#### Request Body
None - GET request with no body.

#### Success Response (200)
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "username": "john.doe",
    "tenant": "my-company",
    "database": "tenant_a1b2c3d4",
    "access": "full",
    "access_read": ["uuid1", "uuid2"],
    "access_edit": ["uuid3"],
    "access_full": ["uuid4"],
    "is_active": true
  }
}
```

#### Error Responses

| Status | Error Code | Message | Condition |
|--------|------------|---------|-----------|
| 401 | `TOKEN_MISSING` | "Authorization header required" | No Bearer token provided |
| 401 | `TOKEN_INVALID` | "Invalid or expired token" | Bad JWT signature or expired |
| 401 | `USER_NOT_FOUND` | "User not found or inactive" | User doesn't exist in tenant DB |

---

### POST /api/auth/sudo

Perform just-in-time privilege escalation for administrators who need to call `/api/sudo/*` endpoints (user management). The endpoint verifies the caller's base access level, logs the provided reason for audit tracking, and issues a 15-minute sudo token tied to the originating user.

#### Request Body
```json
{
  "reason": "string"    // Optional: Reason for privilege escalation (for audit trail)
}
```

#### Success Response (200)
```json
{
  "success": true,
  "data": {
    "root_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expires_in": 900,
    "token_type": "Bearer",
    "access_level": "root",
    "warning": "Root token expires in 15 minutes",
    "elevated_from": "root",
    "reason": "User management operation"
  }
}
```

#### Error Responses

| Status | Error Code | Message | Condition |
|--------|------------|---------|-----------|
| 401 | `USER_JWT_REQUIRED` | "Valid user JWT required for privilege escalation" | No valid user JWT |
| 403 | `SUDO_ACCESS_DENIED` | "Insufficient privileges for sudo - root access required" | User lacks root access |

---

## Sudo Access Model

### Access Level Requirements
- **sudo endpoint**: Requires `access='root'` base level
- **Sudo operations**: Short-lived sudo token required for `/api/sudo/*` endpoints
- **Time limits**: Sudo tokens expire after 15 minutes for security
- **Tenant-scoped**: All sudo operations are within the user's own tenant

### Access Levels
- `deny` - No access
- `read` - Read-only data access
- `edit` - Can modify data
- `full` - Can modify data and manage ACLs on records
- `root` - Can request sudo tokens for dangerous operations (user management)

### Token Management Strategy
```javascript
// Client should maintain separate tokens:
localStorage.setItem('user_token', rootJwt);       // Long-lived root JWT (1 hour)
sessionStorage.setItem('sudo_token', sudoJwt);     // Short-lived sudo token (15 minutes)

// Use appropriate token for different operations:
const userHeaders = { 'Authorization': `Bearer ${userToken}` };    // Normal operations
const sudoHeaders = { 'Authorization': `Bearer ${sudoToken}` };    // User management
```

### Sudo Workflow Example
```bash
# 1. Normal operations with root JWT
curl -X GET http://localhost:9001/api/data/accounts \
  -H "Authorization: Bearer ROOT_JWT_TOKEN"

# 2. Request sudo token for user management
curl -X POST http://localhost:9001/api/auth/sudo \
  -H "Authorization: Bearer ROOT_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Creating new team member account"}'

# 3. Use sudo JWT for user management
curl -X POST http://localhost:9001/api/sudo/users \
  -H "Authorization: Bearer SUDO_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "John Doe", "auth": "john@example.com", "access": "full"}'
```

## Security Model

### Privilege Escalation Security
- **Explicit escalation**: Must actively request root privileges
- **Time-limited**: Root tokens automatically expire after 15 minutes
- **Audit logging**: All sudo requests logged with reason and user context
- **Base requirements**: Only admin/root users can escalate privileges

### Best Practices
1. **Request sudo only when needed**: Don't preemptively escalate
2. **Provide clear reasons**: Include meaningful audit trail information
3. **Handle expiration**: Root tokens expire quickly - be prepared to re-escalate
4. **Separate storage**: Keep user and root tokens in different storage mechanisms

## Error Response Format

All error responses follow the standardized format documented in the main error handling specification.

## Related Documentation

- **Data Operations**: `/docs/data` - Working with schema-backed data
- **Describe Operations**: `/docs/describe` - Managing JSON Schemas
- **Sudo Operations**: `/docs/sudo` - User management requiring sudo tokens

The Auth API provides both the public token issuance flows and the protected account management capabilities required to access every other part of the Monk platform.

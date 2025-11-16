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
| POST | [`/api/auth/fake`](#post-apiauthfake) | Protected (Root) | Impersonate another user for debugging and support (root only). |

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

Request a short-lived sudo token for protected operations requiring elevated privileges. Both root and full users can request sudo tokens, with root users receiving automatic sudo access at login as a convenience.

**Access Model** (Linux-inspired):
- **`access='root'`**: Automatically has `is_sudo=true` at login (like Linux root user)
  - Can still call this endpoint to generate time-limited sudo token with audit trail
- **`access='full'`**: Must call this endpoint to get `is_sudo=true` (like Linux sudoers)
  - Generates 15-minute sudo token for protected operations
- **`access='edit'|'read'|'deny'`**: Cannot request sudo tokens (403 error)

#### Request Body
```json
{
  "reason": "string"    // Optional: Reason for sudo elevation (for audit trail)
}
```

#### Success Response (200)
```json
{
  "success": true,
  "data": {
    "sudo_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expires_in": 900,
    "token_type": "Bearer",
    "access_level": "root",
    "is_sudo": true,
    "warning": "Sudo token expires in 15 minutes",
    "reason": "User management operation"
  }
}
```

#### Error Responses

| Status | Error Code | Message | Condition |
|--------|------------|---------|-----------|
| 401 | `USER_JWT_REQUIRED` | "Valid user JWT required for privilege escalation" | No valid user JWT |
| 403 | `SUDO_ACCESS_DENIED` | "Insufficient privileges for sudo - requires 'root' or 'full' access level" | User has edit/read/deny access |

---

### POST /api/auth/fake

Impersonate another user by generating a JWT with their identity and permissions. This is useful for debugging user-specific issues, customer support troubleshooting, and testing user permissions without knowing their credentials.

**Security**:
- Only users with `access='root'` can use this endpoint
- Shorter-lived token (1 hour vs 24 hours for normal login)
- Full audit logging with `is_fake` metadata in JWT
- Cannot fake yourself (use your regular token instead)

**Use Cases**:
- Debugging user-specific permission issues
- Customer support troubleshooting
- Testing features as different user roles
- Reproducing user-reported bugs

#### Request Body
```json
{
  "user_id": "uuid",      // Optional: Target user's ID
  "username": "string"    // Optional: Target user's auth identifier
}
```

**Note**: Either `user_id` or `username` must be provided.

#### Success Response (200)
```json
{
  "success": true,
  "data": {
    "fake_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expires_in": 3600,
    "token_type": "Bearer",
    "target_user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "John Doe",
      "auth": "john@example.com",
      "access": "full"
    },
    "warning": "Fake token expires in 1 hour",
    "faked_by": {
      "id": "root-user-id",
      "name": "Root Admin"
    }
  }
}
```

#### Error Responses

| Status | Error Code | Message | Condition |
|--------|------------|---------|-----------|
| 400 | `TARGET_USER_MISSING` | "Either user_id or username is required to identify target user" | Neither user_id nor username provided |
| 400 | `CANNOT_FAKE_SELF` | "Cannot fake your own user - you are already authenticated as this user" | Trying to fake yourself |
| 401 | `USER_JWT_REQUIRED` | "Valid user JWT required" | No valid user JWT |
| 403 | `FAKE_ACCESS_DENIED` | "User impersonation requires root access" | User lacks root access |
| 404 | `TARGET_USER_NOT_FOUND` | "Target user not found: {identifier}" | User doesn't exist or is deleted |

#### JWT Payload for Fake Tokens

The fake token includes special metadata for audit tracking:
```json
{
  "sub": "target-user-id",
  "user_id": "target-user-id",
  "access": "full",
  "is_sudo": false,
  "is_fake": true,
  "faked_by_user_id": "root-user-id",
  "faked_by_username": "Root Admin",
  "faked_at": "2025-11-15T10:30:00Z",
  "exp": 1234567890
}
```

#### Example Usage

**Fake by user ID:**
```bash
curl -X POST http://localhost:9001/api/auth/fake \
  -H "Authorization: Bearer ROOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"user_id": "550e8400-e29b-41d4-a716-446655440000"}'
```

**Fake by username:**
```bash
curl -X POST http://localhost:9001/api/auth/fake \
  -H "Authorization: Bearer ROOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username": "john@example.com"}'
```

**Use fake token:**
```bash
# The fake token works like any other JWT
curl -X GET http://localhost:9001/api/data/accounts \
  -H "Authorization: Bearer FAKE_TOKEN"

# Whoami will show the faked user's identity
curl -X GET http://localhost:9001/api/auth/whoami \
  -H "Authorization: Bearer FAKE_TOKEN"
```

#### Security Considerations

1. **Audit Trail**: All fake operations are logged with the root user's identity
2. **Time-Limited**: Fake tokens expire after 1 hour to limit exposure
3. **Metadata**: JWT includes `is_fake`, `faked_by_user_id`, and `faked_at` for tracking
4. **Root Only**: Only root users can impersonate - full users cannot
5. **No Self-Fake**: Cannot fake your own account (prevents confusion)

---

## Sudo Access Model

The sudo model follows Linux conventions where root users have implicit sudo access, while privileged users can elevate temporarily.

### Access Levels and Sudo Behavior

| Access Level | Sudo at Login | Can Request Sudo | Use Case |
|--------------|---------------|------------------|----------|
| `root` | ✅ Automatic (`is_sudo=true`) | ✅ Yes (for audit trail) | System administrators |
| `full` | ❌ No | ✅ Yes (15-min token) | Team leads, senior devs |
| `edit` | ❌ No | ❌ No | Regular users |
| `read` | ❌ No | ❌ No | Read-only access |
| `deny` | ❌ No | ❌ No | Blocked users |

### Root Users (Automatic Sudo)
- Login JWT includes `is_sudo: true` automatically
- Can perform sudo operations immediately without calling `/api/auth/sudo`
- Can still call `/api/auth/sudo` to get time-limited token with `elevation_reason` for audit trail
- Like Linux root user - inherently trusted

### Full Users (Temporary Sudo)
- Login JWT has `is_sudo: false`
- Must call POST `/api/auth/sudo` to get 15-minute sudo token
- Sudo token includes `is_sudo: true` and audit metadata
- Like Linux user in sudoers file - can elevate when needed

### Protected Operations
Operations requiring `is_sudo=true` in JWT:
- Modifying schemas with `sudo=true` flag (via Describe API)
- Creating/updating/deleting records in sudo schemas (via Data API)
- User management operations
- Other system-critical operations

### Token Management Strategy
```javascript
// For root users - immediate sudo access
const rootToken = loginResponse.data.token;  // Already has is_sudo=true
localStorage.setItem('token', rootToken);

// For full users - must elevate when needed
const userToken = loginResponse.data.token;  // is_sudo=false
localStorage.setItem('user_token', userToken);

// Request sudo when needed
const sudoResponse = await fetch('/api/auth/sudo', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${userToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ reason: 'User management' })
});
const sudoToken = sudoResponse.data.sudo_token;  // is_sudo=true, 15-min expiry
sessionStorage.setItem('sudo_token', sudoToken);
```

### Sudo Workflow Examples

**Root User Workflow** (Immediate Access):
```bash
# 1. Login as root user
curl -X POST http://localhost:9001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"tenant": "acme", "username": "root"}'
# Returns: token with is_sudo=true

# 2. Use token directly for sudo operations
curl -X POST http://localhost:9001/api/data/users \
  -H "Authorization: Bearer ROOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "John Doe", "auth": "john@example.com", "access": "full"}'
```

**Full User Workflow** (Must Elevate):
```bash
# 1. Login as full user
curl -X POST http://localhost:9001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"tenant": "acme", "username": "full"}'
# Returns: token with is_sudo=false

# 2. Request sudo token
curl -X POST http://localhost:9001/api/auth/sudo \
  -H "Authorization: Bearer FULL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Creating new team member"}'
# Returns: sudo_token with is_sudo=true (15-min expiry)

# 3. Use sudo token for protected operations
curl -X POST http://localhost:9001/api/data/users \
  -H "Authorization: Bearer SUDO_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "John Doe", "auth": "john@example.com", "access": "full"}'
```

## Security Model

### Sudo Security Features
- **Role-based access**: Only root and full users can have sudo access
- **Automatic for root**: Root users have implicit sudo (like Linux root)
- **Explicit for full**: Full users must actively request sudo elevation
- **Time-limited**: Sudo tokens from `/api/auth/sudo` expire after 15 minutes
- **Audit logging**: All sudo requests logged with reason and user context
- **Tenant-scoped**: Sudo operations restricted to user's tenant

### Best Practices

**For Root Users:**
1. **Use login token directly**: No need to call `/api/auth/sudo` for normal operations
2. **Optional sudo request**: Call `/api/auth/sudo` when you want explicit audit trail
3. **Long-lived access**: Root login tokens last 24 hours with continuous sudo

**For Full Users:**
1. **Request sudo only when needed**: Don't preemptively escalate
2. **Provide clear reasons**: Include meaningful `elevation_reason` for audit trail
3. **Handle expiration**: Sudo tokens expire after 15 minutes - be prepared to re-request
4. **Separate storage**: Keep user token (long-lived) and sudo token (short-lived) separate

## Error Response Format

All error responses follow the standardized format documented in the main error handling specification.

## Related Documentation

- **Data Operations**: `/docs/data` - Working with schema-backed data
- **Describe Operations**: `/docs/describe` - Managing JSON Schemas
- **Sudo Operations**: `/docs/sudo` - User management requiring sudo tokens

The Auth API provides both the public token issuance flows and the protected account management capabilities required to access every other part of the Monk platform.

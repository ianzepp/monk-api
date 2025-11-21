# Auth API

The Auth API covers both **public token acquisition routes** and **protected user management routes**. Public endpoints issue JWT tokens to unauthenticated callers, while protected endpoints operate on authenticated users and handle privilege escalation.

## Base Paths

- **Public routes**: `/auth/*` (no authentication required)
- **Protected routes**: `/api/auth/*` and `/api/user/*` (JWT required)

## Content Type

- **Request**: `application/json`
- **Response**: `application/json` (default), `text/plain` (TOON), or `application/yaml` (YAML)

## Response Formats

The Auth API supports three response formats optimized for different clients:

### Format Selection Priority

1. **Query Parameter**: `?format=json|toon|yaml` (highest priority - allows per-request override)
2. **Accept Header**: `Accept: application/json|application/toon|application/yaml`
3. **JWT Preference**: `format` field in JWT payload (set at login)
4. **Default**: JSON format

### Supported Formats

- **JSON** - Standard JSON format (default)
- **TOON** - Token-Oriented Object Notation (30-60% smaller, optimized for LLM agents)
- **YAML** - Human-readable format (ideal for configuration and DevOps tools)

Set persistent format preference by including `format` field in login request. The JWT token will include this preference for all subsequent API calls unless overridden.

## Endpoints

### Public Authentication Routes (No JWT Required)

| Method | Path | Description |
|--------|------|-------------|
| POST | [`/auth/login`](login/POST.md) | Authenticate against an existing tenant and issue a JWT token. |
| POST | [`/auth/refresh`](refresh/POST.md) | Exchange an existing token for a fresh one with the same scope. |
| POST | [`/auth/register`](register/POST.md) | Provision a new tenant from a template and return an initial token. |
| GET | [`/auth/tenants`](tenants/GET.md) | List available tenants (personal mode only). |
| GET | [`/auth/templates`](templates/GET.md) | List available templates (personal mode only). |

### Protected Authentication Routes (JWT Required)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/user/whoami` | Return canonical identity, tenant routing data, and ACL arrays for the caller. |
| POST | `/api/user/sudo` | Get short-lived sudo token for dangerous operations (root/full users only). |
| POST | [`/api/auth/fake`](fake/POST.md) | Impersonate another user for debugging and support (root only). |

## Token Lifecycle

1. **Login**: Get initial JWT token with [`POST /auth/login`](login/POST.md)
2. **Use token**: Access protected APIs with Bearer token in Authorization header
3. **Refresh**: When token nears expiration, use [`POST /auth/refresh`](refresh/POST.md)
4. **Logout**: Tokens are stateless - simply discard client-side

## Server Modes

The server administrator configures the naming mode via `TENANT_NAMING_MODE` environment variable:

### Enterprise Mode (Default)
- Database names are SHA256 hashes for security
- `username` required in registration
- Tenant/template listing disabled (403 error)
- Optimal for multi-tenant SaaS deployments

### Personal Mode
- Database names are human-readable
- `username` optional in registration (defaults to 'root')
- Tenant/template listing enabled
- Optimal for personal PaaS deployments

## Sudo Access Model

The sudo model follows Linux conventions where root users have implicit sudo access, while privileged users can elevate temporarily.

| Access Level | Sudo at Login | Can Request Sudo | Use Case |
|--------------|---------------|------------------|----------|
| `root` | ✅ Automatic (`is_sudo=true`) | ✅ Yes (for audit trail) | System administrators |
| `full` | ❌ No | ✅ Yes (15-min token) | Team leads, senior devs |
| `edit` | ❌ No | ❌ No | Regular users |
| `read` | ❌ No | ❌ No | Read-only access |
| `deny` | ❌ No | ❌ No | Blocked users |

### Protected Operations

Operations requiring `is_sudo=true` in JWT:
- Modifying schemas with `sudo=true` flag
- Creating/updating/deleting records in sudo-protected schemas
- Modifying fields with `sudo=true` flag
- User management operations

## Quick Start

### Standard JSON Integration

```bash
# 1. Login and get token
curl -X POST http://localhost:9001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"tenant": "my-company", "username": "john.doe"}'

# 2. Use token for API calls
curl -X GET http://localhost:9001/api/data/users \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# 3. Refresh when needed
curl -X POST http://localhost:9001/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"token": "YOUR_JWT_TOKEN"}'
```

### LLM Agent Integration (TOON Format)

```bash
# 1. Login with TOON format preference
curl -X POST http://localhost:9001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"tenant": "my-company", "username": "llm-agent", "format": "toon"}'

# 2. All API calls now return TOON format automatically
curl -X GET http://localhost:9001/api/describe \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Response: success: true
#           data[4]: columns,definitions,schemas,users

# 3. Override to JSON for specific calls
curl -X GET "http://localhost:9001/api/describe?format=json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Related Documentation

- **Data Operations**: [`/docs/data`](../data/PUBLIC.md) - Working with schema-backed data
- **Describe Operations**: [`/docs/describe`](../describe/PUBLIC.md) - Managing schemas
- **Find Operations**: [`/docs/find`](../find/PUBLIC.md) - Advanced search and filtering
- **Bulk Operations**: [`/docs/bulk`](../bulk/PUBLIC.md) - Multi-schema batch processing

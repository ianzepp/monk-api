# Auth API

The Auth API handles Auth0-authenticated tenant provisioning and explicit local-development bootstrap endpoints. In production, Auth0 is the identity authority and Monk remains the tenant routing and authorization authority.

## Base Path

`/auth/*`

`POST /auth/register` requires `Authorization: Bearer <auth0 access token>`. Local login and refresh routes are disabled in production.

## Content Type

- **Request**: `application/json`
- **Response**: `application/json` (default), `text/plain` (TOON), or `application/yaml` (YAML)

## Auth0 Model

1. Auth0 authenticates users with its hosted username/password database connection.
2. Clients send Auth0 access tokens for the Monk API audience.
3. Monk verifies issuer, audience, signature, expiry, and algorithm through Auth0 JWKS.
4. Monk resolves verified `iss + sub` to a tenant registry row and tenant-local user row.
5. Monk derives DB/schema routing, access level, ACL arrays, and sudo state from Monk-owned records.

Unsupported in the first pass: social login, enterprise IdP login, Auth0 Organizations dependency, Auth0 RBAC, and Auth0 permission claims.

## Response Formats

The Auth API supports response formats optimized for different clients:

1. **Query Parameter**: `?format=json|toon|yaml`
2. **Accept Header**: `Accept: application/json|application/toon|application/yaml`
3. **Default**: JSON format

For Auth0 tokens, use query parameters or `Accept` headers for response format selection. Monk does not read Auth0 profile, organization, role, or permission claims for authorization.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | [`/auth/register`](register/POST.md) | Provision a new tenant for the verified Auth0 subject. |
| POST | [`/auth/login`](login/POST.md) | Explicit non-production local-auth bootstrap only. |
| POST | [`/auth/refresh`](refresh/POST.md) | Explicit non-production local-auth bootstrap only. |
| GET | [`/auth/tenants`](tenants/GET.md) | List available tenants (personal mode only). |

## Quick Start

```bash
# 1. Provision tenant after Auth0 login
curl -X POST http://localhost:9001/auth/register \
  -H "Authorization: Bearer $AUTH0_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tenant": "my-company"}'

# 2. Use the same Auth0 access token for API calls
curl -X GET http://localhost:9001/api/data/users \
  -H "Authorization: Bearer $AUTH0_ACCESS_TOKEN"
```

## LLM Agent Integration

```bash
# Request TOON for a specific call
curl -X GET http://localhost:9001/api/describe \
  -H "Authorization: Bearer $AUTH0_ACCESS_TOKEN" \
  -H "Accept: application/toon"

# Override to JSON for a specific call
curl -X GET "http://localhost:9001/api/describe?format=json" \
  -H "Authorization: Bearer $AUTH0_ACCESS_TOKEN"
```

## Required Auth0 Settings

- `AUTH0_ISSUER` or `AUTH0_DOMAIN`
- `AUTH0_AUDIENCE`
- `AUTH0_JWKS_URL` unless it can be derived from issuer/domain
- Auth0 application/API configured to issue RS256 access tokens for the Monk API audience
- Auth0 database username/password connection for first-pass login

## Related Documentation

- **User API**: `/docs/api/user` - User identity and account management
- **Data API**: [`../api/data/PUBLIC.md`](../api/data/PUBLIC.md) - Working with model-backed data
- **Describe API**: [`../api/describe/PUBLIC.md`](../api/describe/PUBLIC.md) - Managing models

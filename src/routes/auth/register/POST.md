# POST /auth/register

Create a new tenant with core system tables and bootstrap a full-access Monk user mapped to the verified Auth0 issuer and subject. The request must include an Auth0 access token for the configured Monk API audience.

Auth0 proves external identity only. Monk stores `iss + sub` in its own mapping table and derives tenant routing, user access, ACL arrays, and sudo state from Monk-owned records.

## Request Headers

```http
Authorization: Bearer <auth0 access token>
Content-Type: application/json
```

## Request Body

```json
{
  "tenant": "string",
  "description": "string",
  "adapter": "postgresql | sqlite"
}
```

## Success Response

```json
{
  "success": true,
  "data": {
    "tenant_id": "string",
    "tenant": "string",
    "mapping_id": "string",
    "username": "auth0:<hash>"
  }
}
```

The `username` value is a deterministic Monk-local label derived from verified Auth0 `issuer + subject`. Monk does not store or trust Auth0 email, profile, organization, role, or permission claims for authorization.

## Error Responses

| Status | Error Code | Condition |
|--------|------------|-----------|
| 400 | `BODY_NOT_OBJECT` | Request body is not a JSON object |
| 400 | `AUTH_TENANT_MISSING` | Missing tenant field |
| 400 | `INVALID_ADAPTER` | Adapter is not `postgresql` or `sqlite` |
| 401 | `AUTH_TOKEN_REQUIRED` | Missing Auth0 bearer token |
| 401 | `AUTH0_TOKEN_*` | Invalid issuer, audience, signature, expiry, or algorithm |
| 409 | `AUTH0_IDENTITY_ALREADY_PROVISIONED` | Same Auth0 subject tries to provision again |
| 409 | `DATABASE_TENANT_EXISTS` | Tenant name already registered |

Existing-tenant join behavior is intentionally unsupported in the first pass. A duplicate tenant request fails rather than granting root to a new Auth0 subject.

## Example

```bash
curl -X POST http://localhost:9001/auth/register \
  -H "Authorization: Bearer $AUTH0_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant": "acme-corp",
    "description": "Acme production tenant"
  }'
```

## Auth0 Requirements

- Auth0 API audience must match `AUTH0_AUDIENCE`.
- Access tokens must be RS256 and verifiable through the configured JWKS endpoint.
- The current production setup uses machine-to-machine client credentials tokens, but any Auth0-issued bearer token with the configured issuer and audience is accepted.
- Unsupported first-pass features: Auth0 Organizations dependency, Auth0 RBAC, and Auth0 permission decisions inside Monk. Auth0 scopes gate token issuance, but Monk authorization still comes from Monk-owned tenant records.

## Related Endpoints

- [`POST /auth/login`](../login/POST.md) - Explicit non-production local bootstrap only
- [`POST /auth/refresh`](../refresh/POST.md) - Explicit non-production local bootstrap only
- [`GET /api/user`](../../api/user/PUBLIC.md) - Manage Monk tenant-local users

# POST /auth/login

Production local password login is disabled. Auth0 hosted username/password login is the production identity path, and protected Monk routes accept Auth0 access tokens for the configured API audience.

This endpoint remains only as an explicit development/test bootstrap path when `MONK_ENABLE_LOCAL_AUTH=true` and `NODE_ENV` is not `production`.

## Request Body

```json
{
  "tenant": "string",
  "tenant_id": "string",
  "username": "string",
  "format": "string"
}
```

## Success Response

Only available when explicit non-production local auth is enabled. Production never issues a local HS256 login token.

## Error Responses

| Status | Error Code | Condition |
|--------|------------|-----------|
| 403 | `LOCAL_AUTH_DISABLED` | Production mode or missing `MONK_ENABLE_LOCAL_AUTH=true` |
| 400 | `AUTH_TENANT_MISSING` | Missing tenant identity |
| 400 | `AUTH_USERNAME_MISSING` | Missing username field |
| 401 | `AUTH_LOGIN_FAILED` | Invalid local bootstrap credentials or tenant not found |

## Explicit Local Bootstrap

```bash
MONK_ENABLE_LOCAL_AUTH=true NODE_ENV=development \
curl -X POST http://localhost:9001/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "tenant": "my-company",
    "username": "root"
  }'
```

## Related Endpoints

- [`POST /auth/register`](../register/POST.md) - Provision a new tenant for a verified Auth0 subject
- [`POST /auth/refresh`](../refresh/POST.md) - Explicit local-bootstrap token refresh only

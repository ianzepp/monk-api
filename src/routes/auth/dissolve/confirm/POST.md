# POST /auth/dissolve/confirm

Step 2 of the two-step tenant/user dissolution flow.

Accepts the confirmation token returned by `POST /auth/dissolve` in the request body, validates it, and permanently soft-deletes the tenant and its root user. After this call, `POST /auth/login` for the same credentials will no longer succeed.

The confirmation token must come in the POST body. Do not send it in the `Authorization` header or in the URL.

## Request Body

```json
{
  "confirmation_token": "string"
}
```

## Success Response

```json
{
  "success": true,
  "data": {
    "tenant": "string",
    "username": "string",
    "dissolved": true
  }
}
```

## Error Responses

| Status | Error Code | Condition |
|--------|------------|-----------|
| 400 | `BODY_NOT_OBJECT` | Request body is not a JSON object |
| 400 | `DISSOLVE_TOKEN_MISSING` | `confirmation_token` field absent |
| 401 | `DISSOLVE_TOKEN_EXPIRED` | Token has passed its 5-minute expiry |
| 401 | `DISSOLVE_TOKEN_INVALID` | Token is malformed, signature invalid, or not a dissolve token |
| 404 | `DISSOLVE_TENANT_NOT_FOUND` | Tenant not found or already dissolved |

## Dissolution Semantics

- The tenant row is soft-deleted: `deleted_at` is set and `is_active` is set to `false`. No hard-delete occurs.
- The root user row inside the tenant namespace is also soft-deleted.
- Dissolution is irreversible via API.
- Without persistent storage, replay within the 5-minute confirmation window is possible. Call confirm promptly after receiving the token.

## Example

```bash
# First, get the confirmation token from /auth/dissolve
TOKEN=$(curl -s -X POST http://localhost:9001/auth/dissolve \
  -H "Content-Type: application/json" \
  -d '{
    "tenant": "my_company",
    "username": "root_user",
    "password": "correct horse battery staple"
  }' | jq -r '.data.confirmation_token')

# Then confirm the dissolution
curl -X POST http://localhost:9001/auth/dissolve/confirm \
  -H "Content-Type: application/json" \
  -d "{\"confirmation_token\": \"$TOKEN\"}"
```

## Related Endpoints

- [`POST /auth/dissolve`](../POST.md) - Step 1: verify credentials and get a confirmation token
- [`POST /auth/login`](../../login/POST.md) - Log in to an existing tenant
- [`POST /auth/register`](../../register/POST.md) - Register a brand-new tenant and root user

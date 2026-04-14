# POST /auth/refresh

Refresh a Monk bearer token from the human register/login flow.

Clients present the current Monk token in `Authorization: Bearer <token>`. Monk verifies the token, checks that the tenant and user are still active, and returns a fresh Monk bearer token.

Public-key machine tokens are not refreshable. Machine clients must request a new `/auth/challenge` and complete `/auth/verify` again.

## Request Headers

```http
Authorization: Bearer <monk bearer token>
```

## Success Response

```json
{
  "success": true,
  "data": {
    "token": "string",
    "expires_in": 604800,
    "user": {
      "id": "string",
      "username": "string",
      "tenant": "string",
      "tenant_id": "string",
      "access": "string"
    }
  }
}
```

## Error Responses

| Status | Error Code | Condition |
|--------|------------|-----------|
| 401 | `AUTH_TOKEN_REQUIRED` | Missing bearer token |
| 401 | `AUTH_TOKEN_INVALID` | Invalid or corrupted Monk token |
| 401 | `AUTH_TOKEN_EXPIRED` | Expired Monk token |
| 401 | `AUTH_TOKEN_REFRESH_FAILED` | Token references a removed or inactive tenant/user |
| 403 | `AUTH_FAKE_TOKEN_REFRESH_DENIED` | Token is a short-lived impersonation token |
| 403 | `AUTH_PUBLIC_KEY_REFRESH_UNSUPPORTED` | Token came from `/auth/verify` and must not be refreshed |

## Example

```bash
curl -X POST http://localhost:9001/auth/refresh \
  -H "Authorization: Bearer $MONK_TOKEN"
```

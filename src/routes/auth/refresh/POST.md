# POST /auth/refresh

Refresh a Monk bearer token.

Clients present the current Monk token in `Authorization: Bearer <token>`. Monk verifies the token, checks that the tenant and user are still active, and returns a fresh Monk bearer token.

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
    "expires_in": 86400,
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

## Example

```bash
curl -X POST http://localhost:9001/auth/refresh \
  -H "Authorization: Bearer $MONK_TOKEN"
```

# POST /auth/refresh

Production local JWT refresh is disabled. Auth0 access-token renewal is handled by the Auth0 client/session flow outside Monk.

This endpoint remains only as an explicit development/test bootstrap path when `MONK_ENABLE_LOCAL_AUTH=true` and `NODE_ENV` is not `production`.

## Request Body

```json
{
  "token": "string"
}
```

## Success Response

Only available when explicit non-production local auth is enabled. Production never refreshes a local HS256 Monk JWT.

## Error Responses

| Status | Error Code | Condition |
|--------|------------|-----------|
| 403 | `LOCAL_AUTH_DISABLED` | Production mode or missing `MONK_ENABLE_LOCAL_AUTH=true` |
| 400 | `AUTH_TOKEN_REQUIRED` | Missing token field |
| 401 | `AUTH_TOKEN_INVALID` | Invalid or corrupted local bootstrap token |
| 401 | `AUTH_TOKEN_EXPIRED` | Expired local bootstrap token |
| 401 | `AUTH_TOKEN_REFRESH_FAILED` | Local bootstrap token references a removed tenant or user |

## Explicit Local Bootstrap Refresh

```bash
MONK_ENABLE_LOCAL_AUTH=true NODE_ENV=development \
curl -X POST http://localhost:9001/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }'
```

## Security Considerations

- Monk does not refresh local HS256 tokens in production.
- Browser, CLI, or service clients should renew Auth0 sessions/access tokens through Auth0-supported flows.
- Local refresh exists for development/test fixtures that explicitly enable `MONK_ENABLE_LOCAL_AUTH=true`.

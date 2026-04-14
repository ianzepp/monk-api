# POST /auth/dissolve/confirm

Step 2 of the two-step tenant/user dissolution flow.

Accepts the confirmation token returned by `POST /auth/dissolve`, validates it,
and permanently soft-deletes the tenant and its root user.  After this call,
`POST /auth/login` for the same credentials will no longer succeed.

## Request

```json
{
  "confirmation_token": "<signed-jwt>"
}
```

The token **must** come in the POST body.  Do not send it in the `Authorization`
header or in the URL.

## Success response (200)

```json
{
  "success": true,
  "data": {
    "tenant": "acme",
    "username": "root_user",
    "dissolved": true
  }
}
```

## Error responses

| Status | error_code | Cause |
|--------|------------|-------|
| 400 | DISSOLVE_TOKEN_MISSING | `confirmation_token` field absent |
| 401 | DISSOLVE_TOKEN_EXPIRED | Token has passed its 5-minute expiry |
| 401 | DISSOLVE_TOKEN_INVALID | Token is malformed, signature invalid, or not a dissolve token |
| 404 | DISSOLVE_TENANT_NOT_FOUND | Tenant not found or already dissolved |

## Notes

- Dissolution is irreversible via API.  The tenant row is soft-deleted
  (`deleted_at` set, `is_active = false`); no hard-delete occurs.
- The root user row is also soft-deleted inside the tenant namespace.
- Without persistent storage, replay within the 5-minute confirmation window is
  possible.  Call confirm promptly after receiving the token.

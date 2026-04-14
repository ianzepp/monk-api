# POST /auth/dissolve

Step 1 of the two-step tenant/user dissolution flow.

Verifies the supplied credentials (tenant + username + password) the same way
`POST /auth/login` does.  On success, returns a short-lived confirmation token
that is **only** valid for `POST /auth/dissolve/confirm`.  The token expires in
5 minutes and cannot be used as an API bearer token.

## Request

```json
{
  "tenant": "acme",
  "username": "root_user",
  "password": "secret"
}
```

## Success response (200)

```json
{
  "success": true,
  "data": {
    "confirmation_token": "<signed-jwt>",
    "expires_in": 300
  }
}
```

## Error responses

| Status | error_code | Cause |
|--------|------------|-------|
| 400 | AUTH_TENANT_MISSING | `tenant` field absent |
| 400 | AUTH_USERNAME_MISSING | `username` field absent |
| 400 | AUTH_PASSWORD_MISSING | `password` field absent |
| 400 | AUTH_TENANT_INVALID | `tenant` contains `:` or is not snake_case |
| 400 | AUTH_USERNAME_INVALID | `username` contains `:` or is not snake_case |
| 401 | AUTH_LOGIN_FAILED | Credentials invalid or tenant not found |

## Notes

- The confirmation token contains `is_dissolve: true` and will be rejected
  by `authValidatorMiddleware` if presented as a normal bearer token.
- Keep the confirmation token out of logs and URLs; transport via POST body only.
- Without persistent storage, replay within the 5-minute window is possible.
  Keep the expiry tight and call confirm promptly.

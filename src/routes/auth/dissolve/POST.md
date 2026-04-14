# POST /auth/dissolve

Step 1 of the two-step tenant/user dissolution flow.

Verifies the supplied credentials the same way `POST /auth/login` does, then returns a short-lived confirmation token. The token expires in 5 minutes and is only valid for `POST /auth/dissolve/confirm`. It cannot be used as a normal Monk bearer token on protected API routes.

## Request Body

```json
{
  "tenant": "string",
  "username": "string",
  "password": "string"
}
```

## Success Response

```json
{
  "success": true,
  "data": {
    "confirmation_token": "string",
    "expires_in": 300
  }
}
```

## Error Responses

| Status | Error Code | Condition |
|--------|------------|-----------|
| 400 | `BODY_NOT_OBJECT` | Request body is not a JSON object |
| 400 | `AUTH_TENANT_MISSING` | Missing tenant field |
| 400 | `AUTH_USERNAME_MISSING` | Missing username field |
| 400 | `AUTH_PASSWORD_MISSING` | Missing password field |
| 400 | `AUTH_TENANT_INVALID` | Tenant is not canonical snake_case |
| 400 | `AUTH_USERNAME_INVALID` | Username is not canonical snake_case |
| 401 | `AUTH_LOGIN_FAILED` | Invalid credentials or tenant not found |
| 403 | `AUTH_DISSOLVE_FORBIDDEN` | Authenticated user does not have `root` access |
| 401 | `AUTH0_*` | Auth0 broker configuration or upstream auth failure |

## Token Shape

The confirmation token is a minimal purpose-bound JWT. It is not a Monk access token and cannot be used as one.

```json
{
  "token_use": "dissolve",
  "tenant": "my_company",
  "tenant_id": "...",
  "user_id": "...",
  "username": "root_user",
  "iat": 1234567890,
  "exp": 1234568190
}
```

## Security Notes

- Keep the confirmation token out of logs and URLs.
- Transport via POST body only — never in `Authorization` header or query string.
- Without persistent storage, replay within the 5-minute window is possible. Call confirm promptly.

## Example

```bash
curl -X POST http://localhost:9001/auth/dissolve \
  -H "Content-Type: application/json" \
  -d '{
    "tenant": "my_company",
    "username": "root_user",
    "password": "correct horse battery staple"
  }'
```

## Related Endpoints

- [`POST /auth/dissolve/confirm`](confirm/POST.md) - Step 2: consume the confirmation token and dissolve the tenant
- [`POST /auth/login`](../login/POST.md) - Log in to an existing tenant
- [`POST /auth/register`](../register/POST.md) - Register a brand-new tenant and root user

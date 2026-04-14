# POST /auth/login

Log in with canonical snake_case `tenant`, `username`, and `password`.

Monk forwards credential verification to Auth0, looks up the Monk-local tenant user, and returns a Monk bearer token. Clients never need to present Auth0 bearer tokens to Monk.

## Request Body

```json
{
  "tenant": "string",
  "username": "string",
  "password": "string",
  "format": "string"
}
```

## Success Response

```json
{
  "success": true,
  "data": {
    "token": "string",
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
| 400 | `AUTH_TENANT_MISSING` | Missing tenant field |
| 400 | `AUTH_USERNAME_MISSING` | Missing username field |
| 400 | `AUTH_PASSWORD_MISSING` | Missing password field |
| 400 | `AUTH_TENANT_INVALID` | Tenant is not canonical snake_case |
| 400 | `AUTH_USERNAME_INVALID` | Username is not canonical snake_case |
| 401 | `AUTH_LOGIN_FAILED` | Invalid credentials or Monk-local tenant/user missing |
| 401 | `AUTH0_*` | Auth0 broker configuration or upstream auth failure |

## Example

```bash
curl -X POST http://localhost:9001/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "tenant": "my_company",
    "username": "root_user",
    "password": "correct horse battery staple"
  }'
```

## Related Endpoints

- [`POST /auth/register`](../register/POST.md) - Register a brand-new tenant and root user
- [`POST /auth/refresh`](../refresh/POST.md) - Refresh a Monk bearer token

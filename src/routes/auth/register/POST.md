# POST /auth/register

Create a brand-new tenant and bootstrap its root user from canonical snake_case `tenant`, `username`, and `password`.

Monk forwards user provisioning to Auth0, never stores the password locally, provisions the Monk tenant and root user, and returns a Monk bearer token immediately.

`/auth/register` is for new-tenant bootstrap only. It does not join users to existing tenants.

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
    "tenant_id": "string",
    "tenant": "string",
    "username": "string",
    "token": "string",
    "expires_in": 86400
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
| 409 | `DATABASE_TENANT_EXISTS` | Tenant already exists in Monk |
| 409 | `AUTH_USERNAME_EXISTS` | External Auth0 username already exists with conflicting credentials |
| 401 | `AUTH0_*` | Auth0 broker configuration or upstream provisioning failure |

## Example

```bash
curl -X POST http://localhost:9001/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "tenant": "acme_corp",
    "username": "root_user",
    "password": "correct horse battery staple"
  }'
```

## Related Endpoints

- [`POST /auth/login`](../login/POST.md) - Log in to an existing tenant
- [`POST /auth/refresh`](../refresh/POST.md) - Refresh a Monk bearer token
- [`GET /api/user`](../../api/user/PUBLIC.md) - Manage Monk tenant-local users

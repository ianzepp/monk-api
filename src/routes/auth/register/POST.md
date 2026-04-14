# POST /auth/register

Create a brand-new tenant and bootstrap its root user from canonical snake_case `tenant`, `username`, `email`, and `password`.

Monk forwards user provisioning to its upstream identity broker, never stores the password locally, and provisions the Monk tenant and root user in `pending` status. `email` is required on register so Monk can create the upstream identity without inventing one. Registration does not mint a Monk bearer token; clients must complete a follow-up `/auth/login`.

`/auth/register` is for new-tenant bootstrap only. It does not join users to existing tenants.

## Request Body

```json
{
  "tenant": "string",
  "username": "string",
  "email": "user@example.com",
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
    "status": "pending"
  }
}
```

## Error Responses

| Status | Error Code | Condition |
|--------|------------|-----------|
| 400 | `BODY_NOT_OBJECT` | Request body is not a JSON object |
| 400 | `AUTH_TENANT_MISSING` | Missing tenant field |
| 400 | `AUTH_USERNAME_MISSING` | Missing username field |
| 400 | `AUTH_EMAIL_MISSING` | Missing email field |
| 400 | `AUTH_PASSWORD_MISSING` | Missing password field |
| 400 | `AUTH_TENANT_INVALID` | Tenant is not canonical snake_case |
| 400 | `AUTH_USERNAME_INVALID` | Username is not canonical snake_case |
| 400 | `AUTH_EMAIL_INVALID` | Email is not a valid email address |
| 409 | `DATABASE_TENANT_EXISTS` | Tenant already exists in Monk |
| 409 | `AUTH_USERNAME_EXISTS` | External username already exists with conflicting credentials |
| 401 | broker failure | Upstream provisioning or auth-broker failure |

## Example

```bash
curl -X POST http://localhost:9001/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "tenant": "acme_corp",
    "username": "root_user",
    "email": "root_user@example.com",
    "password": "correct horse battery staple"
  }'
```

## Related Endpoints

- [`POST /auth/login`](../login/POST.md) - Log in to an existing tenant
- [`POST /auth/refresh`](../refresh/POST.md) - Refresh a Monk bearer token from the human login flow
- [`GET /api/user`](../../api/user/PUBLIC.md) - Manage Monk tenant-local users

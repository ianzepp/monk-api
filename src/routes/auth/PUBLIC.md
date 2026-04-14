# Auth API

The Auth API is an LLM-first, non-browser authentication surface.

Clients send `tenant`, `username`, and `password` directly to Monk for login. Registration additionally requires `email` so Monk can provision the Auth0 identity without inventing one. Monk never stores passwords locally and then mints Monk bearer tokens for API access.

## Base Path

`/auth/*`

## Content Type

- **Request**: `application/json`
- **Response**: `application/json` (default), `text/plain` (TOON), or `application/yaml` (YAML)

## Auth Model

1. Clients send canonical snake_case identity values to Monk.
2. Monk derives the external Auth0 login identifier from `(tenant, username)`.
3. Monk brokers password verification and registration through Auth0.
4. Monk looks up or provisions Monk-local tenant and user records.
5. Monk returns a Monk bearer token.
6. Protected Monk routes accept Monk bearer tokens, not Auth0 bearer tokens.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | [`/auth/register`](register/POST.md) | Create a brand-new tenant and root user from tenant, username, email, and password, then return a Monk bearer token. |
| POST | [`/auth/login`](login/POST.md) | Verify tenant username/password through Auth0 and return a Monk bearer token. |
| POST | [`/auth/refresh`](refresh/POST.md) | Refresh a Monk bearer token presented in `Authorization`. |
| GET | [`/auth/tenants`](tenants/GET.md) | List available tenants (personal mode only). |
| POST | [`/auth/dissolve`](dissolve/POST.md) | Step 1 of dissolution: verify credentials and return a short-lived confirmation token. |
| POST | [`/auth/dissolve/confirm`](dissolve/confirm/POST.md) | Step 2 of dissolution: consume the confirmation token and permanently soft-delete the tenant and user. |

## Quick Start

```bash
# 1. Register a new tenant and root user
curl -X POST http://localhost:9001/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "tenant": "my_company",
    "username": "root_user",
    "email": "root_user@example.com",
    "password": "correct horse battery staple"
  }'

# 2. Log in and get a Monk bearer token
curl -X POST http://localhost:9001/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "tenant": "my_company",
    "username": "root_user",
    "password": "correct horse battery staple"
  }'

# 3. Use the Monk bearer token on protected routes
curl -X GET http://localhost:9001/api/data/users \
  -H "Authorization: Bearer $MONK_TOKEN"

# 4. Dissolve a tenant (two-step: get confirmation token, then confirm)
curl -X POST http://localhost:9001/auth/dissolve \
  -H "Content-Type: application/json" \
  -d '{
    "tenant": "my_company",
    "username": "root_user",
    "password": "correct horse battery staple"
  }'

curl -X POST http://localhost:9001/auth/dissolve/confirm \
  -H "Content-Type: application/json" \
  -d '{"confirmation_token": "<token from step above>"}'
```

## Auth0 Settings Monk Needs

- `AUTH0_ISSUER` or `AUTH0_DOMAIN`
- `AUTH0_CLIENT_ID`
- `AUTH0_CLIENT_SECRET`
- `AUTH0_CONNECTION`
- optional `AUTH0_AUDIENCE`
- optional separate management credentials for user creation:
  - `AUTH0_MANAGEMENT_CLIENT_ID`
  - `AUTH0_MANAGEMENT_CLIENT_SECRET`

## Related Documentation

- **User API**: `/docs/api/user` - User identity and account management
- **Data API**: [`../api/data/PUBLIC.md`](../api/data/PUBLIC.md) - Working with model-backed data
- **Describe API**: [`../api/describe/PUBLIC.md`](../api/describe/PUBLIC.md) - Managing models

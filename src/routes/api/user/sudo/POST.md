# POST /api/user/sudo

Request a short-lived sudo token.

This endpoint elevates an authenticated user with `full` or `root` access
into a temporary sudo context for administrative actions.

## Docs Path

- Live route: `POST /api/user/sudo`
- Docs page: `/docs/api/user/sudo/POST`

## Authentication

Requires a valid user JWT in the Authorization header.

```bash
Authorization: Bearer <token>
```

## Request Body

```json
{
  "reason": "User administration"
}
```

### Fields

- `reason` — optional audit-trail string

## Access Rules

- `root` users may request sudo tokens
- `full` users may request sudo tokens
- `read`, `edit`, and `deny` users are rejected

## Response

```json
{
  "success": true,
  "data": {
    "sudo_token": "<jwt>",
    "expires_in": 900,
    "token_type": "Bearer",
    "access_level": "full",
    "is_sudo": true,
    "warning": "Sudo token expires in 15 minutes",
    "reason": "User administration"
  }
}
```

## Errors

| Status | Error Code | Meaning |
|--------|------------|---------|
| 401 | `AUTH_TOKEN_REQUIRED` | No JWT or missing user context |
| 401 | `AUTH_TOKEN_INVALID` | Missing tenant/database context |
| 403 | `AUTH_SUDO_ACCESS_DENIED` | User is not `full` or `root` |

## Notes

- The sudo token expires in 15 minutes.
- The reason is written to the audit log.
- Use the sudo token only for the administrative operation that requires it.

## Example

```bash
curl -X POST http://localhost:9001/api/user/sudo \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"reason": "User administration"}'
```

## Related docs

- [User API overview](../PUBLIC.md)
- [User API notes](../README.md)
- [Data API](../../data/PUBLIC.md)

# Cron API

The Cron API manages scheduled jobs for a tenant.
It is a protected administrative surface and requires sudo access.

## Base Path

`/api/cron`

## Authentication

All Cron API routes require a valid Monk bearer token mapped to a Monk user with sudo access.

```bash
Authorization: Bearer <token>
```

## Endpoint Summary

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/cron` | List all cron jobs for the tenant. |
| POST | `/api/cron` | Create a cron job definition. |
| GET | `/api/cron/:pid` | Get a single cron job. |
| PATCH | `/api/cron/:pid` | Update a cron job. |
| DELETE | `/api/cron/:pid` | Delete a cron job. |
| POST | `/api/cron/:pid/enable` | Enable a cron job. |
| POST | `/api/cron/:pid/disable` | Disable a cron job. |

## LLM Navigation Notes

The docs path mirrors the route path.
Do **not** guess a nested path like `/docs/api/cron/post`.
Use the overview page and endpoint docs directly:

- `/docs/api/cron`
- `/docs/api/cron/GET`
- `/docs/api/cron/POST`
- `/docs/api/cron/pid/GET`
- `/docs/api/cron/pid/PATCH`
- `/docs/api/cron/pid/DELETE`
- `/docs/api/cron/pid/enable/POST`
- `/docs/api/cron/pid/disable/POST`

## Notes

- Listing cron jobs requires sudo access.
- Creating cron jobs currently returns a not-implemented error because the execution backend is still being replaced.
- Other cron operations are present as route surfaces and should be documented alongside their live behavior.

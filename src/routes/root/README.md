# Monk API

Monk API is a multi-tenant PaaS backend for model-first applications.
It gives tenants and apps the raw HTTP surfaces to define their own models,
store records, query data, track changes, manage access, and move files.

This document is the agent-facing public entrypoint.
It is served at `/llms.txt`.
The human-facing root lives at `/` as HTML with a companion stylesheet at `/index.css`.

## Start here

If you are a human or an LLM landing on the API, read these in order:

1. [API overview](/docs)
2. [Authentication](/docs/auth)
3. [Keys API](/docs/api/keys)
4. [Data API](/docs/api/data)
5. [Describe API](/docs/api/describe)
6. [Find API](/docs/api/find)
7. [Aggregate API](/docs/api/aggregate)
8. [Bulk API](/docs/api/bulk)
9. [ACLs API](/docs/api/acls)
10. [Stat API](/docs/api/stat)
11. [Tracked API](/docs/api/tracked)
12. [Trashed API](/docs/api/trashed)
13. [Cron API](/docs/api/cron)
14. [User API](/docs/api/user)
15. [Filesystem API](/docs/fs)

## What Monk API does

Monk API provides:

- model-first data access
- tenant-isolated storage
- record-level ACLs
- change tracking and audit trails
- soft delete and restore workflows
- scheduled job management
- app packages under `/app/*`
- filesystem-style tenant access under `/fs/*`
- response formatting for JSON, YAML, TOON, CSV, Markdown, and more

## Common workflow

### Human tenant bootstrap

1. `POST /auth/register`
2. `POST /auth/login`
3. Use the returned bearer token on protected routes

### Machine tenant bootstrap

1. `POST /auth/provision`
2. Sign the returned challenge nonce
3. `POST /auth/verify`
4. Use `GET /api/keys`, `POST /api/keys`, `POST /api/keys/rotate`, and `DELETE /api/keys/:key_id` to manage machine credentials

### Tenant work

1. Use `/api/describe/*` to define or inspect models.
2. Use `/api/data/*` to create and update records.
3. Use `/api/find/*` and `/api/aggregate/*` for query and analysis.
4. Use `/api/tracked/*`, `/api/stat/*`, `/api/trashed/*`, and `/api/cron/*` for audit, lifecycle, and scheduled jobs.
5. Use `/fs/*` for tenant-scoped files.

## Authentication

Most API routes require a JWT in the `Authorization` header:

```bash
Authorization: Bearer <token>
```

Public routes do not require authentication:

- `/`
- `/index.html`
- `/index.css`
- `/llms.txt`
- `/health`
- `/auth/register`
- `/auth/login`
- `/auth/provision`
- `/auth/challenge`
- `/auth/verify`
- `/auth/refresh`
- `/auth/tenants`
- `/auth/dissolve`
- `/auth/dissolve/confirm`
- `/docs`
- `/docs/*`

Protected route families require a Monk bearer token:

- `/api/user/*`
- `/api/keys*`
- `/api/data/*`
- `/api/describe/*`
- `/api/find/*`
- `/api/aggregate/*`
- `/api/bulk*`
- `/api/acls/*`
- `/api/stat/*`
- `/api/tracked/*`
- `/api/trashed/*`
- `/api/cron/*`
- `/fs/*`

## Example

```bash
curl http://localhost:9001/docs/api/data
curl http://localhost:9001/docs/api/keys
curl http://localhost:9001/docs/api/cron
curl -X GET http://localhost:9001/api/describe/users \
  -H "Authorization: Bearer <token>"
```

## Notes for agents

- Read the route docs before calling the API.
- Prefer the documented route paths over guessing.
- Use `/docs/*` as the canonical navigation surface.
- Treat the root document as the shortest path to the route docs.

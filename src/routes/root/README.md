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
3. [Data API](/docs/api/data)
4. [Describe API](/docs/api/describe)
5. [Find API](/docs/api/find)
6. [Aggregate API](/docs/api/aggregate)
7. [Bulk API](/docs/api/bulk)
8. [ACLs API](/docs/api/acls)
9. [Stat API](/docs/api/stat)
10. [Tracked API](/docs/api/tracked)
11. [Trashed API](/docs/api/trashed)
12. [Cron API](/docs/api/cron)
13. [User API](/docs/api/user)
14. [Filesystem API](/docs/fs)

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

1. Create or select a tenant.
2. Use `/api/describe/*` to define or inspect models.
3. Use `/api/data/*` to create and update records.
4. Use `/api/find/*` and `/api/aggregate/*` for query and analysis.
5. Use `/api/tracked/*`, `/api/stat/*`, `/api/trashed/*`, and `/api/cron/*` for audit, lifecycle, and scheduled jobs.
6. Use `/fs/*` for tenant-scoped files.

## Authentication

Most API routes require a JWT in the `Authorization` header:

```bash
Authorization: Bearer <token>
```

Public routes do not require authentication:

- `/`
- `/llms.txt`
- `/health`
- `/auth/*`
- `/docs/*`

## Example

```bash
curl http://localhost:9001/docs/api/data
curl http://localhost:9001/docs/api/cron
curl -X GET http://localhost:9001/api/describe/users \
  -H "Authorization: Bearer <token>"
```

## Notes for agents

- Read the route docs before calling the API.
- Prefer the documented route paths over guessing.
- Use `/docs/*` as the canonical navigation surface.
- Treat the root document as the shortest path to the route docs.

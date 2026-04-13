# Pressure Test Log

Target: live Railway `monk-api` service

## Goals

- Register a fresh private tenant through `POST /auth/register`.
- Use the returned token to probe protected API surfaces.
- Look for crashes, broken auth boundaries, input validation gaps, and unsafe behavior.
- Record real defects as GitHub issues in the upstream repo.

## Tracking

| Time | Step | Result | Notes |
|------|------|--------|-------|
| 2026-04-13 | Repo warm-up | PASS | Confirmed Railway service, auth/register surface, and GitHub remote. |
| 2026-04-13 | Tracking doc created | PASS | This file. |
| 2026-04-13 | Live tenant registration | PASS | Created tenant `pressure_1776097948_15161` with `tenant_id` `ab48011d-6a18-4092-bbd5-010820fa227c`. |
| 2026-04-13 | Auth and protected-route probe | PASS | Valid token worked on `/api/user/me`, `/api/describe`, and `/api/data/users/:id`. |
| 2026-04-13 | Sudo escalation probe | PASS | `POST /api/user/sudo` succeeded and returned a 15-minute sudo token. |
| 2026-04-13 | User-listing probe | FAIL | `GET /api/user` returns `FILTER_INVALID_ORDER_SPEC` even for sudo/root callers. Tracked in GitHub issue #246. |
| 2026-04-13 | Collection read probe | FAIL | `GET /api/data/:model` behaved inconsistently; plain GET and query variants did not agree. Tracked in GitHub issue #247. |
| 2026-04-13 | UUID/user-id probe | FAIL | `GET /api/user/:id` returns a raw UUID parse error for non-UUID identifiers. Tracked in GitHub issue #248. |
| 2026-04-13 | Secret exposure probe | FAIL | `/api/data/credentials` exposes password/API key hashes. Tracked in GitHub issue #249. |

## Tenant / Session

- Tenant name: `pressure_1776097948_15161`
- Tenant ID: `ab48011d-6a18-4092-bbd5-010820fa227c`
- Username: `root`
- Token stored: yes
- Public endpoint: `https://monk-api-production.up.railway.app`

## Live API Probes

### Registration

- [x] Create private tenant
- [x] Verify token works on protected routes
- [ ] Confirm tenant isolation

### Pressure Tests

- [x] Malformed bodies
- [ ] Oversized payloads
- [x] Boundary values
- [x] Auth bypass attempts
- [x] Cross-tenant access attempts
- [x] Unexpected format / header combinations
- [x] Error disclosure / stack trace leakage

## Findings

- `GET /api/user` is broken in production for valid sudo/root callers: the route emits `FILTER_INVALID_ORDER_SPEC` before returning any users.
- `GET /api/data/:model` is inconsistent in production: plain collection reads and query-string variants do not agree, and some calls returned `[]`, `{}`, or 500s.
- `GET /api/user/:id` leaks raw UUID parse errors when given non-UUID identifiers.
- `/api/data/credentials` exposes secret credential material to the generic data surface.
- `POST /auth/register` correctly rejects malformed JSON and duplicate tenant names without stack traces.
- `GET /api/user/me`, `POST /api/user/sudo`, `POST /api/user/me/keys`, `POST /api/user/:id/password`, `POST /api/trashed/:model`, `POST /api/acls/:model/:id`, and `POST /api/bulk` all behaved coherently on the fresh tenant and valid user contexts.
- `DELETE /api/user/me` successfully soft-deleted the root user on one tenant, which then invalidated the token as expected.

## Issues Filed

- #246 — `GET /api/user` always fails with `FILTER_INVALID_ORDER_SPEC`
- #247 — `GET /api/data/:model returns empty or ignores filters in production`
- #248 — `GET /api/user/:id returns 500 on non-UUID identifiers`
- #249 — `/api/data/credentials exposes API key hashes in production`

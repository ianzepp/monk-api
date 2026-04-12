# Correctness Swarm Tracking

Source: read-only correctness swarm run during project reactivation.

Mode: read-only review. No files were changed during the swarm.

Purpose: track confirmed correctness defects and hand them to delivery orchestration as parallel-safe repair work.

## Severity Key

- **Critical**: auth/data isolation escape, security boundary failure, or direct production hazard.
- **High**: confirmed broken behavior on real routes or shared infrastructure.
- **Medium**: confirmed correctness break with narrower blast radius or contract drift.
- **Low**: plausible edge risk or maintenance gap that can hide future defects.

## Tracking Table

| ID | Severity | Status | Domain | Finding | Primary Files | Fix Shape |
|----|----------|--------|--------|---------|---------------|-----------|
| CS-001 | Critical | Open | MCP/Auth | MCP defaults missing `mcp-session-id` to shared `"default"` session, leaking cached auth/agent state across clients. | `src/servers/mcp.ts`, `src/lib/mcp/session.ts`, `src/lib/tty/headless.ts` | Require explicit session IDs, bind sessions to identity, expire/clear MCP and headless sessions. |
| CS-002 | Critical | Open | VFS/Security | Local filesystem mount confinement uses raw `startsWith(basePath)`, allowing prefix-collision escapes such as `/tmp/base2`. | `src/lib/fs/mounts/local-mount.ts` | Use path-boundary checks with `relative()` or `resolved === base || resolved.startsWith(base + sep)` for all real-path checks. |
| CS-003 | High | Open | Auth/User | `POST /api/user/sudo` returns tokens missing required DB/namespace claims because it reads nonexistent context fields. | `src/routes/api/user/sudo/POST.ts`, `src/lib/middleware/auth-validator.ts` | Build sudo token from `systemInit` or `jwtPayload`; add a test that uses returned token on a protected sudo route. |
| CS-004 | High | Open | Auth/User | `POST /api/user/fake` reads `context.get('db')`, which is never set, so root impersonation 500s. | `src/routes/api/user/fake/POST.ts`, `src/lib/middleware/auth-validator.ts` | Use transaction/system database access or the actual `database` context key. |
| CS-005 | High | Open | Observers | Observer runner continues after ring 5 database failures, so later rings can mutate cache/side effects for rolled-back writes. | `src/lib/observers/runner.ts`, `src/lib/database/pipeline.ts`, `src/observers/fields/8/50-field-cache-invalidator.ts` | Short-circuit later rings for a record after database-ring failure. |
| CS-006 | High | Open | Infrastructure | Tenant creation is not atomic and can leave orphaned schema/database state under parallel creates. | `src/lib/infrastructure.ts`, `src/lib/sql/monk.pg.sql` | Use tenant-name advisory lock or pending registry row; clean up provisioned resources on all later failures. |
| CS-007 | High | Open | Import/Export | Bulk import `replace` soft-deletes existing rows, so replacing same IDs can hit duplicates or leave trashed duplicates. | `src/lib/database/import.ts`, `src/lib/database/mutate.ts` | Use hard delete/expire for replace, or import into a clean tenant/schema. |
| CS-008 | High | Open | Model Lifecycle | Model-level `immutable=true` is documented but not enforced at runtime. | `src/routes/api/data/PUBLIC.md`, `src/lib/model.ts`, `src/observers/registry.ts` | Carry `immutable` in model metadata and add model-level immutability validation for update/delete. |
| CS-009 | High | Open | Routing | Documented `PATCH /api/data/:model` behavior is implemented in handler but not registered on the HTTP server. | `src/servers/http.ts`, `src/routes/api/data/:model/PUT.ts`, `src/routes/api/data/PUBLIC.md` | Register PATCH route or split a real PATCH handler and align docs/tests. |
| CS-010 | High | Open | Bindings | TypeScript auth/file bindings call stale routes (`/api/auth/*`, `/api/file/*`) that the server does not expose. | `packages/bindings/src/api/auth.ts`, `packages/bindings/src/api/file.ts`, `src/servers/http.ts`, `src/routes/fs/routes.ts` | Update bindings to real routes or add compatibility aliases. |
| CS-011 | High | Open | Model Records | `ModelRecord.get()` collapses explicit `null` into “missing” via `??`, so clearing values can read old values. | `src/lib/model-record.ts`, `src/observers/all/1/40-data-validator.ts`, `src/observers/fields/6/10-field-ddl-update.ts` | Check key presence, not nullishness, when merging current/original values. |
| CS-012 | Medium | Open | Observers | Field sudo validation scans merged records, so unchanged sudo-protected fields block unrelated updates. | `src/observers/all/1/25-field-sudo-validator.ts` | On update, inspect only changed fields or `record.diff()`; keep full-object scan for create. |
| CS-013 | Medium | Open | Response Pipeline | Encryption may silently return plaintext and can corrupt binary formatter output by converting bytes to text first. | `src/lib/middleware/response-transformer.ts` | Fail closed when encryption is requested; encrypt raw bytes or reject binary formats with encryption. |
| CS-014 | Medium | Open | Agent | `/api/agent` advertises JSONL streaming but buffers the whole run before yielding events. | `src/routes/api/agent/POST.ts`, `src/lib/tty/headless.ts` | Yield agent events incrementally or remove streaming contract. |
| CS-015 | Medium | Open | Cron | Cron parser accepts invalid/pathological expressions such as step `0`, which can infinite-loop. | `src/lib/crontab.ts` | Validate finite numeric fields, bounds, and `step > 0`. |
| CS-016 | Medium | Open | Auth/API Validation | Empty POST bodies on auth/user write routes can throw runtime errors instead of documented validation responses. | `src/lib/middleware/body-parser.ts`, `src/routes/auth/*`, `src/routes/api/user/*` | Normalize empty bodies or add route-local object guards before dereference. |
| CS-017 | Medium | Open | Token Refresh | `/auth/refresh` claims expired-token refresh but plain JWT verification rejects expired tokens. | `src/routes/auth/refresh/POST.ts`, `src/routes/auth/refresh/POST.md`, `spec/30-auth-api/refresh.test.ts` | Either implement ignore-expiry signature validation or change contract/tests/docs to reject expired tokens. |
| CS-018 | Medium | Open | App Packages | Todos emits unsupported `where[parent_id][is]=null` filter syntax. | `packages/todos/src/index.ts`, `src/lib/filter-types.ts`, `src/lib/filter-where.ts` | Use supported `$null` / `$exists` syntax or add a deliberate alias. |
| CS-019 | Medium | Open | OpenAPI | OpenAPI app maps only a subset of field types, misrepresenting JSON/binary/array fields. | `packages/openapi/src/index.ts`, `src/lib/field-types.ts` | Map the full user-facing field type set, including arrays and binary/json variants. |
| CS-020 | Medium | Open | Formatters | Missing optional formatter errors can be returned with route success status. | `src/lib/middleware/response-transformer.ts` | Surface formatter-missing as real 400/415 before response finalization. |
| CS-021 | Medium | Open | Database | `DatabaseConnection.healthCheck()` can leak a client if the health query throws after acquisition. | `src/lib/database-connection.ts` | Release clients in `finally`. |
| CS-022 | Low | Open | Query | Aggregate `groupBy` sanitizes invalid names instead of rejecting them, risking wrong-column queries. | `src/lib/filter-sql-generator.ts` | Validate identifiers with the same field-name policy used elsewhere. |
| CS-023 | Low | Open | TTY Lifecycle | AI session state is not consistently saved/cleaned up on Telnet/SSH disconnect. | `src/lib/tty/session-handler.ts`, `src/servers/telnet.ts`, `src/servers/ssh.ts` | Add one transport-close finalizer that saves and cleans AI state. |
| CS-024 | Low | Open | Grid App | Grid parser only handles single-letter columns and lexicographic comparisons; this breaks if grids expand past `Z`. | `packages/grids/src/range-parser.ts`, `packages/grids/models/grids.yaml` | Keep `Z` constraint explicit or implement base-26 column parsing/comparison before widening. |
| CS-025 | Low | Open | Test/CI | CI appears to compile only; runtime correctness suites are not enforced. | `.github/workflows/*`, `package.json`, `spec/README.md` | Add targeted runtime smoke workflow before broad test matrix expansion. |

## Coverage Gaps To Close

- No dedicated specs for MCP session isolation.
- No local-mount prefix-collision test.
- No `/api/agent` streaming/cancellation tests.
- No cron parser edge-case tests.
- No sudo-token usability test.
- No fake-user impersonation route test.
- Several skipped model lifecycle tests cover paths involved in these findings.

## Delivery Orchestration Handoff

### Interpreted Problem

The reactivated project has a strong API/runtime surface, but the correctness swarm found defects in shared safety boundaries: auth/session identity, filesystem confinement, observer write lifecycle, tenant provisioning, route/binding contracts, and response serialization.

The actual delivery problem is not one bug. It is a correctness stabilization wave that must fix high-blast-radius invariants first, then align route contracts and coverage so future changes do not regress them.

### Normalized Spec

Functional requirements:

- Repair all Critical and High findings in `CS-001` through `CS-011`.
- Repair Medium findings that are small and local during the same workstream when they share files with High fixes.
- Add regression coverage for each fixed Critical/High issue.
- Keep the public contract explicit: if behavior changes, update route docs, bindings, and root discovery where applicable.
- Do not add dependencies unless a fix cannot be made safely with existing stack primitives.

Technical constraints:

- Runtime is Bun + TypeScript + Hono.
- Tests require `spec/README.md` workflow knowledge before execution.
- Local PostgreSQL is Docker-only for development on port `55432`.
- Railway deployment uses managed Postgres and should not use local compose configuration.
- Existing user changes must not be reverted.

### Repo-Aware Baseline

Hard gates:

- `bun run build`
- `bun run build:spec`
- Targeted `bun run test:ts` subsets for changed surfaces, then full `bun run test:ts` before release readiness.

Architecture discovery:

- Auth middleware populates `jwtPayload`, `systemInit`, `user`, `database`, `dbName`, and `nsName`.
- Tenant-scoped mutations go through `withTransaction()` and observer rings.
- App packages are lazy-loaded under `/app/:appName/*`.
- MCP currently runs as a standalone server with file-backed session cache.
- TTY/agent/filesystem code shares session and virtual filesystem primitives.

Tradeoffs accepted:

- Do not redesign MCP around OAuth in this wave; first fix shared-session leakage.
- Do not redesign tenant provisioning wholesale; first add locking/cleanup that makes the current flow safe.
- Do not broaden grid columns past `Z` unless the range parser is upgraded in the same change.

Scope boundaries:

- This wave fixes correctness defects; no dependency updates, visual/frontend work, or Railway topology changes.
- MCP public `/mcp` hosting remains a separate feature after session safety is fixed.

### Stage Graph

1. **Contract Freeze**
   - Inputs: this tracking doc, current README, route docs, bindings.
   - Outputs: agreed behavior for auth/session, filesystem confinement, data route contracts, import replace semantics, and encryption failure semantics.
   - Verification: no code yet; review decisions for compatibility and security.

2. **Security Boundary Repairs**
   - Depends on: Contract Freeze.
   - Outputs: fixes for CS-001, CS-002, CS-003, CS-004, CS-013.
   - Verification: targeted tests for MCP session isolation, local mount escape, sudo token usability, fake impersonation, and encryption fail-closed behavior.

3. **Data Integrity And Observer Repairs**
   - Depends on: Contract Freeze.
   - Outputs: fixes for CS-005, CS-006, CS-007, CS-008, CS-011, CS-012, CS-021, CS-022.
   - Verification: targeted observer/model/import/tenant tests plus build/spec type checks.

4. **Route, Package, And Protocol Alignment**
   - Depends on: Contract Freeze.
   - Outputs: fixes for CS-009, CS-010, CS-014, CS-018, CS-019, CS-020, CS-024.
   - Verification: bindings route tests, package app tests, formatter tests, agent streaming contract tests.

5. **Cron And Validation Hardening**
   - Depends on: Contract Freeze.
   - Outputs: fixes for CS-015, CS-016, CS-017, CS-023.
   - Verification: auth empty-body tests, refresh contract tests, cron parser tests, TTY disconnect lifecycle tests where practical.

6. **Integration And CI Coverage**
   - Depends on: stages 2-5.
   - Outputs: runtime smoke workflow and unskipped/covered critical lifecycle tests.
   - Verification: `bun run build`, `bun run build:spec`, full `bun run test:ts`, CI smoke workflow.

### Epic Candidates And Scopable Issues

#### Epic A: Security Boundary Repairs

Purpose: close direct identity/session/filesystem boundary failures.

Primary surface area: MCP, local mounts, sudo/fake auth routes, encryption.

Parallelization notes: can run independently from observer/data work except shared auth tests.

Issues:

- **A1: Isolate MCP sessions**
  - Covers: CS-001.
  - Acceptance: requests without session ID cannot reuse cached auth; two session IDs cannot observe each other's auth state; headless agent session key includes authenticated identity.

- **A2: Harden LocalMount confinement**
  - Covers: CS-002.
  - Acceptance: `/tmp/base2` and symlink sibling escapes are denied; existing traversal tests still pass.

- **A3: Fix sudo and fake token flows**
  - Covers: CS-003, CS-004.
  - Acceptance: sudo token can perform one sudo-protected operation; fake token can authenticate as target user; non-root fake attempt remains forbidden.

- **A4: Make requested encryption fail closed**
  - Covers: CS-013.
  - Acceptance: `?encrypt=pgp` never returns plaintext on encryption failure; binary formats are either byte-safe or rejected with non-2xx status.

#### Epic B: Data Integrity And Observer Lifecycle

Purpose: make model mutations, imports, and tenant provisioning preserve invariants.

Primary surface area: `src/lib/model-record.ts`, observer runner, infrastructure, import/export.

Issues:

- **B1: Preserve explicit null in model records**
  - Covers: CS-011.
  - Acceptance: updating a field to `null` is visible to validators and SQL/update/default observers.

- **B2: Short-circuit post-db observers after write failure**
  - Covers: CS-005.
  - Acceptance: a ring 5 failure prevents rings 6-9 for that record.

- **B3: Fix field and model immutability/sudo enforcement**
  - Covers: CS-008, CS-012.
  - Acceptance: model immutable blocks update/delete as documented; unchanged sudo fields do not block unrelated updates.

- **B4: Make tenant creation race-safe**
  - Covers: CS-006.
  - Acceptance: parallel duplicate tenant creates leave no orphan schema/db and one clean conflict response.

- **B5: Make import replace destructive or isolated**
  - Covers: CS-007.
  - Acceptance: replace with same IDs does not duplicate or fail due to soft-deleted old rows.

- **B6: Close DB correctness edges**
  - Covers: CS-021, CS-022.
  - Acceptance: health check releases clients on all paths; invalid aggregate group names are rejected.

#### Epic C: Route And Package Contract Alignment

Purpose: align implemented routes, docs, packages, bindings, and response status behavior.

Primary surface area: HTTP server, bindings package, app packages, formatter middleware.

Issues:

- **C1: Register or remove PATCH data contract**
  - Covers: CS-009.
  - Acceptance: documented PATCH request works or docs/bindings no longer advertise it.

- **C2: Update TypeScript bindings to live routes**
  - Covers: CS-010.
  - Acceptance: auth/file binding methods hit server routes that exist.

- **C3: Fix formatter error statuses**
  - Covers: CS-020.
  - Acceptance: unavailable formatter returns non-2xx status.

- **C4: Align app package protocols**
  - Covers: CS-018, CS-019, CS-024.
  - Acceptance: todos uses supported filters; OpenAPI maps supported field types; grid column limits are explicit or parser is widened safely.

- **C5: Fix or revise agent streaming contract**
  - Covers: CS-014.
  - Acceptance: JSONL emits incrementally, or endpoint docs and response mode stop claiming streaming.

#### Epic D: Validation, Cron, TTY, And CI Coverage

Purpose: close correctness gaps that turn bad input or missing coverage into production surprises.

Primary surface area: auth/user routes, body parsing, cron parser, TTY close lifecycle, CI.

Issues:

- **D1: Normalize empty-body validation**
  - Covers: CS-016.
  - Acceptance: empty POST bodies return documented 400s on auth/user write routes.

- **D2: Resolve refresh expired-token contract**
  - Covers: CS-017.
  - Acceptance: implementation, docs, and tests agree on whether expired tokens can be refreshed.

- **D3: Harden cron parser**
  - Covers: CS-015.
  - Acceptance: invalid bounds and step zero are rejected quickly.

- **D4: Finalize TTY AI session cleanup**
  - Covers: CS-023.
  - Acceptance: transport close saves/cleans AI state or logs failure.

- **D5: Add runtime correctness CI smoke**
  - Covers: CS-025.
  - Acceptance: CI runs at least a targeted Bun runtime suite in addition to build/type checks.

### Checkpoints

#### Contract Freeze

Purpose: decide semantics before code changes.

Required inputs:

- This tracking doc.
- Route docs for auth, data, formatters, MCP/agent if touched.
- Current bindings method inventory.

Merge criteria:

- Each Critical/High finding has a named owner issue.
- Behavior choices are explicit for refresh expiry, import replace, PATCH, encryption, and MCP sessions.

Blocks until met:

- Security Boundary Repairs.
- Data Integrity And Observer Repairs.
- Route And Package Contract Alignment.

Companion skills:

- `carmack-linus`
- `gate-check`

#### Foundation Merge

Purpose: land shared invariants before dependent work.

Required inputs:

- CS-001, CS-002, CS-003, CS-004, CS-005, CS-011 fixes.

Merge criteria:

- New regression tests exist for each fixed boundary.
- `bun run build` and targeted tests pass.

Companion skills:

- `correctness`
- `bonsai`
- `gate-check`

#### Integration Checkpoint

Purpose: make routes/packages/docs agree after independent workstreams.

Required inputs:

- Epics A-C merged.
- Route docs and bindings updated for changed contracts.

Merge criteria:

- `bun run build`
- `bun run build:spec`
- Relevant package/app tests pass.

Companion skills:

- `housekeeping`
- `gate-check`

#### Release Readiness

Purpose: decide whether the correctness wave is safe to deploy.

Required inputs:

- All Critical/High findings closed or explicitly deferred by the user.
- CI smoke workflow in place.
- Full runtime suite run locally or in CI.

Merge criteria:

- `bun run build`
- `bun run build:spec`
- `bun run test:ts`
- No open Critical/High item without explicit deferral.

Companion skills:

- `correctness swarm`
- `housekeeping`
- `gate-check`

## Gate Plan

- **Gate 1: Contract Freeze** - pass only when behavior choices are explicit and issue scopes are disjoint.
- **Gate 2: Foundation Merge** - pass only when shared auth/session/filesystem/model-record/observer invariants are fixed and tested.
- **Gate 3: Integration Checkpoint** - pass only when route docs, bindings, app packages, and formatter statuses agree with implementation.
- **Gate 4: Release Readiness** - pass only when runtime tests and CI smoke cover the repaired high-risk surfaces.

## Open Questions

- Should `/auth/refresh` support expired-but-signature-valid tokens, or should docs be corrected to require unexpired tokens?
- Should import `replace` hard-delete in place, or should it create a new clean tenant/schema and swap?
- Should MCP remain standalone-only for now, or should `/mcp` be added after CS-001 is fixed?
- Should binary formatter encryption be supported byte-for-byte, or explicitly rejected?
- Should `PATCH /api/data/:model` remain part of the public API?

# SQLite Backend Support Plan

## Overview

Add SQLite as an alternative database backend alongside PostgreSQL. Each tenant specifies a `db_type` ('postgresql' or 'sqlite') that determines how `db` and `ns` fields are interpreted:

| Field | PostgreSQL | SQLite |
|-------|-----------|--------|
| `db` | Database name | Directory |
| `ns` | Schema name | Filename |
| Path | `SET search_path TO {ns}` | `/data/{db}/{ns}.db` |

The PostgreSQL system database (`monk`) remains for tenant registry and auth. Individual tenants can use either backend.

---

## Phase 1: Database Adapter Interface ✓

**Status**: Complete (commit 210f7b2)

**Goal**: Create abstraction layer without changing existing behavior.

### 1.1 Create adapter interface

**File**: `/src/lib/database/adapter.ts`

```typescript
export interface DatabaseAdapter {
  // Connection lifecycle
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // Query execution
  query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>>;

  // Transaction support
  beginTransaction(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;

  // Metadata
  getType(): 'postgresql' | 'sqlite';
}

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
}
```

### 1.2 Wrap existing PostgreSQL logic

**File**: `/src/lib/database/postgres-adapter.ts`

- Wrap existing `pg.Pool` and `pg.Client` usage
- Implement `DatabaseAdapter` interface
- No behavior changes, just encapsulation

### 1.3 Create SQLite adapter stub

**File**: `/src/lib/database/sqlite-adapter.ts`

- Use `better-sqlite3` (synchronous, faster) or `sql.js` (WASM, portable)
- Implement same interface
- Initially throw "not implemented" for complex operations

### 1.4 Add adapter factory

**File**: `/src/lib/database/index.ts`

```typescript
export function createAdapter(dbType: string, db: string, ns: string): DatabaseAdapter {
  if (dbType === 'sqlite') {
    const path = join(SQLITE_DATA_DIR, db, `${ns}.db`);
    return new SqliteAdapter(path);
  }
  return new PostgresAdapter(db, ns);
}
```

---

## Phase 2: Tenant Schema Update ✓

**Status**: Complete (commit e7ebeb6)

**Goal**: Add `db_type` field to tenant system.

### 2.1 Update tenant registration

**File**: `/src/routes/auth/register/POST.ts`

- Add optional `db_type` parameter (default: 'postgresql')
- Validate `db_type` is 'postgresql' or 'sqlite'
- For SQLite: create directory and empty `.db` file instead of schema

### 2.2 Update JWT payload

**File**: `/src/lib/middleware/jwt-validation.ts`

- Include `db_type` in JWT claims
- Read from tenant record during login

### 2.3 Update namespace manager

**File**: `/src/lib/namespace-manager.ts`

- `createNamespace()`: If sqlite, create directory + file instead of schema
- `dropNamespace()`: If sqlite, delete file
- `namespaceExists()`: If sqlite, check file exists

**Future refactor**: Consider splitting `NamespaceManager` into `PostgresNamespaceManager` and `SqliteNamespaceManager` classes if the conditional logic grows more complex. Currently uses inline conditionals which is sufficient for the basic operations.

---

## Phase 3: System Context Integration ✓

**Status**: Complete

**Goal**: Use adapter based on JWT `db_type`.

### 3.1 Update SystemContext

**File**: `/src/lib/middleware/system-context.ts`

```typescript
// Current: Always PostgreSQL
const pool = await DatabaseConnection.getPool(db);
await pool.query(`SET search_path TO "${ns}"`);

// New: Choose adapter based on db_type
const adapter = createAdapter(jwt.db_type, jwt.db, jwt.ns);
context.set('database', adapter);
```

### 3.2 Update database access patterns

The `system.database` object currently exposes:
- `selectAny()`, `select404()`
- `createOne()`, `createMany()`
- `updateOne()`, `updateMany()`
- `deleteOne()`, `deleteMany()`
- `query()` (raw SQL)

These methods need to use the adapter instead of direct pool access.

---

## Phase 4: Observer Adapter Filtering ✓

**Status**: Complete

**Goal**: Allow observers to declare which database adapters they support.

### 4.1 Add `adapters` field to observer interface

**File**: `/src/lib/observers/types.ts`

```typescript
export interface Observer {
  ring: number;
  operation: 'create' | 'update' | 'delete' | 'revert';
  model?: string;
  adapters?: ('postgresql' | 'sqlite')[];  // ← NEW: If omitted, runs on all
  handler: ObserverHandler;
}
```

### 4.2 Update observer runner

**File**: `/src/lib/observers/observer-runner.ts`

```typescript
function shouldRunObserver(observer: Observer, adapter: DatabaseAdapter): boolean {
  // No adapters specified = runs on all adapters
  if (!observer.adapters || observer.adapters.length === 0) {
    return true;
  }
  return observer.adapters.includes(adapter.getType());
}

// In the execution loop:
for (const observer of observers) {
  if (!shouldRunObserver(observer, context.adapter)) {
    continue;  // Skip this observer for this adapter
  }
  await observer.handler(context, record);
}
```

### 4.3 Create adapter-specific observers

Instead of dialect switching inside observers, create separate files:

**PostgreSQL CRUD observers** (existing, add `adapters` flag):
```typescript
// /src/observers/all/5/50-sql-create-observer.ts
export default {
  ring: 5,
  operation: 'create',
  adapters: ['postgresql'],  // ← Only PostgreSQL
  async handler(context, record) {
    // Uses RETURNING *
    const sql = `INSERT INTO ... RETURNING *`;
  }
}
```

**SQLite CRUD observers** (new):
```typescript
// /src/observers/all/5/50-sql-create-observer-sqlite.ts
export default {
  ring: 5,
  operation: 'create',
  adapters: ['sqlite'],  // ← Only SQLite
  async handler(context, record) {
    // INSERT then SELECT with last_insert_rowid()
    await context.query(`INSERT INTO ...`);
    const result = await context.query(
      `SELECT * FROM ... WHERE rowid = last_insert_rowid()`
    );
  }
}
```

### 4.4 Observer adapter matrix

| Observer | PostgreSQL | SQLite | Notes |
|----------|-----------|--------|-------|
| `sql-create-observer` | ✓ | ✗ | Uses `RETURNING *` |
| `sql-create-observer-sqlite` | ✗ | ✓ | Uses `last_insert_rowid()` |
| `sql-update-observer` | ✓ | ✗ | Uses `RETURNING *` |
| `sql-update-observer-sqlite` | ✗ | ✓ | UPDATE then SELECT |
| `sql-delete-observer` | ✓ | ✓ | No RETURNING needed |
| `sql-access-observer` | ✓ | ✗ | Uses `uuid[] && ARRAY[...]` |
| `sql-access-observer-sqlite` | ✗ | ✓ | Uses `json_each()` |
| `history-tracker` | ✓ | ✓ | Works on both (no adapter flag) |
| `transform-processor` | ✓ | ✓ | Works on both |
| `data-validator` | ✓ | ✓ | Works on both |

### 4.5 Disable unsupported features

Some features may not be available on SQLite:

```typescript
// /src/observers/all/8/50-fts-indexer.ts (future)
export default {
  ring: 8,
  operation: 'create',
  adapters: ['postgresql'],  // ← PostgreSQL only, uses tsvector
  async handler(context, record) { ... }
}
```

---

## Phase 5: SQL Dialect Helpers

**Goal**: Provide utilities for dialect-specific SQL generation.

### 5.1 Type mappings

| PostgreSQL | SQLite | Notes |
|------------|--------|-------|
| `uuid` | `TEXT` | 36-char string |
| `uuid[]` | `TEXT` | JSON array |
| `jsonb` | `TEXT` | JSON string |
| `timestamp` | `TEXT` | ISO 8601 string |
| `boolean` | `INTEGER` | 0 or 1 |
| `numeric` | `REAL` | |

**File**: `/src/lib/database/type-mappings.ts`

### 5.2 DDL generation per adapter

**PostgreSQL DDL** (existing, add adapter flag):
```typescript
// /src/observers/models/6/10-ddl-create.ts
export default {
  adapters: ['postgresql'],
  async handler(context, record) {
    // CREATE TABLE with uuid, uuid[], jsonb types
  }
}
```

**SQLite DDL** (new):
```typescript
// /src/observers/models/6/10-ddl-create-sqlite.ts
export default {
  adapters: ['sqlite'],
  async handler(context, record) {
    // CREATE TABLE with TEXT for uuid, json arrays
  }
}
```

### 5.3 Array handling in SQLite

**File**: `/src/lib/observers/sql-utils-sqlite.ts`

```typescript
// Store arrays as JSON text
export function formatArrayForSqlite(arr: string[]): string {
  return JSON.stringify(arr);
}

// Query arrays with json_each()
export function buildArrayContainsQuery(field: string, value: string): string {
  return `EXISTS (SELECT 1 FROM json_each(${field}) WHERE value = ?)`;
}
```

---

## Phase 6: Filter Query Abstraction

**Goal**: Generate correct SQL for both dialects.

### 6.1 Operator Support Matrix

| Operator | PostgreSQL | SQLite | SQLite Implementation |
|----------|-----------|--------|----------------------|
| **Comparison** |
| `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte` | ✓ | ✓ | Same syntax |
| `$in`, `$nin` | ✓ | ✓ | Same syntax |
| `$between` | ✓ | ✓ | Same syntax |
| `$null`, `$exists` | ✓ | ✓ | Same syntax |
| **String** |
| `$like`, `$nlike` | ✓ | ✓ | Same syntax |
| `$ilike`, `$nilike` | ✓ | ✓ | `LIKE ... COLLATE NOCASE` |
| `$regex`, `$nregex` | ✓ | ✓ | Register JS `regexp()` function |
| `$find`, `$text` | ✓ | ✓ | `LIKE %...% COLLATE NOCASE` |
| `$search` | ✓ | ❌ | Throw error (requires tsvector) |
| **Array** |
| `$any`, `$all`, `$nany`, `$nall` | ✓ | ❌ | Throw error (ACLs disabled) |
| `$size` | ✓ | ⚠️ | `json_array_length()` |
| **Logical** |
| `$and`, `$or`, `$not`, `$nand`, `$nor` | ✓ | ✓ | Same syntax |

**Coverage**: PostgreSQL 30/30, SQLite 25/30 (83%)

### 6.2 SQLite REGEXP Setup

Register JavaScript regex function during connection:

```typescript
// In SqliteAdapter.connect()
this.db.function('regexp', (pattern: string, value: string) => {
  return new RegExp(pattern).test(value) ? 1 : 0;
});
```

### 6.3 Operator Implementation

**File**: `/src/lib/filter-where.ts`

```typescript
case FilterOp.ILIKE:
  if (adapter.getType() === 'sqlite') {
    return `${quotedField} LIKE ${this.PARAM(data)} COLLATE NOCASE`;
  }
  return `${quotedField} ILIKE ${this.PARAM(data)}`;

case FilterOp.REGEX:
  if (adapter.getType() === 'sqlite') {
    return `regexp(${this.PARAM(data)}, ${quotedField})`;
  }
  return `${quotedField} ~ ${this.PARAM(data)}`;

case FilterOp.SEARCH:
  if (adapter.getType() === 'sqlite') {
    throw HttpErrors.badRequest('$search operator not supported on SQLite');
  }
  return `to_tsvector('english', ${quotedField}) @@ plainto_tsquery(...)`;

case FilterOp.ANY:
case FilterOp.ALL:
  if (adapter.getType() === 'sqlite') {
    throw HttpErrors.badRequest('Array operators not supported on SQLite');
  }
  // PostgreSQL array syntax...
```

### 6.4 Unsupported Operators

For SQLite, these throw clear errors:

| Operator | Error Message |
|----------|--------------|
| `$search` | `$search operator not supported on SQLite (requires PostgreSQL full-text search)` |
| `$any`, `$all`, `$nany`, `$nall` | `Array operators not supported on SQLite` |

---

## Phase 7: Testing Infrastructure

**Goal**: Run same tests against both backends.

### 7.1 Test configuration

```typescript
// test/setup.ts
const DB_TYPES = (process.env.TEST_DB_TYPES || 'postgresql').split(',');

export function describeForAllDbTypes(name: string, fn: (dbType: string) => void) {
  for (const dbType of DB_TYPES) {
    describe(`${name} [${dbType}]`, () => fn(dbType));
  }
}
```

### 7.2 Test tenant factory

```typescript
export async function createTestTenant(dbType: 'postgresql' | 'sqlite') {
  const name = `test-${Date.now()}`;
  await api.post('/auth/register', {
    tenant: name,
    db_type: dbType
  });
  return name;
}
```

### 7.3 CI matrix

```yaml
# .github/workflows/test.yml
jobs:
  test:
    strategy:
      matrix:
        db_type: [postgresql, sqlite]
    env:
      TEST_DB_TYPES: ${{ matrix.db_type }}
```

---

## Phase 8: Export/Import Simplification

**Goal**: Leverage SQLite tenants for export/import.

### 8.1 Export (SQLite tenant)

For SQLite tenants, "export" is just copying the file:

```typescript
// GET /api/extracts/:id/download
if (jwt.db_type === 'sqlite') {
  const path = `/data/${jwt.db}/${jwt.ns}.db`;
  return c.file(path, 'backup.db');
}
```

### 8.2 Import (into SQLite tenant)

For SQLite tenants, "import" is receiving and registering a file:

```typescript
// POST /api/restores/:id/upload
if (jwt.db_type === 'sqlite') {
  const uploadPath = `/data/${jwt.db}/${jwt.ns}.db`;
  await saveUploadedFile(uploadPath);
  // Done - the file IS the database
}
```

### 8.3 Cross-backend sync

For PostgreSQL → SQLite export or SQLite → PostgreSQL import:

```typescript
async function syncTenants(source: DatabaseAdapter, target: DatabaseAdapter) {
  const models = await source.query('SELECT * FROM models');
  for (const model of models.rows) {
    await target.query(generateInsert('models', model));

    const records = await source.query(`SELECT * FROM "${model.model_name}"`);
    for (const record of records.rows) {
      await target.query(generateInsert(model.model_name, record));
    }
  }
}
```

---

## Phase 9: Snapshots & Sandboxes as SQLite

**Goal**: Replace PostgreSQL-based snapshots with SQLite files for portability and simplicity.

### 9.1 Current vs Proposed

| Aspect | Current (PostgreSQL) | Proposed (SQLite) |
|--------|---------------------|-------------------|
| Storage | Full PG database | Single `.db` file |
| Create | `pg_dump` (slow, heavy) | Stream rows (fast, light) |
| Portability | None | Downloadable file |
| Restore | `pg_restore` | Import from SQLite |
| Cleanup | `DROP DATABASE` | Delete file |
| Infrastructure | Requires PostgreSQL | None |

### 9.2 Snapshot Flow

```
POST /api/snapshots
  → Create SQLite file from current PostgreSQL tenant
  → Store at /data/snapshots/{tenant}-{timestamp}.db
  → Record in snapshots table with db_type='sqlite', db_path='...'

GET /api/snapshots/:id/download
  → Return the .db file directly

DELETE /api/snapshots/:id
  → Delete the .db file
```

### 9.3 Sandbox Flow

```
POST /api/sandboxes
  → body: { source: 'snapshot_id' } or { source: 'current' }
  → Create SQLite tenant from snapshot or current tenant
  → Register as temporary tenant with db_type='sqlite'
  → Return sandbox tenant credentials

# User experiments via normal API (root mode, no ACLs)

POST /api/sandboxes/:id/graduate
  → Create new PostgreSQL tenant from sandbox SQLite
  → Delete sandbox

DELETE /api/sandboxes/:id
  → Just delete the .db file
```

### 9.4 Benefits

1. **Portable backups** - Download your snapshot as a file
2. **Fast sandboxes** - No PostgreSQL DDL overhead
3. **Cheap experimentation** - SQLite files are disposable
4. **Offline access** - Work with snapshot locally
5. **Simple cleanup** - Delete file, done

### 9.5 Implementation

**Update snapshot processor**:
```typescript
// /src/observers/snapshots/8/50-snapshot-processor.ts
export default {
  adapters: ['postgresql'],  // Only snapshot FROM PostgreSQL tenants
  async handler(context, record) {
    // Stream all models/records to SQLite file
    const sqliteFile = `/data/snapshots/${record.name}.db`;
    await syncTenantToSqlite(context.system, sqliteFile);

    await context.system.database.updateOne('snapshots', record.id, {
      status: 'active',
      db_type: 'sqlite',
      db_path: sqliteFile
    });
  }
}
```

**New sandbox routes**:
- `POST /api/sandboxes` - Create sandbox from snapshot/current
- `GET /api/sandboxes/:id` - Get sandbox info
- `POST /api/sandboxes/:id/graduate` - Promote to PostgreSQL tenant
- `DELETE /api/sandboxes/:id` - Delete sandbox

---

## Implementation Order

| Phase | Description | Effort | Dependencies | Risk |
|-------|-------------|--------|--------------|------|
| 1 | Adapter Interface | 3-4 days | None | Low |
| 2 | Tenant Schema (`db_type`) | 1-2 days | Phase 1 | Low |
| 3 | System Context Integration | 2-3 days | Phase 1, 2 | Medium |
| 4 | Observer Adapter Filtering | 2-3 days | Phase 1, 3 | Low |
| 5 | SQL Dialect Helpers | 3-4 days | Phase 4 | Medium |
| 6 | Filter Query Abstraction | 3-5 days | Phase 5 | High |
| 7 | Testing Infrastructure | 2-3 days | Phase 1-6 | Low |
| 8 | Export/Import Simplification | 2-3 days | Phase 1-6 | Low |
| 9 | Snapshots & Sandboxes | 3-4 days | Phase 1-8 | Low |

**Total estimate: 4-5 weeks**

### Recommended Order

1. **Phase 1-3**: Foundation (adapter, tenant, context) — get SQLite connecting
2. **Phase 4**: Observer filtering — enable per-adapter observers
3. **Phase 5**: DDL + CRUD observers for SQLite — basic create/read/update/delete
4. **Phase 7**: Tests running on both backends — validate parity
5. **Phase 6**: Filter abstraction — complex queries
6. **Phase 8**: Export/import — the payoff
7. **Phase 9**: Snapshots/sandboxes — portable backups and experimentation

---

## Risk Mitigation

### High-Risk Areas

1. **Array operators** - Complex to replicate with `json_each()`
   - Mitigation: Start with simplified ACL (single user, not arrays)

2. **Full-text search** - PostgreSQL `tsvector` vs SQLite FTS5
   - Mitigation: Disable FTS for SQLite initially

3. **Performance** - SQLite single-writer limitation
   - Mitigation: SQLite for single-user/export scenarios only

### Rollback Strategy

- Keep `db_type` defaulting to 'postgresql'
- PostgreSQL code paths unchanged until SQLite is stable
- Feature flag: `ENABLE_SQLITE_TENANTS=true`

---

## Dependencies

```json
{
  "better-sqlite3": "^11.0.0"
}
```

Or for WASM/portable:
```json
{
  "sql.js": "^1.10.0"
}
```

---

## Success Criteria

1. [ ] Create tenant with `db_type: 'sqlite'`
2. [ ] CRUD operations work identically on both backends
3. [ ] All existing tests pass on PostgreSQL (no regression)
4. [ ] Core tests pass on SQLite (CRUD, basic filters)
5. [ ] Export SQLite tenant = download the `.db` file
6. [ ] Import `.db` file = create new SQLite tenant

---

## Design Decisions

### ACLs in SQLite: Disabled

SQLite tenants run in **root mode** - ACL checks are skipped.

- ACL fields (`access_read`, `access_edit`, `access_full`, `access_deny`) are stored as JSON arrays for data portability
- The `sql-access-observer` is disabled for SQLite (via `adapters: ['postgresql']`)
- All queries return all records (no ACL filtering)

**Rationale**: SQLite tenants are typically:
- Export files (no multi-user access)
- Edge/offline deployments (single user)
- Development/testing (ACLs are noise)

If ACL filtering is needed, use PostgreSQL.

### Decimal Precision: Accept SQLite Limitation

- SQLite uses `REAL` (IEEE 754 double) for `decimal` type
- Precision: ~15-17 significant digits
- **If exact decimal precision is required, use PostgreSQL**

---

## Open Questions

1. **Which SQLite library?**
   - `better-sqlite3`: Fast, synchronous, native bindings
   - `sql.js`: WASM, portable, works in browser

2. **Concurrent writes?**
   - SQLite has single-writer limitation
   - Accept this for export/edge use cases?

3. **Data directory location?**
   - `/data/{db}/{ns}.db`
   - Configurable via `SQLITE_DATA_DIR`?

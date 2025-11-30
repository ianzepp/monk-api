# FS Design v2 - Implementation Analysis

## Overview

This document expands on FS_DESIGN.md with implementation details based on analysis of the existing Monk API codebase. It includes architectural context to enable implementation without re-research.

---

## Monk API Architecture Context

### Project Structure

```
/Users/ianzepp/Workspaces/monk-api/
├── src/                           # Main API source code
│   ├── index.ts                   # Hono app bootstrap (444 lines)
│   ├── lib/                       # Core libraries
│   │   ├── database/              # Database layer
│   │   │   ├── service.ts         # High-level DB operations
│   │   │   ├── select.ts          # Query building
│   │   │   ├── mutate.ts          # Insert/update/delete
│   │   │   └── access.ts          # ACL enforcement
│   │   ├── middleware/            # Hono middleware pipeline
│   │   │   ├── jwt-validator.ts   # JWT extraction & verification
│   │   │   └── context-initializer.ts  # System context creation
│   │   ├── observers/             # Ring-based business logic hooks
│   │   ├── database-connection.ts # Connection pooling & tenant routing
│   │   └── system.ts              # System context (per-request)
│   └── routes/                    # API route handlers
│       ├── api/
│       │   ├── data/              # CRUD: /api/data/:model
│       │   ├── describe/          # Schema: /api/describe/:model
│       │   ├── find/              # Queries: /api/find/:model
│       │   └── aggregate/         # Analytics: /api/aggregate/:model
│       ├── auth/                  # JWT: /auth/login, /auth/register
│       └── docs/                  # API docs: /docs
├── packages/                      # Optional packages
│   ├── app-tty/                   # Telnet/SSH shell (current FS consumer)
│   │   ├── src/
│   │   │   ├── commands.ts        # Shell commands (750+ LOC)
│   │   │   ├── session-handler.ts # Auth flow, command dispatch
│   │   │   ├── api-client.ts      # HTTP/in-process API calls
│   │   │   ├── transport.ts       # Session & TTYStream interfaces
│   │   │   ├── telnet-server.ts   # Bun socket server
│   │   │   └── ssh-server.ts      # ssh2 library integration
│   ├── mcp/                       # Model Context Protocol
│   └── grids/                     # Spreadsheet interface
└── planning/                      # Design documents
```

### Database Layer

**Connection Management** (`src/lib/database-connection.ts`):
- Singleton pattern with per-database connection pools
- PostgreSQL: Schema-per-tenant (`ns_tenant_<hash>` or `ns_tenant_<name>`)
- SQLite: File-per-tenant (`.data/tenants/<tenant>.sqlite`)
- Pool sizes: 10 main, 5 per tenant, 2 test

**Database Service** (`src/lib/database/service.ts`):
- High-level wrapper: `selectOne`, `selectAny`, `createOne`, `updateOne`, `deleteOne`
- All mutations go through Observer pipeline (rings 0-9)
- Delegates to specialized modules: `select.ts`, `mutate.ts`, `access.ts`

### System Context

**Per-Request Context** (`src/lib/system.ts`):
```typescript
class System {
  userId: string;
  tenant: string;              // Tenant name (NOT tenantId)
  dbType: 'postgresql' | 'sqlite';
  dbName: string;
  nsName: string;              // Namespace (schema)
  access: string;              // 'root' | 'full' | 'edit' | 'read' | 'deny'

  // Services
  database: Database;          // src/lib/database/service.ts
  describe: Describe;          // src/lib/describe.ts (has .models and .fields)
  adapter: DatabaseAdapter | null;  // Set by runTransaction()

  // Methods
  getUser(): UserInfo;         // Synchronous, returns { id, tenant, role, ... }
  isRoot(): boolean;
  isSudo(): boolean;
}
```

**Middleware Pipeline** (order of execution on `/api/*`):
1. `bodyParserMiddleware` - Parse JSON/YAML/etc.
2. `jwtValidatorMiddleware` - Extract JWT, create `SystemInit`
3. `userValidatorMiddleware` - Validate user/tenant exists
4. `formatDetectorMiddleware` - Detect response format
5. `responseTransformerMiddleware` - Transform envelope
6. `contextInitializerMiddleware` - Create `System`, attach to `c.set('system', system)`

### JWT Structure

```typescript
interface JWTPayload {
  sub: string;           // user_id
  tenant: string;        // tenant_name
  db_type: 'postgresql' | 'sqlite';
  db: string;            // database_name (e.g., "db_main")
  ns: string;            // namespace_name (e.g., "ns_tenant_abc123")
  access: AccessLevel;
  is_sudo: boolean;
  iat: number;
  exp: number;
}
```

### Current TTY Implementation

**Session** (`packages/app-tty/src/transport.ts`):
```typescript
interface Session {
  state: 'AWAITING_USERNAME' | 'AWAITING_PASSWORD' | 'AUTHENTICATED';
  username: string;
  tenant: string;
  token: string;         // JWT after login
  cwd: string;           // Working directory (e.g., "/api/data/users")
  inputBuffer: string;
  env: Record<string, string>;
}
```

**Command Execution Flow**:
1. `session-handler.ts:188` - `executeCommand()` parses input
2. `commands.ts` - Handler looks up command, calls with `(session, args, write)`
3. Each command manually parses paths via `parsePath()`
4. Commands call `ApiClient` methods (HTTP or in-process via `honoApp.fetch()`)

**Problem with Current Design**:
- `commands.ts:59-116` has `parsePath()` with hardcoded path types
- Each command (`ls`, `cat`, `cd`, `rm`) reimplements path resolution
- Adding a new mount point requires modifying every command handler
- No abstraction between shell commands and data access

---

## FS Architecture

### Design Goals

1. **Generic Core, Specific Mounts** - FS knows paths and entries, not Monk APIs
2. **Real Storage by Default** - `fs` table for `/home`, `/tmp`, `/etc`
3. **Direct Database Access** - Mounts use `System.database`, not HTTP
4. **Session-Scoped** - Each FS instance bound to authenticated session
5. **Transport-Agnostic** - Same FS serves TTY, SFTP, and potential HTTP explorer

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                           API Server                                 │
│                                                                      │
│  ┌─────────────┐    ┌─────────────┐    ┌──────────────────────────┐ │
│  │    HTTP     │    │     TTY     │    │          SFTP            │ │
│  │   Routes    │    │   Server    │    │       Subsystem          │ │
│  └──────┬──────┘    └──────┬──────┘    └───────────┬──────────────┘ │
│         │                  │                       │                 │
│         │                  ▼                       │                 │
│         │           ┌───────────┐                  │                 │
│         │           │   Shell   │                  │                 │
│         │           │ Commands  │                  │                 │
│         │           └─────┬─────┘                  │                 │
│         │                 │                        │                 │
│         │                 ▼                        ▼                 │
│         │          ┌─────────────────────────────────┐               │
│         │          │              FS                │               │
│         │          │  ┌───────────────────────────┐  │               │
│         │          │  │       Mount Table         │  │               │
│         │          │  │  /api/data → DataMount    │  │               │
│         │          │  │  /api/describe → Describe │  │               │
│         │          │  │  /api/find → FindMount    │  │               │
│         │          │  │  /system → SystemMount    │  │               │
│         │          │  │  /app → AppMount          │  │               │
│         │          │  │  /* → ModelBackedStorage  │  │               │
│         │          │  └───────────────────────────┘  │               │
│         │          └─────────────┬───────────────────┘               │
│         │                        │                                   │
│         ▼                        ▼                                   │
│  ┌─────────────────────────────────────────────────────────────┐     │
│  │                     System Context                          │     │
│  │  (database, describe, userId, tenantId, namespace, access)  │     │
│  └──────────────────────────────┬──────────────────────────────┘     │
│                                 │                                    │
│                                 ▼                                    │
│  ┌─────────────────────────────────────────────────────────────┐     │
│  │                        Database                              │     │
│  │              (PostgreSQL or SQLite per tenant)               │     │
│  └─────────────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────────────┘
```

### File Location

```
src/lib/fs/
├── index.ts              # FS class, mount table, path resolution
├── types.ts              # FSEntry, Mount interface, FSError
├── storage.ts            # ModelBackedStorage (fs table)
└── mounts/
    ├── data-mount.ts         # /api/data/:model/:id.json
    ├── describe-mount.ts     # /api/describe/:model.yaml
    ├── find-mount.ts         # /api/find/:model (query execution)
    ├── trashed-mount.ts      # /api/trashed/:model (soft-deleted records)
    ├── system-mount.ts       # /system/* pseudo-files
    └── local-mount.ts        # Host filesystem mount (plugins, user homes)
```

**Rationale**: FS lives in core `src/lib/` because it's reusable across:
- TTY shell commands
- SFTP subsystem (ssh2)
- Potential HTTP `/fs/*` explorer endpoint
- MCP file operations

---

## Core Interfaces

### FSEntry

```typescript
interface FSEntry {
  name: string;
  type: 'file' | 'directory' | 'symlink';
  size: number;
  mode: number;           // Unix permissions (0o755, 0o644, etc.)
  uid?: string;           // Owner user ID
  gid?: string;           // Owner group ID
  atime?: Date;           // Last access
  mtime?: Date;           // Last modification
  ctime?: Date;           // Last status change
  target?: string;        // Symlink target path
}
```

### FSError

```typescript
type FSErrorCode =
  | 'ENOENT'    // No such file or directory
  | 'EEXIST'    // File exists
  | 'EISDIR'    // Is a directory (can't read as file)
  | 'ENOTDIR'   // Not a directory (can't list)
  | 'EACCES'    // Permission denied
  | 'ENOTEMPTY' // Directory not empty
  | 'EROFS'     // Read-only filesystem
  | 'EINVAL'    // Invalid argument
  | 'EIO';      // I/O error

class FSError extends Error {
  constructor(
    public code: FSErrorCode,
    public path: string,
    message?: string
  ) {
    super(message || `${code}: ${path}`);
    this.name = 'FSError';
  }
}
```

### Mount Interface

```typescript
interface Mount {
  // Required: navigation
  stat(path: string): Promise<FSEntry>;
  readdir(path: string): Promise<FSEntry[]>;

  // Required: reading
  read(path: string): Promise<string | Buffer>;

  // Optional: writing (omit for read-only mounts)
  write?(path: string, content: string | Buffer): Promise<void>;
  append?(path: string, content: string | Buffer): Promise<void>;
  truncate?(path: string, size: number): Promise<void>;

  // Optional: file operations
  unlink?(path: string): Promise<void>;
  mkdir?(path: string, mode?: number): Promise<void>;
  rmdir?(path: string): Promise<void>;
  rename?(oldPath: string, newPath: string): Promise<void>;

  // Optional: permissions
  chmod?(path: string, mode: number): Promise<void>;
  chown?(path: string, uid: string, gid?: string): Promise<void>;

  // Optional: symlinks
  symlink?(target: string, path: string): Promise<void>;
  readlink?(path: string): Promise<string>;
}
```

### FS Class

```typescript
class FS {
  private mounts: Map<string, Mount> = new Map();
  private sortedMounts: [string, Mount][] = [];
  private storage: ModelBackedStorage;
  private system: System;

  constructor(system: System) {
    this.system = system;
    this.storage = new ModelBackedStorage(system);

    // Default mounts
    this.mount('/api/data', new DataMount(system));
    this.mount('/api/describe', new DescribeMount(system));
    this.mount('/api/find', new FindMount(system));
    this.mount('/api/aggregate', new AggregateMount(system));
    this.mount('/system', new SystemMount(system));
    this.mount('/app', new AppMount(system));
  }

  // Mount management
  mount(path: string, handler: Mount): void;
  unmount(path: string): void;
  getMounts(): Map<string, Mount>;

  // Core operations (delegate to mount or storage)
  stat(path: string): Promise<FSEntry>;
  readdir(path: string): Promise<FSEntry[]>;
  read(path: string): Promise<string | Buffer>;
  write(path: string, content: string | Buffer): Promise<void>;
  unlink(path: string): Promise<void>;
  mkdir(path: string, mode?: number): Promise<void>;
  rmdir(path: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;

  // Convenience methods
  exists(path: string): Promise<boolean>;
  isFile(path: string): Promise<boolean>;
  isDirectory(path: string): Promise<boolean>;

  // Path utilities
  resolve(...paths: string[]): string;
  normalize(path: string): string;
  dirname(path: string): string;
  basename(path: string): string;
  extname(path: string): string;
}
```

---

## Mount Resolution

Paths are matched against mounts in order of specificity (longest path first):

```typescript
class FS {
  mount(path: string, handler: Mount): void {
    this.mounts.set(path, handler);
    // Re-sort by path length descending (most specific first)
    this.sortedMounts = [...this.mounts.entries()]
      .sort((a, b) => b[0].length - a[0].length);
  }

  private resolve(path: string): { handler: Mount | ModelBackedStorage; relativePath: string } {
    const normalized = this.normalize(path);

    for (const [mountPath, handler] of this.sortedMounts) {
      if (normalized === mountPath || normalized.startsWith(mountPath + '/')) {
        return {
          handler,
          relativePath: normalized.slice(mountPath.length) || '/',
        };
      }
    }

    // No mount matched, use storage backend
    return { handler: this.storage, relativePath: normalized };
  }
}
```

**Mount Point Injection in readdir**:

When listing a directory, mount points that appear at that level are injected:

```typescript
async readdir(path: string): Promise<FSEntry[]> {
  const { handler, relativePath } = this.resolve(path);
  const entries = await handler.readdir(relativePath);

  // Inject mount points that appear at this level
  const normalized = this.normalize(path);
  for (const [mountPath] of this.sortedMounts) {
    const mountParent = this.dirname(mountPath);
    if (mountParent === normalized) {
      const mountName = this.basename(mountPath);
      if (!entries.some(e => e.name === mountName)) {
        entries.push({
          name: mountName,
          type: 'directory',
          size: 0,
          mode: 0o755,
        });
      }
    }
  }

  return entries;
}
```

---

## Mount Implementations

### DataMount (`/api/data`)

Virtualizes CRUD operations as filesystem:

```typescript
class DataMount implements Mount {
  constructor(private system: System) {}

  async stat(path: string): Promise<FSEntry> {
    const parts = this.parsePath(path);

    if (parts.type === 'root') {
      return { name: 'data', type: 'directory', size: 0, mode: 0o755 };
    }

    if (parts.type === 'model') {
      // Verify model exists via describe.models.selectOne()
      const schema = await this.system.describe.models.selectOne({
        where: { model_name: parts.model }
      });
      if (!schema) throw new FSError('ENOENT', path);
      return {
        name: parts.model,
        type: 'directory',
        size: 0,
        mode: 0o755,
        mtime: schema.updated_at,
      };
    }

    if (parts.type === 'record') {
      // selectOne takes (model, filterData) where filterData has { where: { ... } }
      const record = await this.system.database.selectOne(parts.model, {
        where: { id: parts.id }
      });
      if (!record) throw new FSError('ENOENT', path);
      const content = JSON.stringify(record, null, 2);
      return {
        name: `${parts.id}.json`,
        type: 'file',
        size: content.length,
        mode: 0o644,
        mtime: record.updated_at,
        ctime: record.created_at,
      };
    }

    throw new FSError('ENOENT', path);
  }

  async readdir(path: string): Promise<FSEntry[]> {
    const parts = this.parsePath(path);

    if (parts.type === 'root') {
      // List all models via describe.models.selectAny()
      const models = await this.system.describe.models.selectAny();
      return models.map(m => ({
        name: m.model_name,
        type: 'directory',
        size: 0,
        mode: 0o755,
        mtime: m.updated_at,
      }));
    }

    if (parts.type === 'model') {
      // List records in model
      const records = await this.system.database.selectAny(parts.model, { limit: 10000 });
      return records.map(r => ({
        name: `${r.id}.json`,
        type: 'file',
        size: 0,
        mode: 0o644,
        mtime: r.updated_at,
        ctime: r.created_at,
      }));
    }

    throw new FSError('ENOTDIR', path);
  }

  async read(path: string): Promise<string> {
    const parts = this.parsePath(path);
    if (parts.type !== 'record') {
      throw new FSError('EISDIR', path);
    }

    const record = await this.system.database.selectOne(parts.model, {
      where: { id: parts.id }
    });
    if (!record) throw new FSError('ENOENT', path);
    return JSON.stringify(record, null, 2);
  }

  async write(path: string, content: string): Promise<void> {
    const parts = this.parsePath(path);
    if (parts.type !== 'record') {
      throw new FSError('EISDIR', path);
    }

    const data = JSON.parse(content);

    // Check if record exists
    const existing = await this.system.database.selectOne(parts.model, {
      where: { id: parts.id }
    });
    if (existing) {
      // updateOne takes (model, recordId, changes)
      await this.system.database.updateOne(parts.model, parts.id, data);
    } else {
      await this.system.database.createOne(parts.model, { ...data, id: parts.id });
    }
  }

  async unlink(path: string): Promise<void> {
    const parts = this.parsePath(path);
    if (parts.type !== 'record') {
      throw new FSError('EISDIR', path);
    }

    // deleteOne takes (model, recordId)
    await this.system.database.deleteOne(parts.model, parts.id);
  }

  private parsePath(path: string): ParsedDataPath {
    const segments = path.split('/').filter(Boolean);

    if (segments.length === 0) {
      return { type: 'root' };
    }

    if (segments.length === 1) {
      return { type: 'model', model: segments[0] };
    }

    const filename = segments[1];
    const id = filename.replace(/\.json$/, '');
    return { type: 'record', model: segments[0], id };
  }
}

type ParsedDataPath =
  | { type: 'root' }
  | { type: 'model'; model: string }
  | { type: 'record'; model: string; id: string };
```

### DescribeMount (`/api/describe`)

Model schemas as YAML files:

```typescript
class DescribeMount implements Mount {
  constructor(private system: System) {}

  async stat(path: string): Promise<FSEntry> {
    if (path === '/') {
      return { name: 'describe', type: 'directory', size: 0, mode: 0o755 };
    }

    const modelName = this.basename(path).replace(/\.(yaml|json)$/, '');
    // Use describe.models.selectOne()
    const schema = await this.system.describe.models.selectOne({
      where: { model_name: modelName }
    });
    if (!schema) throw new FSError('ENOENT', path);

    return {
      name: `${modelName}.yaml`,
      type: 'file',
      size: 0,
      mode: 0o644,
      mtime: schema.updated_at,
    };
  }

  async readdir(path: string): Promise<FSEntry[]> {
    if (path !== '/') throw new FSError('ENOTDIR', path);

    // Use describe.models.selectAny()
    const models = await this.system.describe.models.selectAny();
    return models.map(m => ({
      name: `${m.model_name}.yaml`,
      type: 'file',
      size: 0,
      mode: 0o644,
      mtime: m.updated_at,
    }));
  }

  async read(path: string): Promise<string> {
    const modelName = this.basename(path).replace(/\.(yaml|json)$/, '');

    // Get model and its fields separately
    const model = await this.system.describe.models.selectOne({
      where: { model_name: modelName }
    });
    if (!model) throw new FSError('ENOENT', path);

    const fields = await this.system.describe.fields.selectAny({
      where: { model_name: modelName }
    });

    return this.toYaml({ ...model, fields });
  }

  // Optional: schema editing
  async write(path: string, content: string): Promise<void> {
    const modelName = this.basename(path).replace(/\.(yaml|json)$/, '');
    const schema = yaml.parse(content);
    // Use describe.models.update404()
    await this.system.describe.models.update404(
      { where: { model_name: modelName } },
      schema
    );
  }

  private toYaml(schema: ModelSchema): string {
    // Format as YAML
    return yaml.stringify(schema);
  }

  private basename(path: string): string {
    return path.split('/').filter(Boolean).pop() || '';
  }
}
```

### SystemMount (`/system`)

Read-only system introspection:

```typescript
class SystemMount implements Mount {
  private startTime = new Date();

  constructor(private system: System) {}

  private readonly files = new Map<string, () => Promise<string>>([
    ['version', async () => process.env.npm_package_version || '5.1.0'],
    ['uptime', async () => this.formatUptime()],
    ['whoami', async () => {
      // getUser() is synchronous, returns UserInfo
      const user = this.system.getUser();
      return JSON.stringify(user, null, 2);
    }],
    ['tenant', async () => this.system.tenant],  // NOT tenantId
    ['database', async () => this.system.dbName],
    ['namespace', async () => this.system.nsName],
    ['access', async () => this.system.access],
  ]);

  async stat(path: string): Promise<FSEntry> {
    if (path === '/') {
      return { name: 'system', type: 'directory', size: 0, mode: 0o555 };
    }

    const name = path.split('/').filter(Boolean)[0];
    if (!this.files.has(name)) {
      throw new FSError('ENOENT', path);
    }

    const content = await this.files.get(name)!();
    return {
      name,
      type: 'file',
      size: content.length,
      mode: 0o444,  // read-only
    };
  }

  async readdir(path: string): Promise<FSEntry[]> {
    if (path !== '/') throw new FSError('ENOTDIR', path);

    return [...this.files.keys()].map(name => ({
      name,
      type: 'file',
      size: 0,
      mode: 0o444,
    }));
  }

  async read(path: string): Promise<string> {
    const name = path.split('/').filter(Boolean)[0];
    const getter = this.files.get(name);
    if (!getter) throw new FSError('ENOENT', path);
    return getter();
  }

  // No write methods - this mount is read-only

  private formatUptime(): string {
    const ms = Date.now() - this.startTime.getTime();
    const seconds = Math.floor(ms / 1000);
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    parts.push(`${mins}m`);

    return parts.join(' ');
  }
}
```

---

## Storage Backend

### Database Model: `fs`

> **IMPORTANT**: System tables are defined via SQL, not YAML.
> The `fs` table must be added to three files:
> 1. `src/lib/sql/tenant.pg.sql` - PostgreSQL DDL + seed data
> 2. `src/lib/sql/tenant.sqlite.sql` - SQLite DDL
> 3. `src/lib/infrastructure.ts` - `TENANT_SEED_SQLITE` constant

#### PostgreSQL DDL (`tenant.pg.sql`)

```sql
-- FS Nodes table (filesystem storage)
CREATE TABLE IF NOT EXISTS "fs" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "access_read" uuid[] DEFAULT '{}'::uuid[],
    "access_edit" uuid[] DEFAULT '{}'::uuid[],
    "access_full" uuid[] DEFAULT '{}'::uuid[],
    "access_deny" uuid[] DEFAULT '{}'::uuid[],
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL,
    "trashed_at" timestamp,
    "deleted_at" timestamp,
    "parent_id" uuid,
    "name" text NOT NULL,
    "path" text NOT NULL,
    "node_type" text NOT NULL CHECK ("node_type" IN ('file', 'directory', 'symlink')),
    "content" bytea,
    "target" text,
    "mode" integer DEFAULT 420 NOT NULL,
    "size" integer DEFAULT 0 NOT NULL,
    "owner_id" uuid,
    CONSTRAINT "fs_path_unique" UNIQUE("path")
);

CREATE INDEX IF NOT EXISTS "idx_fs_parent" ON "fs" ("parent_id");

-- Seed: Register model
INSERT INTO "models" (model_name, status, sudo, description) VALUES
    ('fs', 'system', true, 'Filesystem nodes for persistent storage')
ON CONFLICT (model_name) DO NOTHING;

-- Seed: Register fields
INSERT INTO "fields" (model_name, field_name, type, required, description) VALUES
    ('fs', 'parent_id', 'uuid', false, 'Parent directory (null for root)'),
    ('fs', 'name', 'text', true, 'File or directory name'),
    ('fs', 'path', 'text', true, 'Full absolute path'),
    ('fs', 'node_type', 'text', true, 'Node type: file, directory, symlink'),
    ('fs', 'content', 'bytea', false, 'File content (null for directories)'),
    ('fs', 'target', 'text', false, 'Symlink target path'),
    ('fs', 'mode', 'integer', false, 'Unix permission bits'),
    ('fs', 'size', 'integer', false, 'Content size in bytes'),
    ('fs', 'owner_id', 'uuid', false, 'Owner user ID')
ON CONFLICT (model_name, field_name) DO NOTHING;
```

#### SQLite DDL (`tenant.sqlite.sql`)

```sql
-- FS Nodes table (filesystem storage)
CREATE TABLE IF NOT EXISTS "fs" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "access_read" TEXT DEFAULT '[]',
    "access_edit" TEXT DEFAULT '[]',
    "access_full" TEXT DEFAULT '[]',
    "access_deny" TEXT DEFAULT '[]',
    "created_at" TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "trashed_at" TEXT,
    "deleted_at" TEXT,
    "parent_id" TEXT,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "node_type" TEXT NOT NULL CHECK ("node_type" IN ('file', 'directory', 'symlink')),
    "content" BLOB,
    "target" TEXT,
    "mode" INTEGER DEFAULT 420 NOT NULL,
    "size" INTEGER DEFAULT 0 NOT NULL,
    "owner_id" TEXT,
    CONSTRAINT "fs_path_unique" UNIQUE("path")
);

CREATE INDEX IF NOT EXISTS "idx_fs_parent" ON "fs" ("parent_id");
```

#### SQLite Seed (`infrastructure.ts` - TENANT_SEED_SQLITE)

```typescript
// Add to TENANT_SEED_SQLITE constant:

-- Register fs model
INSERT OR IGNORE INTO "models" (id, model_name, status, sudo, description) VALUES
    ('${randomUUID()}', 'fs', 'system', 1, 'Filesystem nodes');

-- Fields for fs
INSERT OR IGNORE INTO "fields" (id, model_name, field_name, type, required, description) VALUES
    ('${randomUUID()}', 'fs', 'parent_id', 'uuid', 0, 'Parent directory'),
    ('${randomUUID()}', 'fs', 'name', 'text', 1, 'File or directory name'),
    ('${randomUUID()}', 'fs', 'path', 'text', 1, 'Full absolute path'),
    ('${randomUUID()}', 'fs', 'node_type', 'text', 1, 'Node type'),
    ('${randomUUID()}', 'fs', 'content', 'bytea', 0, 'File content'),
    ('${randomUUID()}', 'fs', 'target', 'text', 0, 'Symlink target'),
    ('${randomUUID()}', 'fs', 'mode', 'integer', 0, 'Unix permissions'),
    ('${randomUUID()}', 'fs', 'size', 'integer', 0, 'Content size'),
    ('${randomUUID()}', 'fs', 'owner_id', 'uuid', 0, 'Owner user ID');
```

#### Binary Type Support (PREREQUISITE)

> **NOTE**: The `bytea` type is NOT currently supported in the field type system.
> Before implementing fs, add `bytea` support:
>
> 1. **`src/lib/sql/tenant.pg.sql`** - Add `'bytea'` to `field_type` enum
> 2. **`src/lib/sql/tenant.sqlite.sql`** - Add `'bytea'` to CHECK constraint
> 3. **`src/lib/field-types.ts`** - Add mappings:
>    ```typescript
>    // USER_TO_PG_TYPE_MAP
>    'bytea': 'bytea',
>
>    // PG_TO_USER_TYPE_MAP
>    'bytea': 'bytea',
>    ```
> 4. **`src/lib/database/type-mappings.ts`** - Add SQLite mapping:
>    ```typescript
>    // USER_TO_SQLITE
>    'bytea': 'BLOB',
>    ```
>
> For SQLite, `bytea` maps to `BLOB`. Buffer values are stored/retrieved natively.

### ModelBackedStorage Implementation

```typescript
class ModelBackedStorage implements Mount {
  constructor(private system: System) {}

  async stat(path: string): Promise<FSEntry> {
    // selectOne takes (model, filterData) with { where: { ... } }
    const node = await this.system.database.selectOne('fs', {
      where: { path }
    });
    if (!node) throw new FSError('ENOENT', path);
    return this.toEntry(node);
  }

  async readdir(path: string): Promise<FSEntry[]> {
    const parent = await this.system.database.selectOne('fs', {
      where: { path }
    });
    if (!parent) throw new FSError('ENOENT', path);
    if (parent.node_type !== 'directory') throw new FSError('ENOTDIR', path);

    const children = await this.system.database.selectAny('fs', {
      where: { parent_id: parent.id },
      order: [{ field: 'name', direction: 'asc' }],
    });

    return children.map(this.toEntry);
  }

  async read(path: string): Promise<Buffer> {
    const node = await this.system.database.selectOne('fs', {
      where: { path }
    });
    if (!node) throw new FSError('ENOENT', path);
    if (node.node_type === 'directory') throw new FSError('EISDIR', path);
    return node.content || Buffer.alloc(0);
  }

  async write(path: string, content: Buffer | string): Promise<void> {
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const existing = await this.system.database.selectOne('fs', {
      where: { path }
    });

    if (existing) {
      if (existing.node_type === 'directory') throw new FSError('EISDIR', path);
      // updateOne takes (model, recordId, changes)
      await this.system.database.updateOne('fs', existing.id, {
        content: buffer,
        size: buffer.length,
      });
    } else {
      // Create new file
      const parentPath = this.dirname(path);
      const parent = await this.system.database.selectOne('fs', {
        where: { path: parentPath }
      });
      if (!parent) throw new FSError('ENOENT', parentPath);

      await this.system.database.createOne('fs', {
        parent_id: parent.id,
        name: this.basename(path),
        path,
        node_type: 'file',
        content: buffer,
        size: buffer.length,
        mode: 0o644,
        owner_id: this.system.userId,
      });
    }
  }

  async mkdir(path: string, mode = 0o755): Promise<void> {
    const existing = await this.system.database.selectOne('fs', {
      where: { path }
    });
    if (existing) throw new FSError('EEXIST', path);

    const parentPath = this.dirname(path);
    const parent = await this.system.database.selectOne('fs', {
      where: { path: parentPath }
    });
    if (!parent) throw new FSError('ENOENT', parentPath);

    await this.system.database.createOne('fs', {
      parent_id: parent.id,
      name: this.basename(path),
      path,
      node_type: 'directory',
      mode,
      owner_id: this.system.userId,
    });
  }

  async unlink(path: string): Promise<void> {
    const node = await this.system.database.selectOne('fs', {
      where: { path }
    });
    if (!node) throw new FSError('ENOENT', path);
    if (node.node_type === 'directory') throw new FSError('EISDIR', path);
    // deleteOne takes (model, recordId)
    await this.system.database.deleteOne('fs', node.id);
  }

  async rmdir(path: string): Promise<void> {
    const node = await this.system.database.selectOne('fs', {
      where: { path }
    });
    if (!node) throw new FSError('ENOENT', path);
    if (node.node_type !== 'directory') throw new FSError('ENOTDIR', path);

    // Check if empty
    const children = await this.system.database.selectAny('fs', {
      where: { parent_id: node.id },
      limit: 1,
    });
    if (children.length > 0) throw new FSError('ENOTEMPTY', path);

    await this.system.database.deleteOne('fs', node.id);
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    const node = await this.system.database.selectOne('fs', {
      where: { path: oldPath }
    });
    if (!node) throw new FSError('ENOENT', oldPath);

    const newParentPath = this.dirname(newPath);
    const newParent = await this.system.database.selectOne('fs', {
      where: { path: newParentPath }
    });
    if (!newParent) throw new FSError('ENOENT', newParentPath);

    await this.system.database.updateOne('fs', node.id, {
      parent_id: newParent.id,
      name: this.basename(newPath),
      path: newPath,
    });

    // If directory, update all descendant paths
    if (node.node_type === 'directory') {
      await this.updateDescendantPaths(oldPath, newPath);
    }
  }

  private toEntry(node: FSNode): FSEntry {
    return {
      name: node.name,
      type: node.node_type,
      size: node.size || 0,
      mode: node.mode,
      uid: node.owner_id,
      mtime: node.updated_at,
      ctime: node.created_at,
      target: node.target,
    };
  }

  private dirname(path: string): string {
    const parts = path.split('/').filter(Boolean);
    parts.pop();
    return '/' + parts.join('/');
  }

  private basename(path: string): string {
    return path.split('/').filter(Boolean).pop() || '';
  }

  private async updateDescendantPaths(oldPrefix: string, newPrefix: string): Promise<void> {
    // Use database.execute() for raw SQL
    // Note: Syntax differs between PostgreSQL and SQLite
    const sql = this.system.dbType === 'sqlite'
      ? `UPDATE fs SET path = ? || SUBSTR(path, ?) WHERE path LIKE ?`
      : `UPDATE fs SET path = $1 || SUBSTRING(path FROM $2) WHERE path LIKE $3`;

    await this.system.database.execute(sql, [newPrefix, oldPrefix.length + 1, oldPrefix + '%']);
  }
}
```

---

## TTY Integration

### Session Modification

Add FS to session after authentication:

```typescript
// packages/app-tty/src/transport.ts
interface Session {
  state: SessionState;
  username: string;
  tenant: string;
  token: string;
  cwd: string;
  inputBuffer: string;
  env: Record<string, string>;
  fs?: FS;  // NEW: FS instance after login
}
```

### Session Handler Update

```typescript
// packages/app-tty/src/session-handler.ts
import { FS } from '../../../src/lib/fs/index.js';
import { System, systemInitFromJWT } from '../../../src/lib/system.js';
import { verifyToken } from '../../../src/lib/jwt-generator.js';

// After successful login (line ~147):
if (result.success && result.data?.token) {
  session.token = result.data.token;
  session.state = 'AUTHENTICATED';

  // Create FS for this session
  // Note: systemInitFromJWT takes decoded JWT payload, not raw token string
  const payload = await verifyToken(session.token);
  const systemInit = systemInitFromJWT(payload);
  const system = new System(systemInit);
  session.fs = new FS(system);

  writeToStream(stream, '\n\n');
  writeToStream(stream, `Welcome ${session.username}@${session.tenant}\n`);
  // ...
}
```

### Command Simplification

Before (current `commands.ts` - 750+ lines):
```typescript
commands['ls'] = async (session, args, write) => {
  const api = new ApiClient(...);
  const parsed = parsePath(target);

  switch (parsed.type) {
    case 'root': { /* ... */ }
    case 'api': { /* ... */ }
    case 'api-data': { /* ... */ }
    case 'api-data-model': { /* ... */ }
    case 'api-data-record': { /* ... */ }
    case 'api-describe': { /* ... */ }
    case 'api-describe-model': { /* ... */ }
    case 'system': { /* ... */ }
    case 'system-file': { /* ... */ }
    default: { /* ... */ }
  }
};
```

After (with FS - ~200 lines total):
```typescript
commands['ls'] = async (session, args, write) => {
  const fs = session.fs!;
  const longFormat = args.includes('-l');
  const target = args.find(a => !a.startsWith('-')) || session.cwd;
  const resolved = fs.resolve(session.cwd, target);

  try {
    const stat = await fs.stat(resolved);

    if (stat.type !== 'directory') {
      // Single file
      write(formatEntry(stat, longFormat));
      return;
    }

    const entries = await fs.readdir(resolved);
    if (longFormat) {
      write(`total ${entries.length}\n`);
    }
    for (const entry of entries) {
      write(formatEntry(entry, longFormat));
    }
  } catch (err) {
    if (err instanceof FSError) {
      write(`ls: ${target}: ${err.message}\n`);
    } else {
      throw err;
    }
  }
};

function formatEntry(entry: FSEntry, long: boolean): string {
  const suffix = entry.type === 'directory' ? '/' : '';
  if (!long) {
    return `${entry.name}${suffix}  `;
  }
  const mode = formatMode(entry.type, entry.mode);
  const size = String(entry.size).padStart(8);
  return `${mode}  ${size}  ${entry.name}${suffix}\n`;
}
```

---

## SFTP Integration

The FS interface maps directly to SFTP operations:

| SFTP Operation | FS Method |
|----------------|------------|
| `OPENDIR` | `fs.readdir()` |
| `READDIR` | Return cached entries |
| `STAT` | `fs.stat()` |
| `LSTAT` | `fs.stat()` (no symlink follow) |
| `OPEN` (read) | `fs.read()` |
| `OPEN` (write) | Prepare buffer |
| `WRITE` | Append to buffer |
| `CLOSE` | `fs.write()` with buffer |
| `REMOVE` | `fs.unlink()` |
| `RMDIR` | `fs.rmdir()` |
| `MKDIR` | `fs.mkdir()` |
| `RENAME` | `fs.rename()` |
| `SYMLINK` | `fs.symlink()` |
| `READLINK` | `fs.readlink()` |

### SFTP Handler Sketch

```typescript
// packages/app-tty/src/sftp-handler.ts
import { SFTPStream } from 'ssh2';
import { FS, FSError } from '../../../src/lib/fs/index.js';

export function handleSFTP(stream: SFTPStream, fs: FS): void {
  const openFiles = new Map<number, { path: string; buffer: Buffer; flags: number }>();
  const openDirs = new Map<number, FSEntry[]>();
  let handleCounter = 0;

  stream.on('STAT', (reqid, path) => {
    fs.stat(path)
      .then(entry => stream.attrs(reqid, entryToAttrs(entry)))
      .catch(err => stream.status(reqid, errorToStatus(err)));
  });

  stream.on('OPENDIR', (reqid, path) => {
    fs.readdir(path)
      .then(entries => {
        const handle = Buffer.alloc(4);
        handle.writeUInt32BE(handleCounter);
        openDirs.set(handleCounter++, entries);
        stream.handle(reqid, handle);
      })
      .catch(err => stream.status(reqid, errorToStatus(err)));
  });

  stream.on('READDIR', (reqid, handle) => {
    const id = handle.readUInt32BE(0);
    const entries = openDirs.get(id);
    if (!entries || entries.length === 0) {
      stream.status(reqid, STATUS_CODE.EOF);
      openDirs.delete(id);
      return;
    }
    // Return batch of entries
    const batch = entries.splice(0, 100);
    stream.name(reqid, batch.map(e => ({
      filename: e.name,
      longname: formatLongname(e),
      attrs: entryToAttrs(e),
    })));
  });

  stream.on('OPEN', (reqid, path, flags, attrs) => {
    const handle = Buffer.alloc(4);
    handle.writeUInt32BE(handleCounter);
    openFiles.set(handleCounter++, { path, buffer: Buffer.alloc(0), flags });
    stream.handle(reqid, handle);
  });

  stream.on('READ', async (reqid, handle, offset, length) => {
    const id = handle.readUInt32BE(0);
    const file = openFiles.get(id);
    if (!file) {
      stream.status(reqid, STATUS_CODE.FAILURE);
      return;
    }

    try {
      const content = await fs.read(file.path);
      const data = Buffer.isBuffer(content) ? content : Buffer.from(content);
      if (offset >= data.length) {
        stream.status(reqid, STATUS_CODE.EOF);
        return;
      }
      stream.data(reqid, data.slice(offset, offset + length));
    } catch (err) {
      stream.status(reqid, errorToStatus(err));
    }
  });

  stream.on('WRITE', (reqid, handle, offset, data) => {
    const id = handle.readUInt32BE(0);
    const file = openFiles.get(id);
    if (!file) {
      stream.status(reqid, STATUS_CODE.FAILURE);
      return;
    }
    // Expand buffer if needed
    if (offset + data.length > file.buffer.length) {
      const newBuffer = Buffer.alloc(offset + data.length);
      file.buffer.copy(newBuffer);
      file.buffer = newBuffer;
    }
    data.copy(file.buffer, offset);
    stream.status(reqid, STATUS_CODE.OK);
  });

  stream.on('CLOSE', async (reqid, handle) => {
    const id = handle.readUInt32BE(0);
    const file = openFiles.get(id);

    if (file && file.flags & OPEN_MODE.WRITE) {
      try {
        await fs.write(file.path, file.buffer);
      } catch (err) {
        stream.status(reqid, errorToStatus(err));
        return;
      }
    }

    openFiles.delete(id);
    openDirs.delete(id);
    stream.status(reqid, STATUS_CODE.OK);
  });

  // ... REMOVE, MKDIR, RMDIR, RENAME, etc.
}
```

---

## Tenant Initialization

When a tenant is created, initialize default directory structure:

```typescript
// In tenant creation observer or hook
async function initializeTenantFS(system: System): Promise<void> {
  const storage = new ModelBackedStorage(system);

  // Create root
  await storage.mkdir('/', 0o755);

  // Create standard directories
  await storage.mkdir('/home', 0o755);
  await storage.mkdir('/tmp', 0o1777);  // Sticky bit
  await storage.mkdir('/etc', 0o755);

  // Create root user's home
  await storage.mkdir('/home/root', 0o700);

  // Create default files
  await storage.write('/etc/motd', Buffer.from('Welcome to Monk API\n'));
  await storage.write('/home/root/.profile', Buffer.from('# User profile\n'));
}
```

---

## Implementation Phases

### Phase 0: Prerequisites ✅
- [x] Add `binary` type support to field type system
  - [x] `src/lib/sql/tenant.pg.sql` - Add to `field_type` enum
  - [x] `src/lib/sql/tenant.sqlite.sql` - Add to CHECK constraint
  - [x] `src/lib/field-types.ts` - Add USER_TO_PG and PG_TO_USER mappings
  - [x] `src/lib/database/type-mappings.ts` - Add USER_TO_SQLITE mapping (BLOB)

### Phase 1: Core FS (Foundation) ✅
- [x] Create `src/lib/fs/types.ts` with interfaces
- [x] Create `src/lib/fs/index.ts` with FS class
- [x] Implement mount resolution (longest-prefix matching)
- [x] Implement `SystemMount` (read-only, no DB needed)
- [x] Add unit tests

### Phase 2: API Mounts ✅
- [x] Implement `DataMount` for `/api/data`
- [x] Implement `DescribeMount` for `/api/describe`
- [x] Implement `FindMount` for `/api/find` (saved filters)
- [x] Implement `TrashedMount` for `/api/trashed`
- [ ] ~~Implement `AggregateMount` for `/api/aggregate`~~ (skipped - poor filesystem fit)
- [x] Add integration tests

### Phase 2.5: HTTP Routes ✅
- [x] Create `/fs/*` HTTP routes with minimal middleware
- [x] Consolidate auth middleware (`authValidatorMiddleware`)
- [x] Add integration tests (24 passing)

### Phase 3: TTY Refactor (In Progress)
- [x] Move TTY from `packages/app-tty` to `src/lib/tty` (core library)
- [x] Create `src/lib/auth.ts` with extracted login logic
- [x] Redesign Session to store `SystemInit` instead of JWT token
- [x] Implement FS-based commands (~350 LOC vs 794 LOC original)
- [x] Create `fs-factory.ts` for consistent mount configuration
- [x] Transaction-per-command pattern (each command is atomic)
- [ ] Integrate TTY server startup with main API server
- [ ] Test with telnet connection
- [ ] Test with SSH connection

### Phase 4: Real Storage ✅
- [x] Add `fs` table to SQL schemas:
  - [x] `src/lib/sql/tenant.pg.sql` - DDL + seed data
  - [x] `src/lib/sql/tenant.sqlite.sql` - DDL
  - [x] `src/lib/infrastructure.ts` - TENANT_SEED_SQLITE
- [x] Implement `ModelBackedStorage`
- [x] Add tenant initialization for `/home`, `/tmp`, `/etc` via `initializeFS()`
- [x] Support user home directories

### Phase 4.5: LocalMount ✅
- [x] Implement `LocalMount` for host filesystem access
- [x] Path traversal protection (blocks `../` attacks)
- [x] Read-only mode support via `LocalMountOptions`
- [x] 33 tests for LocalMount

### Phase 5: SFTP
- [ ] Add SFTP subsystem to SSH server
- [ ] Implement `sftp-handler.ts`
- [ ] Map all SFTP operations to FS
- [ ] Test with VSCode Remote / vim netrw

### Phase 6: Event Notifications
- [ ] Create `src/lib/fs/event-bus.ts` with FSEventBus
- [ ] Create `src/observers/fs/7/50-fs-event-emitter.ts`
- [ ] Add `watch` command to TTY
- [ ] Add `tail -f` support to TTY
- [ ] Add SSE endpoint `/api/fs/watch/*`
- [ ] Add `cleanupHandlers` to Session interface for subscription cleanup

---

## Event Notifications (Watch/Notify)

The observer pipeline provides a natural hook for filesystem event notifications. This enables `tail -f`, live watches, and IDE integration.

### Event Types

```typescript
type FSEventType = 'create' | 'modify' | 'delete' | 'rename' | 'attrib';

interface FSEvent {
  type: FSEventType;
  path: string;
  oldPath?: string;        // For rename events
  timestamp: Date;
  userId: string;          // Who made the change
  nodeType: 'file' | 'directory' | 'symlink';
}
```

### Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     FS Mutation (write, unlink, mkdir, etc.)        │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Observer Pipeline                               │
│                                                                      │
│  Ring 5: Database mutation executes                                  │
│  Ring 7: FSEventObserver (async) emits event to EventBus           │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         EventBus                                     │
│                                                                      │
│  • Maintains subscriptions by path pattern                           │
│  • Supports glob patterns: /home/user/*, /api/data/orders/**        │
│  • Per-tenant isolation                                              │
└────────┬────────────────────┬───────────────────────┬───────────────┘
         │                    │                       │
         ▼                    ▼                       ▼
┌─────────────┐      ┌─────────────┐         ┌─────────────┐
│    TTY      │      │  WebSocket  │         │     SSE     │
│  Sessions   │      │   Clients   │         │   Clients   │
│             │      │             │         │             │
│  tail -f    │      │  IDE/Editor │         │  Dashboard  │
│  watch cmd  │      │  Integration│         │  Live feed  │
└─────────────┘      └─────────────┘         └─────────────┘
```

### Observer Implementation

```typescript
// src/observers/fs/7/50-fs-event-emitter.ts
import { BaseAsyncObserver } from '@src/lib/observers/base-async-observer.js';
import { ObserverRing } from '@src/lib/observers/types.js';
import type { ObserverContext } from '@src/lib/observers/interfaces.js';
import { FSEventBus } from '@src/lib/fs/event-bus.js';

export default class FSEventEmitter extends BaseAsyncObserver {
  readonly ring = ObserverRing.Async;  // Ring 7
  readonly models = ['fs'] as const;
  readonly operations = ['create', 'update', 'delete'] as const;
  readonly priority = 50;

  async execute(context: ObserverContext): Promise<void> {
    const { operation, record, previous } = context;
    const { tenant } = context.system;

    const eventType = this.mapOperation(operation, record, previous);

    const event: FSEvent = {
      type: eventType,
      path: record.path,
      oldPath: previous?.path !== record.path ? previous?.path : undefined,
      timestamp: new Date(),
      userId: context.system.userId,
      nodeType: record.node_type,
    };

    await FSEventBus.emit(tenant, event);
  }

  private mapOperation(op: string, record: any, previous?: any): FSEventType {
    if (op === 'create') return 'create';
    if (op === 'delete') return 'delete';
    if (op === 'update') {
      if (previous?.path !== record.path) return 'rename';
      if (previous?.mode !== record.mode) return 'attrib';
      return 'modify';
    }
    return 'modify';
  }
}
```

### EventBus Implementation

```typescript
// src/lib/fs/event-bus.ts
type Subscriber = (event: FSEvent) => void | Promise<void>;

interface Subscription {
  pattern: string;          // Glob pattern
  regex: RegExp;            // Compiled pattern
  callback: Subscriber;
  id: string;
}

class FSEventBusImpl {
  // Per-tenant subscriptions
  private subscriptions = new Map<string, Subscription[]>();

  subscribe(tenant: string, pattern: string, callback: Subscriber): string {
    const id = crypto.randomUUID();
    const regex = this.globToRegex(pattern);

    if (!this.subscriptions.has(tenant)) {
      this.subscriptions.set(tenant, []);
    }

    this.subscriptions.get(tenant)!.push({ pattern, regex, callback, id });
    return id;
  }

  unsubscribe(tenant: string, id: string): void {
    const subs = this.subscriptions.get(tenant);
    if (subs) {
      const idx = subs.findIndex(s => s.id === id);
      if (idx !== -1) subs.splice(idx, 1);
    }
  }

  async emit(tenant: string, event: FSEvent): Promise<void> {
    const subs = this.subscriptions.get(tenant) || [];

    const matches = subs.filter(s =>
      s.regex.test(event.path) ||
      (event.oldPath && s.regex.test(event.oldPath))
    );

    await Promise.allSettled(
      matches.map(s => s.callback(event))
    );
  }

  private globToRegex(pattern: string): RegExp {
    // Convert glob to regex: * = [^/]*, ** = .*
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '{{GLOBSTAR}}')
      .replace(/\*/g, '[^/]*')
      .replace(/{{GLOBSTAR}}/g, '.*');
    return new RegExp(`^${escaped}$`);
  }
}

export const FSEventBus = new FSEventBusImpl();
```

### TTY Integration: `watch` Command

```typescript
// packages/app-tty/src/commands.ts
commands['watch'] = async (session, args, write) => {
  const pattern = args[0] || session.cwd;
  const resolved = session.fs!.resolve(session.cwd, pattern);

  write(`Watching ${resolved} for changes (Ctrl+C to stop)\n`);

  const subId = FSEventBus.subscribe(session.tenant, resolved + '/**', (event) => {
    const symbol = {
      create: '+',
      modify: '~',
      delete: '-',
      rename: '>',
      attrib: '@',
    }[event.type];

    const time = event.timestamp.toISOString().slice(11, 19);
    write(`[${time}] ${symbol} ${event.path}\n`);
  });

  // Cleanup on disconnect
  session.cleanupHandlers.push(() => {
    FSEventBus.unsubscribe(session.tenant, subId);
  });
};
```

### TTY Integration: `tail -f`

```typescript
commands['tail'] = async (session, args, write) => {
  const follow = args.includes('-f');
  const path = args.find(a => !a.startsWith('-')) || '';
  const resolved = session.fs!.resolve(session.cwd, path);

  // Show last N lines
  const content = await session.fs!.read(resolved);
  const lines = content.toString().split('\n');
  const lastLines = lines.slice(-10);
  write(lastLines.join('\n') + '\n');

  if (!follow) return;

  // Subscribe to modifications
  write('--- following ---\n');

  let lastSize = content.length;

  const subId = FSEventBus.subscribe(session.tenant, resolved, async (event) => {
    if (event.type !== 'modify') return;

    const newContent = await session.fs!.read(resolved);
    if (newContent.length > lastSize) {
      // Write only the new part
      write(newContent.slice(lastSize).toString());
      lastSize = newContent.length;
    }
  });

  session.cleanupHandlers.push(() => {
    FSEventBus.unsubscribe(session.tenant, subId);
  });
};
```

### HTTP/WebSocket Endpoint (Future)

```typescript
// src/routes/api/fs/watch/GET.ts
// SSE endpoint for file watching
app.get('/api/fs/watch/*', async (c) => {
  const system = c.get('system');
  const pattern = c.req.param('*') || '/';

  return streamSSE(c, async (stream) => {
    const subId = FSEventBus.subscribe(system.tenant, pattern, async (event) => {
      await stream.writeSSE({
        event: event.type,
        data: JSON.stringify(event),
      });
    });

    // Keep alive until client disconnects
    stream.onAbort(() => {
      FSEventBus.unsubscribe(system.tenant, subId);
    });
  });
});
```

---

## Future Concepts (Plan 9 / BeOS Inspiration)

These ideas from Plan 9 (Bell Labs, 1992) and BeOS (1995) blur the line between filesystem and database. Captured here for future exploration.

### Live Queries (BeOS)

BeOS had "live queries" - saved searches that notified when results changed. Monk has the `filters` table for saved queries. Combined with event notifications:

```typescript
// Filter defines the query (already exists)
// filters: { name: 'high-value', model_name: 'orders', where: { amount: { $gt: 1000 } } }

// Extend FSEventBus to support filter subscriptions
FSEventBus.subscribeFilter(tenant, 'high-value', (event) => {
  // event.type: 'enter' | 'exit' | 'modify'
  // Notified when records enter/exit the filter's result set
});
```

**Open questions:**
- How to efficiently detect when a record enters/exits a query result?
- Does the observer pipeline have enough context to evaluate filter conditions?
- Performance implications of evaluating filters on every mutation?

### Query Files (BeOS / filters integration)

Expose saved filters as virtual directories under a mount:

```
/queries/                          # QueryMount
  high-value-orders/               # Filter: orders where amount > 1000
    abc123.json                    # Matching record
    def456.json                    # Matching record
  pending-orders/                  # Filter: orders where status = 'pending'
    ...
  recent-users/                    # Filter: users created in last 24h
    ...
```

```typescript
class QueryMount implements Mount {
  async readdir(path: string): Promise<FSEntry[]> {
    if (path === '/') {
      // List all filters
      const filters = await this.system.database.selectAny('filters');
      return filters.map(f => ({
        name: f.name,
        type: 'directory',
        ...
      }));
    }

    // Path is /:filterName - execute the filter query
    const filterName = path.split('/')[1];
    const filter = await this.system.database.selectOne('filters', {
      where: { name: filterName }
    });

    const records = await this.system.database.selectAny(filter.model_name, {
      where: filter.where,
      order: filter.order,
      limit: filter.limit,
    });

    return records.map(r => ({
      name: `${r.id}.json`,
      type: 'file',
      ...
    }));
  }
}
```

**Open questions:**
- Should query results be cached? For how long?
- How to handle filters that span multiple models?
- With live queries, `watch /queries/high-value-orders` would notify on result changes

### Extended Attributes (BeOS)

BeOS files had arbitrary key-value attributes beyond standard metadata. Could add to fs:

```sql
-- Option A: JSONB column
ALTER TABLE fs ADD COLUMN xattrs JSONB DEFAULT '{}';

-- Option B: Separate table
CREATE TABLE fs_xattrs (
  node_id UUID REFERENCES fs(id),
  name TEXT NOT NULL,
  value BYTEA,
  PRIMARY KEY (node_id, name)
);
```

```typescript
// FS methods
await fs.setxattr('/home/user/doc.pdf', 'author', 'Ian Zepp');
await fs.setxattr('/home/user/doc.pdf', 'tags', ['important', 'q4']);
const author = await fs.getxattr('/home/user/doc.pdf', 'author');
const all = await fs.listxattr('/home/user/doc.pdf');

// Query by attribute (via /api/find integration)
await fs.find('/home', { where: { 'xattr.tags': { $contains: 'important' } } });
```

**Open questions:**
- JSONB column vs separate table? (JSONB simpler, separate table more queryable)
- Size limits on attribute values?
- How to expose in SFTP? (SFTP has limited xattr support)

### Union Mounts (Plan 9)

Overlay multiple directories to create a merged view:

```typescript
// Conceptual API
fs.union('/bin', [
  { path: '/system/bin', priority: 0 },   // Base layer
  { path: '/app/myapp/bin', priority: 1 }, // App overrides
  { path: '/home/user/bin', priority: 2 }, // User overrides (highest priority)
]);

// Reading /bin/foo checks layers in reverse priority order
// Writing goes to highest-priority writable layer
```

```
/bin/
  ls        → from /system/bin/ls
  git       → from /system/bin/git
  mycommand → from /home/user/bin/mycommand (user override)
```

**Open questions:**
- Persist union definitions in database? Or session-scoped only?
- How to handle writes? Always to top layer? Error if read-only?
- How to show which layer a file comes from? (`ls -l` annotation?)

### Bind Mounts (Plan 9)

Mount any path at any other location (aliases):

```typescript
// Conceptual API
fs.bind('/api/data/orders', '/orders');  // Alias for convenience
fs.bind('/api/data/users/me', '/me');    // Dynamic based on session

// Now these are equivalent:
await fs.read('/orders/123.json');
await fs.read('/api/data/orders/123.json');
```

**Open questions:**
- Persist binds or session-scoped?
- Symlinks already provide this - is bind mount different enough to justify?
- Circular bind detection?

### Per-Session Namespaces (Plan 9)

Plan 9's killer feature: each process could have its own filesystem namespace. Already partially implemented via per-session FS instances, but could extend:

```typescript
// Session-specific mounts
session.fs.mount('/scratch', new TempStorageMount(session.id));
session.fs.bind(`/home/${session.username}`, '/home/me');

// Different sessions see different /home/me
```

**Open questions:**
- How much namespace customization to allow?
- Security implications of user-defined mounts?
- Persist custom namespace or recreate on login?

---

## Open Questions

| Question | Recommendation |
|----------|----------------|
| **Permissions enforcement?** | Reflect for display only initially. Full enforcement requires groups/ACLs. |
| **Caching?** | No caching initially. Add optional per-session cache later if needed. |
| **Symlinks across mounts?** | Support. Resolve at FS layer before delegating to mount. |
| **Large files?** | Add streaming `readStream()`/`writeStream()` for files >1MB. |
| **Event persistence?** | Events are ephemeral (in-memory). Could add event log table for replay. |
| **Live queries?** | Integrate with filters table + event bus. Needs efficient change detection. |
| **Field-level filesystem?** | Good for v3, implement after FS foundation is solid. |

---

## Related Documents

- [FS_DESIGN.md](./FS_DESIGN.md) - Original design proposal
- [TTY_FILESYSTEM_V2.md](./TTY_FILESYSTEM_V2.md) - TTY path structure and SFTP design

---

*Document created: 2025-11-27*
*Last updated: 2025-11-28*
*Status: Phase 4.5 complete - LocalMount implemented*

### Corrections Made (2025-11-27)
- Fixed `System` interface: `tenant` not `tenantId`, `Database` not `DatabaseService`
- Fixed `getUser()`: synchronous, returns `UserInfo`
- Fixed describe service calls: `describe.models.selectOne()` not `describe.getModel()`
- Fixed database method signatures: `selectOne(model, { where })`, `updateOne(model, id, changes)`, `deleteOne(model, id)`
- Replaced YAML model definition with SQL DDL for `fs`
- Added `bytea` type prerequisite (not currently in field type system)
- Fixed `createSystemFromToken` → `systemInitFromJWT` + `new System()`
- Fixed `adapter.raw()` → `database.execute()`
- Added Phase 0 for prerequisites
- Added Event Notifications section with observer-based watch/notify
- Added Phase 6 for event notifications implementation
- Added Future Concepts section (Plan 9/BeOS ideas): live queries, query files, xattrs, union/bind mounts, per-session namespaces
- Noted that saved queries use existing `filters` table

### Implementation Notes (2025-11-27) - Phase 0 & 1

**Phase 0: Binary type**
- User-facing type renamed from `bytea` to `binary` for better UX
- Follows same pattern as `decimal` → `numeric` in PostgreSQL

**Phase 1: FS Core**
- FS constructor does not auto-mount; consumers call `mount()` explicitly
- Added `setFallback(handler: Mount)` instead of hardcoded `this.storage` fallback
- Throws `ENOENT` if no mount matches and no fallback set
- Added `mountPath` field to `ResolvedPath` interface for cross-mount rename detection
- SystemMount `startTime` is per-instance (session uptime), not module-level (server uptime)

**Files created:**
- `src/lib/fs/types.ts` - FSEntry, FSError, Mount interface, ResolvedPath
- `src/lib/fs/index.ts` - FS class with mount resolution and path utilities
- `src/lib/fs/mounts/system-mount.ts` - Read-only /system mount

### Implementation Notes (2025-11-27) - Phase 2

**DescribeMount** (`/api/describe`)
- Structure matches HTTP API: `/api/describe/:model/fields/:field`
- Model directories contain `.yaml`, `.json` (hidden, full schema) and `fields/` subdirectory
- Field files have no extension, output YAML

**DataMount** (`/api/data`)
- Full CRUD: read, write (create/update), unlink (delete)
- Record files use UUID as filename (no extension)
- Write detects existing record for update vs create

**FindMount** (`/api/find`)
- Uses saved filters from `filters` table (not ad-hoc queries)
- Only models with saved filters appear in listing
- Reading a filter file executes the query, returns JSON results

**TrashedMount** (`/api/trashed`)
- Like DataMount but queries with `trashed: 'only'`
- Read-only (mode 0o444)
- Only models with trashed records appear in listing
- Uses `trashed_at` as mtime

**Skipped:**
- AggregateMount - requires parameterized queries, poor filesystem fit
- TrackedMount - audit logs, deferred
- UserMount - overlaps with /system/whoami, sensitive data

**Files created:**
- `src/lib/fs/mounts/describe-mount.ts`
- `src/lib/fs/mounts/data-mount.ts`
- `src/lib/fs/mounts/find-mount.ts`
- `src/lib/fs/mounts/trashed-mount.ts`

### Implementation Notes (2025-11-27) - Phase 3: HTTP Routes

**FS HTTP Routes** (`/fs/*`)
- Minimal middleware: `authValidatorMiddleware` only (no body parsing, format detection, or response transformation)
- Uses `runTransaction()` internally for proper database access
- Routes:
  - `GET /fs/*` - Read file or list directory (`?stat=true` for metadata only)
  - `PUT /fs/*` - Write file content
  - `DELETE /fs/*` - Delete file
- Error responses use POSIX codes: ENOENT→404, EROFS→405, EISDIR→400, etc.

**Auth Middleware Consolidation**
- Merged `jwtValidatorMiddleware` + `userValidatorMiddleware` → `authValidatorMiddleware`
- Single middleware validates token/API key AND user in one pass
- API key auth: eliminates redundant user query (was 3 queries → now 2)
- JWT auth: validates signature then queries user for fresh permissions
- Fresh DB permissions override stale JWT claims

**Integration Tests**
- Test infrastructure auto-starts server if not running (uses `bun`)
- HttpClient gained `getRaw/putRaw/deleteRaw` methods for raw Response access
- 24 tests covering all mounts: system, describe, data, trashed

**Files created:**
- `src/routes/fs/routes.ts` - FS HTTP route handlers
- `src/lib/middleware/auth-validator.ts` - Consolidated auth middleware
- `spec/50-fs-api/fs-basic.test.ts` - Integration tests

**Files modified:**
- `src/index.ts` - Route registration, middleware chain
- `spec/test-infrastructure.ts` - Auto-start server
- `spec/http-client.ts` - Raw response methods

### Implementation Notes (2025-11-28) - Phase 4: ModelBackedStorage

**ModelBackedStorage** (`src/lib/fs/storage.ts`)
- Database-backed persistent file storage in `fs` table
- Supports full Mount interface: stat, readdir, read, write, mkdir, unlink, rmdir, rename, chmod, chown, symlink, readlink
- Binary content stored as BLOB (PostgreSQL `bytea`, SQLite `BLOB`)
- Fixed SQLite BLOB handling: `Uint8Array` converted to `Buffer` on read
- Automatic parent directory validation on file/directory creation

**initializeFS()** function creates default directory structure:
- `/` - root directory
- `/home` - user home directories
- `/tmp` - temporary files (sticky bit)
- `/etc` - configuration files
- `/home/{username}` - per-user home directory

**Database Schema:**
- Table renamed from `fs_nodes` → `fs` for consistency
- UUID validation pattern relaxed to accept nil UUIDs and test UUIDs
- Foreign key constraint on `owner_id` references `users(id)`

**Files created:**
- `src/lib/fs/storage.ts` - ModelBackedStorage implementation

**Files modified:**
- `src/lib/sql/tenant.pg.sql` - PostgreSQL DDL for `fs` table
- `src/lib/sql/tenant.sqlite.sql` - SQLite DDL for `fs` table
- `src/lib/infrastructure.ts` - TENANT_SEED_SQLITE with fs model/fields
- `src/lib/validators/types.ts` - UUID validation pattern fix
- `src/observers/all/5/50-sql-create-sqlite.ts` - Uint8Array handling
- `src/observers/all/5/50-sql-update-sqlite.ts` - Uint8Array handling

### Implementation Notes (2025-11-28) - Phase 4.5: LocalMount

**LocalMount** (`src/lib/fs/mounts/local-mount.ts`)
- Mounts a host filesystem directory into the virtual filesystem
- Use cases:
  - Mount plugin/observer directories for dynamic loading
  - Mount user's local home directory to their virtual /home/{user}
  - Expose workspace directories for import/export
  - Bridge real files with virtual filesystem operations

**Security:**
- All paths resolved relative to `basePath`
- Path traversal attacks (`../`) blocked via `resolvePath()` validation
- Symlinks pointing outside basePath are rejected
- Read-only mode available via `{ writable: false }` option

**API:**
```typescript
// Read-write mount
const mount = new LocalMount('/path/to/host/dir');

// Read-only mount
const readOnlyMount = new LocalMount('/path/to/dir', { writable: false });

// Mount into FS
fs.mount('/plugins', new LocalMount('/host/plugins', { writable: false }));
fs.mount('/workspace', new LocalMount('/host/user/workspace'));
```

**Files created:**
- `src/lib/fs/mounts/local-mount.ts` - LocalMount implementation
- `spec/45-fs-api/local-mount.test.ts` - 33 tests

**Files modified:**
- `src/lib/fs/index.ts` - Added LocalMount export
- `src/lib/fs/types.ts` - Added EIO error code

### Naming Change (2025-11-28)

Renamed from VFS (Virtual Filesystem) to FS (Filesystem):
- More concise and follows Unix convention
- All references changed: `vfs` → `fs`, `VFS` → `FS`
- Table renamed: `fs_nodes` → `fs`
- Routes: `/vfs/*` → `/fs/*`
- Test directory: `spec/50-vfs-api` → `spec/45-fs-api`

### Implementation Notes (2025-11-28) - Phase 3: TTY Redesign

**Architecture Decision: Clean Rewrite**
- Original TTY in `packages/app-tty` (~2000 LOC) backed up to `packages/app-tty.backup/`
- New TTY in `src/lib/tty/` (~960 LOC) - core library, not app package
- App packages are for `/app/*` HTTP routes; TTY is separate server/port

**Key Design Changes:**

1. **Direct Auth via auth.ts**
   - Created `src/lib/auth.ts` with `login()` function
   - Both HTTP `/auth/login` route and TTY use same auth logic
   - No more ApiClient HTTP calls for authentication

2. **Session stores SystemInit, not JWT token**
   ```typescript
   interface Session {
     systemInit: SystemInit | null;  // Set after login
     // ... other fields
   }
   ```

3. **Transaction per Command**
   - Each command runs in `runTransaction(session.systemInit, ...)`
   - FS created fresh per command via `createFS(system)`
   - Atomic operations: `rm` commits even if connection drops

4. **FS-based Commands** (~350 LOC vs 794 LOC)
   - Commands receive `(session, fs, args, write)`
   - Path resolution via `fs.resolve(session.cwd, path)`
   - Error handling via FSError catch blocks
   - No more `parsePath()` with hardcoded path types

**Files created:**
- `src/lib/auth.ts` - Core authentication logic
- `src/lib/tty/types.ts` - Session, TTYStream, Config interfaces
- `src/lib/tty/parser.ts` - Command parsing (adapted from original)
- `src/lib/tty/fs-factory.ts` - `createFS(system)` with all mounts
- `src/lib/tty/commands.ts` - Core commands: ls, cd, cat, rm, mkdir, etc.
- `src/lib/tty/session-handler.ts` - Auth flow, command dispatch
- `src/lib/tty/telnet-server.ts` - Telnet transport
- `src/lib/tty/ssh-server.ts` - SSH transport
- `src/lib/tty/index.ts` - Public exports

**Files modified:**
- `src/routes/auth/login/POST.ts` - Refactored to use auth.ts (200 LOC → 70 LOC)

**Remaining work:**
- Integrate TTY server startup with main API (`src/index.ts`)
- Test telnet and SSH connections
- Verify SFTP design compatibility

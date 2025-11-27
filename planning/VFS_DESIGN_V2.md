# VFS Design v2 - Implementation Analysis

## Overview

This document expands on VFS_DESIGN.md with implementation details based on analysis of the existing Monk API codebase. It includes architectural context to enable implementation without re-research.

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
│   ├── app-tty/                   # Telnet/SSH shell (current VFS consumer)
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
interface System {
  userId: string;
  tenantId: string;
  dbType: 'postgresql' | 'sqlite';
  dbName: string;
  nsName: string;        // Namespace (schema)
  access: AccessLevel;   // 'root' | 'full' | 'edit' | 'read' | 'deny'

  // Services
  database: DatabaseService;
  describe: DescribeService;
  adapter: DatabaseAdapter;

  // Methods
  getUser(): Promise<User>;
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

## VFS Architecture

### Design Goals

1. **Generic Core, Specific Mounts** - VFS knows paths and entries, not Monk APIs
2. **Real Storage by Default** - `vfs_nodes` table for `/home`, `/tmp`, `/etc`
3. **Direct Database Access** - Mounts use `System.database`, not HTTP
4. **Session-Scoped** - Each VFS instance bound to authenticated session
5. **Transport-Agnostic** - Same VFS serves TTY, SFTP, and potential HTTP explorer

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
│         │          │              VFS                │               │
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
src/lib/vfs/
├── index.ts              # VFS class, mount table, path resolution
├── types.ts              # VFSEntry, Mount interface, VFSError
├── storage.ts            # ModelBackedStorage (vfs_nodes table)
└── mounts/
    ├── data-mount.ts         # /api/data/:model/:id.json
    ├── describe-mount.ts     # /api/describe/:model.yaml
    ├── find-mount.ts         # /api/find/:model (query execution)
    ├── aggregate-mount.ts    # /api/aggregate/:model
    ├── system-mount.ts       # /system/* pseudo-files
    └── app-mount.ts          # /app/* installed packages
```

**Rationale**: VFS lives in core `src/lib/` because it's reusable across:
- TTY shell commands
- SFTP subsystem (ssh2)
- Potential HTTP `/vfs/*` explorer endpoint
- MCP file operations

---

## Core Interfaces

### VFSEntry

```typescript
interface VFSEntry {
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

### VFSError

```typescript
type VFSErrorCode =
  | 'ENOENT'    // No such file or directory
  | 'EEXIST'    // File exists
  | 'EISDIR'    // Is a directory (can't read as file)
  | 'ENOTDIR'   // Not a directory (can't list)
  | 'EACCES'    // Permission denied
  | 'ENOTEMPTY' // Directory not empty
  | 'EROFS'     // Read-only filesystem
  | 'EINVAL';   // Invalid argument

class VFSError extends Error {
  constructor(
    public code: VFSErrorCode,
    public path: string,
    message?: string
  ) {
    super(message || `${code}: ${path}`);
    this.name = 'VFSError';
  }
}
```

### Mount Interface

```typescript
interface Mount {
  // Required: navigation
  stat(path: string): Promise<VFSEntry>;
  readdir(path: string): Promise<VFSEntry[]>;

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

### VFS Class

```typescript
class VFS {
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
  stat(path: string): Promise<VFSEntry>;
  readdir(path: string): Promise<VFSEntry[]>;
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
class VFS {
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
async readdir(path: string): Promise<VFSEntry[]> {
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

  async stat(path: string): Promise<VFSEntry> {
    const parts = this.parsePath(path);

    if (parts.type === 'root') {
      return { name: 'data', type: 'directory', size: 0, mode: 0o755 };
    }

    if (parts.type === 'model') {
      // Verify model exists
      const schema = await this.system.describe.getModel(parts.model);
      if (!schema) throw new VFSError('ENOENT', path);
      return {
        name: parts.model,
        type: 'directory',
        size: 0,
        mode: 0o755,
        mtime: schema.updated_at,
      };
    }

    if (parts.type === 'record') {
      const record = await this.system.database.selectOne(parts.model, { id: parts.id });
      if (!record) throw new VFSError('ENOENT', path);
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

    throw new VFSError('ENOENT', path);
  }

  async readdir(path: string): Promise<VFSEntry[]> {
    const parts = this.parsePath(path);

    if (parts.type === 'root') {
      // List all models
      const models = await this.system.describe.listModels();
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

    throw new VFSError('ENOTDIR', path);
  }

  async read(path: string): Promise<string> {
    const parts = this.parsePath(path);
    if (parts.type !== 'record') {
      throw new VFSError('EISDIR', path);
    }

    const record = await this.system.database.selectOne(parts.model, { id: parts.id });
    if (!record) throw new VFSError('ENOENT', path);
    return JSON.stringify(record, null, 2);
  }

  async write(path: string, content: string): Promise<void> {
    const parts = this.parsePath(path);
    if (parts.type !== 'record') {
      throw new VFSError('EISDIR', path);
    }

    const data = JSON.parse(content);

    // Check if record exists
    const existing = await this.system.database.selectOne(parts.model, { id: parts.id });
    if (existing) {
      await this.system.database.updateOne(parts.model, { id: parts.id }, data);
    } else {
      await this.system.database.createOne(parts.model, { ...data, id: parts.id });
    }
  }

  async unlink(path: string): Promise<void> {
    const parts = this.parsePath(path);
    if (parts.type !== 'record') {
      throw new VFSError('EISDIR', path);
    }

    await this.system.database.deleteOne(parts.model, { id: parts.id });
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

  async stat(path: string): Promise<VFSEntry> {
    if (path === '/') {
      return { name: 'describe', type: 'directory', size: 0, mode: 0o755 };
    }

    const modelName = this.basename(path).replace(/\.(yaml|json)$/, '');
    const schema = await this.system.describe.getModel(modelName);
    if (!schema) throw new VFSError('ENOENT', path);

    return {
      name: `${modelName}.yaml`,
      type: 'file',
      size: 0,
      mode: 0o644,
      mtime: schema.updated_at,
    };
  }

  async readdir(path: string): Promise<VFSEntry[]> {
    if (path !== '/') throw new VFSError('ENOTDIR', path);

    const models = await this.system.describe.listModels();
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
    const schema = await this.system.describe.getModelWithFields(modelName);
    if (!schema) throw new VFSError('ENOENT', path);

    return this.toYaml(schema);
  }

  // Optional: schema editing
  async write(path: string, content: string): Promise<void> {
    const modelName = this.basename(path).replace(/\.(yaml|json)$/, '');
    const schema = yaml.parse(content);
    await this.system.describe.updateModel(modelName, schema);
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
      const user = await this.system.getUser();
      return JSON.stringify(user, null, 2);
    }],
    ['tenant', async () => this.system.tenantId],
    ['database', async () => this.system.dbName],
    ['namespace', async () => this.system.nsName],
    ['access', async () => this.system.access],
  ]);

  async stat(path: string): Promise<VFSEntry> {
    if (path === '/') {
      return { name: 'system', type: 'directory', size: 0, mode: 0o555 };
    }

    const name = path.split('/').filter(Boolean)[0];
    if (!this.files.has(name)) {
      throw new VFSError('ENOENT', path);
    }

    const content = await this.files.get(name)!();
    return {
      name,
      type: 'file',
      size: content.length,
      mode: 0o444,  // read-only
    };
  }

  async readdir(path: string): Promise<VFSEntry[]> {
    if (path !== '/') throw new VFSError('ENOTDIR', path);

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
    if (!getter) throw new VFSError('ENOENT', path);
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

### Database Model: `vfs_nodes`

```yaml
model_name: vfs_nodes
status: system
description: Virtual filesystem nodes for persistent storage

fields:
  - field_name: parent_id
    type: uuid
    index: true
    description: Parent directory (null for root)
  - field_name: name
    type: text
    required: true
    description: File or directory name
  - field_name: path
    type: text
    required: true
    description: Full absolute path (denormalized for fast lookups)
  - field_name: node_type
    type: text
    required: true
    enum_values: [file, directory, symlink]
  - field_name: content
    type: bytea
    description: File content (null for directories)
  - field_name: target
    type: text
    description: Symlink target path
  - field_name: mode
    type: integer
    default: 420  # 0o644
    description: Unix permission bits
  - field_name: size
    type: integer
    default: 0
    description: Content size in bytes
  - field_name: owner_id
    type: uuid
    description: Owner user ID

indexes:
  - fields: [path]
    unique: true
  - fields: [parent_id]
```

### ModelBackedStorage Implementation

```typescript
class ModelBackedStorage implements Mount {
  constructor(private system: System) {}

  async stat(path: string): Promise<VFSEntry> {
    const node = await this.system.database.selectOne('vfs_nodes', { path });
    if (!node) throw new VFSError('ENOENT', path);
    return this.toEntry(node);
  }

  async readdir(path: string): Promise<VFSEntry[]> {
    const parent = await this.system.database.selectOne('vfs_nodes', { path });
    if (!parent) throw new VFSError('ENOENT', path);
    if (parent.node_type !== 'directory') throw new VFSError('ENOTDIR', path);

    const children = await this.system.database.selectAny('vfs_nodes', {
      where: { parent_id: parent.id },
      order: [{ field: 'name', direction: 'asc' }],
    });

    return children.map(this.toEntry);
  }

  async read(path: string): Promise<Buffer> {
    const node = await this.system.database.selectOne('vfs_nodes', { path });
    if (!node) throw new VFSError('ENOENT', path);
    if (node.node_type === 'directory') throw new VFSError('EISDIR', path);
    return node.content || Buffer.alloc(0);
  }

  async write(path: string, content: Buffer | string): Promise<void> {
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const existing = await this.system.database.selectOne('vfs_nodes', { path });

    if (existing) {
      if (existing.node_type === 'directory') throw new VFSError('EISDIR', path);
      await this.system.database.updateOne('vfs_nodes', { id: existing.id }, {
        content: buffer,
        size: buffer.length,
      });
    } else {
      // Create new file
      const parentPath = this.dirname(path);
      const parent = await this.system.database.selectOne('vfs_nodes', { path: parentPath });
      if (!parent) throw new VFSError('ENOENT', parentPath);

      await this.system.database.createOne('vfs_nodes', {
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
    const existing = await this.system.database.selectOne('vfs_nodes', { path });
    if (existing) throw new VFSError('EEXIST', path);

    const parentPath = this.dirname(path);
    const parent = await this.system.database.selectOne('vfs_nodes', { path: parentPath });
    if (!parent) throw new VFSError('ENOENT', parentPath);

    await this.system.database.createOne('vfs_nodes', {
      parent_id: parent.id,
      name: this.basename(path),
      path,
      node_type: 'directory',
      mode,
      owner_id: this.system.userId,
    });
  }

  async unlink(path: string): Promise<void> {
    const node = await this.system.database.selectOne('vfs_nodes', { path });
    if (!node) throw new VFSError('ENOENT', path);
    if (node.node_type === 'directory') throw new VFSError('EISDIR', path);
    await this.system.database.deleteOne('vfs_nodes', { id: node.id });
  }

  async rmdir(path: string): Promise<void> {
    const node = await this.system.database.selectOne('vfs_nodes', { path });
    if (!node) throw new VFSError('ENOENT', path);
    if (node.node_type !== 'directory') throw new VFSError('ENOTDIR', path);

    // Check if empty
    const children = await this.system.database.selectAny('vfs_nodes', {
      where: { parent_id: node.id },
      limit: 1,
    });
    if (children.length > 0) throw new VFSError('ENOTEMPTY', path);

    await this.system.database.deleteOne('vfs_nodes', { id: node.id });
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    const node = await this.system.database.selectOne('vfs_nodes', { path: oldPath });
    if (!node) throw new VFSError('ENOENT', oldPath);

    const newParentPath = this.dirname(newPath);
    const newParent = await this.system.database.selectOne('vfs_nodes', { path: newParentPath });
    if (!newParent) throw new VFSError('ENOENT', newParentPath);

    await this.system.database.updateOne('vfs_nodes', { id: node.id }, {
      parent_id: newParent.id,
      name: this.basename(newPath),
      path: newPath,
    });

    // If directory, update all descendant paths
    if (node.node_type === 'directory') {
      await this.updateDescendantPaths(oldPath, newPath);
    }
  }

  private toEntry(node: VFSNode): VFSEntry {
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
    // Raw SQL for efficiency - update all paths that start with oldPrefix
    await this.system.adapter.raw(`
      UPDATE vfs_nodes
      SET path = ? || SUBSTRING(path FROM ?)
      WHERE path LIKE ?
    `, [newPrefix, oldPrefix.length + 1, oldPrefix + '%']);
  }
}
```

---

## TTY Integration

### Session Modification

Add VFS to session after authentication:

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
  vfs?: VFS;  // NEW: VFS instance after login
}
```

### Session Handler Update

```typescript
// packages/app-tty/src/session-handler.ts
import { VFS } from '../../../src/lib/vfs/index.js';
import { createSystemFromToken } from '../../../src/lib/system.js';

// After successful login (line ~147):
if (result.success && result.data?.token) {
  session.token = result.data.token;
  session.state = 'AUTHENTICATED';

  // Create VFS for this session
  const system = await createSystemFromToken(session.token);
  session.vfs = new VFS(system);

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

After (with VFS - ~200 lines total):
```typescript
commands['ls'] = async (session, args, write) => {
  const vfs = session.vfs!;
  const longFormat = args.includes('-l');
  const target = args.find(a => !a.startsWith('-')) || session.cwd;
  const resolved = vfs.resolve(session.cwd, target);

  try {
    const stat = await vfs.stat(resolved);

    if (stat.type !== 'directory') {
      // Single file
      write(formatEntry(stat, longFormat));
      return;
    }

    const entries = await vfs.readdir(resolved);
    if (longFormat) {
      write(`total ${entries.length}\n`);
    }
    for (const entry of entries) {
      write(formatEntry(entry, longFormat));
    }
  } catch (err) {
    if (err instanceof VFSError) {
      write(`ls: ${target}: ${err.message}\n`);
    } else {
      throw err;
    }
  }
};

function formatEntry(entry: VFSEntry, long: boolean): string {
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

The VFS interface maps directly to SFTP operations:

| SFTP Operation | VFS Method |
|----------------|------------|
| `OPENDIR` | `vfs.readdir()` |
| `READDIR` | Return cached entries |
| `STAT` | `vfs.stat()` |
| `LSTAT` | `vfs.stat()` (no symlink follow) |
| `OPEN` (read) | `vfs.read()` |
| `OPEN` (write) | Prepare buffer |
| `WRITE` | Append to buffer |
| `CLOSE` | `vfs.write()` with buffer |
| `REMOVE` | `vfs.unlink()` |
| `RMDIR` | `vfs.rmdir()` |
| `MKDIR` | `vfs.mkdir()` |
| `RENAME` | `vfs.rename()` |
| `SYMLINK` | `vfs.symlink()` |
| `READLINK` | `vfs.readlink()` |

### SFTP Handler Sketch

```typescript
// packages/app-tty/src/sftp-handler.ts
import { SFTPStream } from 'ssh2';
import { VFS, VFSError } from '../../../src/lib/vfs/index.js';

export function handleSFTP(stream: SFTPStream, vfs: VFS): void {
  const openFiles = new Map<number, { path: string; buffer: Buffer; flags: number }>();
  const openDirs = new Map<number, VFSEntry[]>();
  let handleCounter = 0;

  stream.on('STAT', (reqid, path) => {
    vfs.stat(path)
      .then(entry => stream.attrs(reqid, entryToAttrs(entry)))
      .catch(err => stream.status(reqid, errorToStatus(err)));
  });

  stream.on('OPENDIR', (reqid, path) => {
    vfs.readdir(path)
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
      const content = await vfs.read(file.path);
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
        await vfs.write(file.path, file.buffer);
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
async function initializeTenantVFS(system: System): Promise<void> {
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

### Phase 1: Core VFS (Foundation)
- [ ] Create `src/lib/vfs/types.ts` with interfaces
- [ ] Create `src/lib/vfs/index.ts` with VFS class
- [ ] Implement mount resolution (longest-prefix matching)
- [ ] Implement `SystemMount` (read-only, no DB needed)
- [ ] Add unit tests

### Phase 2: API Mounts
- [ ] Implement `DataMount` for `/api/data`
- [ ] Implement `DescribeMount` for `/api/describe`
- [ ] Implement `FindMount` for `/api/find` (query files)
- [ ] Implement `AggregateMount` for `/api/aggregate`
- [ ] Add integration tests

### Phase 3: TTY Refactor
- [ ] Add `vfs` property to Session interface
- [ ] Create VFS instance on login
- [ ] Refactor `commands.ts` to use VFS
- [ ] Remove `parsePath()` and switch statements
- [ ] Verify backwards compatibility

### Phase 4: Real Storage
- [ ] Create `vfs_nodes` model definition
- [ ] Implement `ModelBackedStorage`
- [ ] Add tenant initialization for `/home`, `/tmp`, `/etc`
- [ ] Support user home directories

### Phase 5: SFTP
- [ ] Add SFTP subsystem to SSH server
- [ ] Implement `sftp-handler.ts`
- [ ] Map all SFTP operations to VFS
- [ ] Test with VSCode Remote / vim netrw

---

## Open Questions

| Question | Recommendation |
|----------|----------------|
| **Permissions enforcement?** | Reflect for display only initially. Full enforcement requires groups/ACLs. |
| **Caching?** | No caching initially. Add optional per-session cache later if needed. |
| **Symlinks across mounts?** | Support. Resolve at VFS layer before delegating to mount. |
| **Large files?** | Add streaming `readStream()`/`writeStream()` for files >1MB. |
| **Watch/notify?** | Out of scope for v1. Could leverage observers later. |
| **Field-level filesystem?** | Good for v3, implement after VFS foundation is solid. |

---

## Related Documents

- [VFS_DESIGN.md](./VFS_DESIGN.md) - Original design proposal
- [TTY_FILESYSTEM_V2.md](./TTY_FILESYSTEM_V2.md) - TTY path structure and SFTP design

---

*Document created: 2025-11-27*
*Status: Analysis complete, ready for implementation*

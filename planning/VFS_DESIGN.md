# FS (Filesystem) Design

## Overview

A generic filesystem layer that lives in the API server, providing filesystem semantics over API data. The FS is mount-based: a core "real" filesystem (backed by a database model) with virtual mounts overlaid at specific paths.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       API Server                            │
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐  │
│  │    HTTP     │    │     TTY     │    │      SFTP       │  │
│  │   Routes    │    │   Server    │    │    Subsystem    │  │
│  └──────┬──────┘    └──────┬──────┘    └───────┬─────────┘  │
│         │                  │                   │            │
│         │                  ▼                   │            │
│         │           ┌───────────┐              │            │
│         │           │   Shell   │              │            │
│         │           └─────┬─────┘              │            │
│         │                 │                    │            │
│         │                 ▼                    ▼            │
│         │          ┌─────────────────────────────┐          │
│         │          │            FS              │          │
│         │          │  ┌───────────────────────┐  │          │
│         │          │  │   Mount Table         │  │          │
│         │          │  │  /api/data → DataMount│  │          │
│         │          │  │  /system → SystemMount│  │          │
│         │          │  │  / → StorageBackend   │  │          │
│         │          │  └───────────────────────┘  │          │
│         │          └─────────────┬───────────────┘          │
│         │                        │                          │
│         ▼                        ▼                          │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                     Database                        │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Design Principles

### 1. Generic Core, Specific Mounts

The FS core knows nothing about Monk APIs, models, or business logic. It only understands:
- Paths (strings)
- Entries (files and directories)
- Mounts (path → handler mapping)

All Monk-specific behavior lives in mount handlers.

### 2. Real Storage by Default

Unlike a purely filesystem, the FS has a real storage backend. Paths not covered by a mount are stored in a database model (`fs`). This enables:
- User home directories with real files
- Scripts stored in the filesystem
- Config files (`.profile`, `.aliases`)
- Temp files

### 3. Direct Database Access

Mounts have direct database access, not HTTP. This is critical for performance—a single `ls -l` shouldn't require 50 HTTP calls.

### 4. Session-Scoped Context

Each FS instance is bound to a session with:
- Authenticated user (JWT)
- Tenant context
- Working directory state

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
  ctime?: Date;           // Last status change (permissions, etc.)
  target?: string;        // For symlinks
}
```

### FSError

```typescript
class FSError extends Error {
  constructor(
    public code: FSErrorCode,
    public path: string,
    message?: string
  ) {
    super(message || `${code}: ${path}`);
  }
}

type FSErrorCode =
  | 'ENOENT'    // No such file or directory
  | 'EEXIST'    // File exists
  | 'EISDIR'    // Is a directory (can't read as file)
  | 'ENOTDIR'   // Not a directory (can't list)
  | 'EACCES'    // Permission denied
  | 'ENOTEMPTY' // Directory not empty
  | 'EROFS'     // Read-only filesystem
  | 'EINVAL';   // Invalid argument
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
  private storage: FSStorage;

  constructor(options: {
    storage: FSStorage;
    session: Session;
  }) {}

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
  mkdir(path: string): Promise<void>;
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

## Storage Backend

The storage backend handles "real" files not covered by mounts.

### Database Model: `fs`

```yaml
model_name: fs
status: system
description: Filesystem nodes for persistent storage
fields:
  - field_name: id
    type: uuid
    required: true
  - field_name: tenant_id
    type: uuid
    required: true
  - field_name: parent_id
    type: uuid
    description: Parent directory (null for root)
  - field_name: name
    type: text
    required: true
    description: File or directory name
  - field_name: path
    type: text
    required: true
    description: Full absolute path (denormalized for fast lookups)
  - field_name: type
    type: text
    required: true
    description: file, directory, or symlink
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
  - fields: [tenant_id, path]
    unique: true
  - fields: [tenant_id, parent_id]
```

### StorageBackend Implementation

```typescript
class ModelBackedStorage implements FSStorage {
  constructor(
    private db: Database,
    private tenantId: string
  ) {}

  async stat(path: string): Promise<FSEntry> {
    const node = await this.db('fs')
      .where({ tenant_id: this.tenantId, path })
      .first();

    if (!node) throw new FSError('ENOENT', path);
    return this.toEntry(node);
  }

  async readdir(path: string): Promise<FSEntry[]> {
    const parent = await this.getNode(path);
    if (parent.type !== 'directory') {
      throw new FSError('ENOTDIR', path);
    }

    const children = await this.db('fs')
      .where({ tenant_id: this.tenantId, parent_id: parent.id })
      .orderBy('name');

    return children.map(this.toEntry);
  }

  async read(path: string): Promise<Buffer> {
    const node = await this.getNode(path);
    if (node.type === 'directory') {
      throw new FSError('EISDIR', path);
    }
    return node.content || Buffer.alloc(0);
  }

  async write(path: string, content: Buffer): Promise<void> {
    const existing = await this.db('fs')
      .where({ tenant_id: this.tenantId, path })
      .first();

    if (existing) {
      if (existing.type === 'directory') {
        throw new FSError('EISDIR', path);
      }
      await this.db('fs')
        .where({ id: existing.id })
        .update({
          content,
          size: content.length,
          updated_at: new Date(),
        });
    } else {
      // Create new file
      const parentPath = dirname(path);
      const parent = await this.getNode(parentPath);

      await this.db('fs').insert({
        id: uuid(),
        tenant_id: this.tenantId,
        parent_id: parent.id,
        name: basename(path),
        path,
        type: 'file',
        content,
        size: content.length,
        mode: 0o644,
      });
    }
  }

  async mkdir(path: string): Promise<void> {
    const existing = await this.db('fs')
      .where({ tenant_id: this.tenantId, path })
      .first();

    if (existing) throw new FSError('EEXIST', path);

    const parentPath = dirname(path);
    const parent = await this.getNode(parentPath);

    await this.db('fs').insert({
      id: uuid(),
      tenant_id: this.tenantId,
      parent_id: parent.id,
      name: basename(path),
      path,
      type: 'directory',
      mode: 0o755,
    });
  }

  async unlink(path: string): Promise<void> {
    const node = await this.getNode(path);
    if (node.type === 'directory') {
      throw new FSError('EISDIR', path);
    }
    await this.db('fs').where({ id: node.id }).delete();
  }

  async rmdir(path: string): Promise<void> {
    const node = await this.getNode(path);
    if (node.type !== 'directory') {
      throw new FSError('ENOTDIR', path);
    }

    const children = await this.db('fs')
      .where({ tenant_id: this.tenantId, parent_id: node.id })
      .count('* as count')
      .first();

    if (children.count > 0) {
      throw new FSError('ENOTEMPTY', path);
    }

    await this.db('fs').where({ id: node.id }).delete();
  }

  private toEntry(node: FSNode): FSEntry {
    return {
      name: node.name,
      type: node.type,
      size: node.size || 0,
      mode: node.mode,
      mtime: node.updated_at,
      ctime: node.created_at,
      target: node.target,
    };
  }
}
```

---

## Mount Resolution

When a FS operation is called, the path is checked against mounts in order of specificity (longest path first):

```typescript
class FS {
  private sortedMounts: [string, Mount][] = [];

  mount(path: string, handler: Mount): void {
    this.mounts.set(path, handler);
    // Re-sort by path length descending (most specific first)
    this.sortedMounts = [...this.mounts.entries()]
      .sort((a, b) => b[0].length - a[0].length);
  }

  private resolve(path: string): { handler: Mount | FSStorage; relativePath: string } {
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

  async readdir(path: string): Promise<FSEntry[]> {
    const { handler, relativePath } = this.resolve(path);
    const entries = await handler.readdir(relativePath);

    // Inject mount points that appear at this level
    const normalized = this.normalize(path);
    for (const [mountPath] of this.sortedMounts) {
      const mountParent = this.dirname(mountPath);
      if (mountParent === normalized) {
        const mountName = this.basename(mountPath);
        // Don't duplicate if storage already has this entry
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
}
```

---

## Example Mounts

### DataMount (`/api/data`)

Virtualizes the data API as a filesystem.

```typescript
class DataMount implements Mount {
  constructor(
    private db: Database,
    private tenantId: string,
    private namespace: string
  ) {}

  async stat(path: string): Promise<FSEntry> {
    const parts = this.parsePath(path);

    if (parts.type === 'root') {
      return { name: 'data', type: 'directory', size: 0, mode: 0o755 };
    }

    if (parts.type === 'model') {
      // Check model exists
      const model = await this.getModel(parts.model);
      return { name: parts.model, type: 'directory', size: 0, mode: 0o755 };
    }

    if (parts.type === 'record') {
      const record = await this.getRecord(parts.model, parts.id);
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
      // List all models
      const models = await this.db('models')
        .where({ tenant_id: this.tenantId })
        .select('model_name', 'updated_at');

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
      const table = `${this.namespace}.${parts.model}`;
      const records = await this.db(table)
        .select('id', 'updated_at', 'created_at')
        .limit(10000);

      return records.map(r => ({
        name: `${r.id}.json`,
        type: 'file',
        size: 0, // Would need to fetch record to know size
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

    const record = await this.getRecord(parts.model, parts.id);
    return JSON.stringify(record, null, 2);
  }

  async write(path: string, content: string): Promise<void> {
    const parts = this.parsePath(path);

    if (parts.type !== 'record') {
      throw new FSError('EISDIR', path);
    }

    const data = JSON.parse(content);
    const table = `${this.namespace}.${parts.model}`;

    await this.db(table)
      .where({ id: parts.id })
      .update({ ...data, updated_at: new Date() });
  }

  async unlink(path: string): Promise<void> {
    const parts = this.parsePath(path);

    if (parts.type !== 'record') {
      throw new FSError('EISDIR', path);
    }

    const table = `${this.namespace}.${parts.model}`;
    await this.db(table).where({ id: parts.id }).delete();
  }

  private parsePath(path: string): PathParts {
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
```

### SystemMount (`/system`)

Read-only system information.

```typescript
class SystemMount implements Mount {
  constructor(
    private session: Session,
    private startTime: Date
  ) {}

  async stat(path: string): Promise<FSEntry> {
    const name = basename(path) || 'system';

    if (path === '/') {
      return { name, type: 'directory', size: 0, mode: 0o555 };
    }

    if (this.files.has(name)) {
      const content = await this.getContent(name);
      return { name, type: 'file', size: content.length, mode: 0o444 };
    }

    throw new FSError('ENOENT', path);
  }

  async readdir(path: string): Promise<FSEntry[]> {
    if (path !== '/') throw new FSError('ENOTDIR', path);

    return [...this.files.keys()].map(name => ({
      name,
      type: 'file',
      size: 0,
      mode: 0o444,  // read-only
    }));
  }

  async read(path: string): Promise<string> {
    const name = basename(path);
    if (!this.files.has(name)) throw new FSError('ENOENT', path);
    return this.getContent(name);
  }

  // No write/unlink - this mount is read-only

  private files = new Set([
    'version',
    'uptime',
    'whoami',
    'tenant',
    'database',
    'namespace',
  ]);

  private async getContent(name: string): Promise<string> {
    switch (name) {
      case 'version':
        return process.env.npm_package_version || '0.0.0';
      case 'uptime':
        const seconds = (Date.now() - this.startTime.getTime()) / 1000;
        return this.formatUptime(seconds);
      case 'whoami':
        return JSON.stringify(this.session.user, null, 2);
      case 'tenant':
        return this.session.tenant;
      case 'database':
        return this.session.database;
      case 'namespace':
        return this.session.namespace;
      default:
        throw new FSError('ENOENT', `/${name}`);
    }
  }

  private formatUptime(seconds: number): string {
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

### DescribeMount (`/api/describe`)

Model schemas as YAML files.

```typescript
class DescribeMount implements Mount {
  constructor(
    private db: Database,
    private tenantId: string
  ) {}

  async readdir(path: string): Promise<FSEntry[]> {
    if (path !== '/') throw new FSError('ENOTDIR', path);

    const models = await this.db('models')
      .where({ tenant_id: this.tenantId })
      .select('model_name', 'updated_at');

    return models.map(m => ({
      name: `${m.model_name}.yaml`,
      type: 'file',
      size: 0,
      mode: 0o644,
      mtime: m.updated_at,
    }));
  }

  async read(path: string): Promise<string> {
    const filename = basename(path);
    const modelName = filename.replace(/\.yaml$/, '');

    const model = await this.db('models')
      .where({ tenant_id: this.tenantId, model_name: modelName })
      .first();

    if (!model) throw new FSError('ENOENT', path);

    const fields = await this.db('model_fields')
      .where({ model_id: model.id })
      .orderBy('field_order');

    // Format as YAML
    return this.toYaml({ ...model, fields });
  }

  async write(path: string, content: string): Promise<void> {
    // Parse YAML, update model schema
    const schema = yaml.parse(content);
    // ... update models and model_fields tables
  }
}
```

---

## FS Initialization

```typescript
// In API server startup
function createFS(session: Session, db: Database): FS {
  const storage = new ModelBackedStorage(db, session.tenantId);
  const fs = new FS({ storage, session });

  // Mount API endpoints
  fs.mount('/api/data', new DataMount(db, session.tenantId, session.namespace));
  fs.mount('/api/describe', new DescribeMount(db, session.tenantId));
  fs.mount('/api/find', new FindMount(db, session.tenantId, session.namespace));
  fs.mount('/api/aggregate', new AggregateMount(db, session.tenantId, session.namespace));

  // Mount system info
  fs.mount('/system', new SystemMount(session, serverStartTime));

  // Mount apps
  fs.mount('/app', new AppMount(db, session.tenantId));

  // Ensure home directory exists
  await storage.mkdir(`/home/${session.user.username}`).catch(() => {});

  return fs;
}
```

---

## Default Directory Structure

When a tenant is created, initialize:

```
/
├── api/                    # (mount point, not stored)
├── system/                 # (mount point, not stored)
├── app/                    # (mount point, not stored)
├── home/                   # (real directory)
│   └── root/               # Default user home
├── tmp/                    # (real directory, ephemeral)
└── etc/                    # (real directory, config files)
    └── motd                # Message of the day
```

---

## Open Questions

1. **Permissions enforcement** - Should FS enforce Unix-style permissions, or just reflect them for display?

2. **Caching** - Should readdir results be cached? For how long? Per-session or global?

3. **Transactions** - Writing to multiple files atomically (e.g., rename across directories)?

4. **Large files** - Streaming reads/writes for content > N MB?

5. **Symlinks across mounts** - Can `/home/user/mymodel` symlink to `/api/data/users`?

6. **Watch/notify** - Can we support `inotify`-style events for SFTP clients?

---

*Document created: 2025-11-27*
*Status: Design phase*

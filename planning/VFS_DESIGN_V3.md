# FS Design v3 - Architecture Refinements

*Document created: 2025-11-29*
*Last updated: 2025-11-29*
*Status: Partially Implemented*

## Overview

This document captures architectural refinements to the virtual filesystem based on discussion of initialization dependencies, Unix conventions, and record representation.

---

## 1. Bootstrap Tiers

**Problem:** Current `createFS()` requires `System` (full auth context) even for static mounts that don't need it.

**Solution:** Separate initialization into tiers based on actual dependencies.

**Status:** IMPLEMENTED

### Tier 0 - Static Bootstrap (no auth)

The root filesystem from `monkfs/` should exist without any authentication:

```
/              → LocalMount(monkfs/)
├── etc/       → Static config files
├── usr/       → Static resources (man pages, etc.)
├── bin/       → Directory structure only
├── home/      → Directory structure only
├── tmp/       → Directory structure only
└── var/       → Directory structure only
```

This mount is:
- Read-only
- No database access
- No user context
- Available immediately on server start

### Tier 1 - User Session (after auth)

These mounts require authenticated user context:

```
/tmp              → MemoryMount (per-user, shared across sessions)
/home/{username}  → DatabaseMount (persistent, database-backed)
/proc             → ProcMount (session-aware)
/api/data         → DataMount
/api/describe     → DescribeMount
/api/find         → FilterMount
/api/trashed      → TrashedMount
/system           → SystemMount
```

### Implementation Notes

1. **Decouple FS from System**
   - `FS` constructor should not require `System`
   - Mounts declare their own context requirements
   - Factory functions for different tiers

2. **Layered mounting**
   ```typescript
   // Tier 0: Static (called once at server start)
   const baseFS = new FS();
   baseFS.mount('/', new LocalMount(monkfsPath, { writable: false }));

   // Tier 1: User session (called after auth)
   function applyUserMounts(fs: FS, system: System, username: string): void {
       fs.mount('/tmp', getUserTmpMount(username));
       fs.mount(`/home/${username}`, new DatabaseMount(system));
       fs.mount('/api/data', new DataMount(system));
       // ... etc
   }
   ```

---

## 2. `/tmp` Scope: Per-User

**Previous:** Per-tenant (shared by all users in tenant)

**Revised:** Per-user (shared across that user's sessions)

**Status:** IMPLEMENTED

### Rationale

- Two telnet windows for same user = same `/tmp` (intuitive)
- Different users = isolated `/tmp` (secure)
- Session disconnect doesn't lose `/tmp` contents (user can reconnect)
- User logout could optionally clear their `/tmp`

### Implementation

File: `src/lib/fs/mounts/memory-mount.ts`

```typescript
export class UserTmpRegistry {
    private static mounts = new Map<string, MemoryMount>();

    static get(tenant: string, username: string): MemoryMount {
        const key = `${tenant}:${username}`;
        let mount = this.mounts.get(key);
        if (!mount) {
            mount = new MemoryMount();
            this.mounts.set(key, mount);
        }
        return mount;
    }

    static clear(): void { /* for testing */ }
    static remove(tenant: string, username: string): void { /* user logout */ }
    static removeTenant(tenant: string): void { /* tenant deletion */ }
}
```

**Adjustment:** Added `removeTenant()` method to clear all user mounts when a tenant is deleted.

### Factory Usage

File: `src/lib/fs/factory.ts`

```typescript
// Per-user when username provided, otherwise falls back to per-tenant
if (options?.username) {
    fs.mount('/tmp', UserTmpRegistry.get(system.tenant, options.username));
} else {
    fs.mount('/tmp', MemoryMountRegistry.get(system.tenant));
}
```

---

## 3. API Path: `/api` (not `/var/api`)

**Decision:** Keep `/api` to match HTTP API paths.

**Status:** IMPLEMENTED (no change needed)

### Rationale

- `GET /api/data` → `ls /api/data` (consistent)
- `GET /api/describe/users` → `cat /api/describe/users` (consistent)
- FHS compliance is less important than API consistency
- Shell commands (`select`, `insert`, `update`, `delete`) are the primary data interface anyway

### Mount Structure

```
/api/
├── data/           → DataMount (CRUD)
├── describe/       → DescribeMount (schemas)
├── find/           → FilterMount (saved queries)
└── trashed/        → TrashedMount (soft-deleted)
```

---

## 4. Records as Directories

**Previous:** Records as JSON files (`/api/data/users/1234` returns full JSON)

**Revised:** Records as directories with properties as files

**Status:** IMPLEMENTED

### Structure

```
/api/data/users/
├── 1234/                    # Record directory
│   ├── id                   # Read-only file (0o444)
│   ├── username             # Read/write file (0o644)
│   ├── email                # Read/write file (0o644)
│   ├── access               # Read/write file (0o644)
│   ├── created_at           # Read-only file (0o444)
│   └── updated_at           # Read-only file (0o444)
├── 5678/
│   └── ...
```

### Operations

| Action | Command | Works? |
|--------|---------|--------|
| List records | `ls /api/data/users/` | Yes |
| List fields | `ls /api/data/users/1234/` | Yes |
| Read field | `cat /api/data/users/1234/email` | Yes |
| Update field | `echo "new@email.com" > /api/data/users/1234/email` | Yes |
| Delete record | `rm -r /api/data/users/1234/` | Yes (via rmdir) |
| Create record | ??? | No - use `insert` command |

### Read-Only Fields

File: `src/lib/fs/mounts/data-mount.ts`

```typescript
const READONLY_FIELDS = new Set([
    'id',
    'created_at',
    'updated_at',
    'trashed_at',
    'deleted_at',
    'access_read',
    'access_edit',
    'access_full',
    'access_deny',
]);
```

**Adjustment:** Added ACL fields (`access_*`) to read-only list.

### HTTP Route Update

File: `src/routes/fs/routes.ts`

The `DELETE /fs/*` route now auto-detects directories vs files:

```typescript
export async function FsDelete(c: Context) {
    // ...
    const entry = await system.fs.stat(path);
    if (entry.type === 'directory') {
        await system.fs.rmdir(path);
    } else {
        await system.fs.unlink(path);
    }
}
```

### TrashedMount

File: `src/lib/fs/mounts/trashed-mount.ts`

Updated to match DataMount structure (records as directories, fields as files). All fields are read-only (mode `0o444`).

---

## 5. Rename ModelBackedStorage

**Status:** IMPLEMENTED

### File Changes

| Before | After |
|--------|-------|
| `src/lib/fs/storage.ts` | Deleted |
| `ModelBackedStorage` class | `src/lib/fs/mounts/database-mount.ts` as `DatabaseMount` |
| `initializeFS()` function | `src/lib/fs/init.ts` |

### Backward Compatibility

```typescript
// In database-mount.ts
/** @deprecated Use DatabaseMount instead */
export const ModelBackedStorage = DatabaseMount;

// Re-exported from index.ts for external consumers
```

---

## 6. Lightweight Type Checking

**Status:** IMPLEMENTED (added during implementation)

**Problem:** `isFile()` and `isDirectory()` called `stat()`, which for DataMount means a database query just to check type. But type is deterministic from path structure.

### Solution

Added `getType()` to Mount interface and `statType()` to FS class.

File: `src/lib/fs/types.ts`

```typescript
export type FSEntryType = 'file' | 'directory' | 'symlink';

export interface Mount {
    /**
     * Get entry type from path structure (optional, no I/O)
     * Returns null if I/O is required to determine type.
     */
    getType?(path: string): FSEntryType | null;
    // ...
}
```

File: `src/lib/fs/index.ts`

```typescript
async statType(path: string): Promise<FSEntryType | null> {
    const { handler, relativePath } = this.resolvePath(path);

    // Try lightweight getType first (no I/O)
    if (handler.getType) {
        const type = handler.getType(relativePath);
        if (type !== null) return type;
    }

    // Fall back to full stat
    const entry = await handler.stat(relativePath);
    return entry.type;
}

async isFile(path: string): Promise<boolean> {
    return (await this.statType(path)) === 'file';
}

async isDirectory(path: string): Promise<boolean> {
    return (await this.statType(path)) === 'directory';
}
```

File: `src/lib/fs/mounts/data-mount.ts` (and `trashed-mount.ts`)

```typescript
getType(path: string): FSEntryType | null {
    const segments = path.split('/').filter(Boolean);
    if (segments.length <= 2) return 'directory';  // root, model, record
    if (segments.length === 3) return 'file';       // field
    return null;
}
```

**Result:** For DataMount/TrashedMount, `isDirectory()` and `isFile()` require zero database queries.

---

## 7. Summary of Decisions

| Topic | Decision | Status |
|-------|----------|--------|
| Bootstrap tiers | Tier 0 (static) vs Tier 1 (auth) | Implemented |
| `/tmp` scope | Per-user (shared across sessions) | Implemented |
| API path | `/api/*` (matches HTTP routes) | Implemented |
| Records | Directories with field files | Implemented |
| Create records | Shell command (`insert`), not FS | Implemented |
| ModelBackedStorage | Rename to `DatabaseMount`, move to `mounts/` | Implemented |
| Type checking | Lightweight `getType()` / `statType()` | Implemented |

---

## 8. Implementation Order

1. ~~**Rename/move ModelBackedStorage**~~ → `DatabaseMount` in `mounts/` ✅
2. ~~**Extract `initializeFS()`**~~ → `src/lib/fs/init.ts` ✅
3. ~~**Refactor `/tmp`**~~ → Per-user via `UserTmpRegistry` ✅
4. ~~**Refactor DataMount**~~ → Records as directories with field files ✅
5. ~~**Add lightweight type checking**~~ → `getType()` / `statType()` ✅
6. ~~**Decouple FS from System**~~ → Tiered initialization ✅
7. ~~**Update factory**~~ → Separate bootstrap vs user-session mounting ✅

---

## 9. Implementation Complete

All items implemented:

### FS Constructor

`FS` constructor now takes optional `System`:
```typescript
export class FS {
    constructor(public readonly system?: System) {}
}
```

### Tiered Factory (src/lib/fs/factory.ts)

```typescript
// Tier 0: Static (called once at server start, no auth)
export function createBaseFS(): FS {
    const fs = new FS();
    fs.mount('/', new LocalMount(monkfsPath, { writable: false }));
    return fs;
}

// Tier 1: User session (called after auth)
export function applyUserMounts(fs: FS, system: System, options?: UserMountOptions): void {
    fs.mount('/tmp', UserTmpRegistry.get(system.tenant, options.username));
    fs.mount('/api/data', new DataMount(system));
    fs.mount('/api/describe', new DescribeMount(system));
    // ... etc
}

// Convenience: Both tiers in one call
export function createFS(system: System, options?: UserMountOptions): FS
```

---

## Related Documents

- [VFS_DESIGN.md](./VFS_DESIGN.md) - Original design
- [VFS_DESIGN_V2.md](./VFS_DESIGN_V2.md) - Implementation details

# TTY Filesystem v2 Design

## Overview

The TTY interface (`@monk/app-tty`) provides a telnet-style shell for navigating Monk API data as a Unix filesystem. This document outlines the v2 design that mirrors the HTTP API structure directly.

## Current State (v1)

```
/                     # Tenant root (implicit from JWT)
├── users/
│   └── {id}.json
├── models/
│   └── {id}.json
└── credentials/
    └── {id}.json
```

Simple flat structure where models are top-level directories. Works, but doesn't reflect the full API surface.

## Proposed Structure (v2)

```
/
├── api/
│   ├── data/
│   │   ├── users/
│   │   │   └── {id}.json
│   │   ├── models/
│   │   │   └── {id}.json
│   │   └── {model}/
│   │       └── {id}.json
│   ├── describe/
│   │   ├── users.yaml
│   │   ├── models.yaml
│   │   └── {model}.yaml
│   ├── find/
│   │   └── {model}/          # POST queries as files?
│   └── aggregate/
│       └── {model}/
├── app/
│   ├── mcp/
│   │   ├── status
│   │   ├── sessions/
│   │   └── commands
│   ├── grids/
│   ├── todos/
│   └── tty/                  # Meta: TTY managing itself
└── system/
    ├── version               # "5.1.0"
    ├── uptime                # "2h 34m"
    ├── whoami                # Decoded JWT info
    ├── tenant                # Current tenant name
    ├── database              # Current database
    ├── namespace             # Current namespace
    └── connections           # Active TTY sessions
```

## Design Principles

### 1. Mirror HTTP Routes
The filesystem should match the API URL structure exactly:
- `cat /api/data/users/123.json` ≈ `GET /api/data/users/123`
- `ls /api/data/users/` ≈ `GET /api/data/users`
- `cat /api/describe/users.yaml` ≈ `GET /api/describe/users`

### 2. Tenant Context from JWT
The path does NOT include database/namespace. Tenant context comes from the login JWT. This keeps paths clean and matches how the HTTP API works.

### 3. Files Have Extensions
- `.json` for data records
- `.yaml` for schema definitions
- No extension for system pseudo-files (like `/proc`)

## Component Details

### /api/data/
Standard CRUD operations on model records.

| Operation | Shell Command | HTTP Equivalent |
|-----------|--------------|-----------------|
| List | `ls /api/data/users/` | `GET /api/data/users` |
| Read | `cat /api/data/users/123.json` | `GET /api/data/users/123` |
| Create | `echo '{"name":"x"}' > /api/data/users/` | `POST /api/data/users` |
| Update | `echo '{"name":"y"}' > /api/data/users/123.json` | `PUT /api/data/users/123` |
| Delete | `rm /api/data/users/123.json` | `DELETE /api/data/users/123` |

### /api/describe/
Model schemas as YAML files.

```bash
$ cat /api/describe/users.yaml
model_name: users
description: System users
fields:
  - field_name: id
    type: uuid
    required: true
  - field_name: name
    type: text
  - field_name: auth
    type: text
    required: true
...
```

**Future**: `vi /api/describe/users.yaml` to edit schemas (dangerous but powerful).

### /api/find/ and /api/aggregate/
Query endpoints. These are trickier since they're POST-based.

Options:
1. **Named query files**: Save queries as files, execute by reading
   ```bash
   $ echo '{"where":{"active":true}}' > /api/find/users/active_users.query
   $ cat /api/find/users/active_users.query
   [{"id":"...","name":"Alice"}, ...]
   ```

2. **Pipe syntax**:
   ```bash
   $ echo '{"where":{"active":true}}' | query /api/find/users
   ```

3. **Interactive mode**: Special command
   ```bash
   $ find /api/data/users -where '{"active":true}'
   ```

### /app/
Installed app packages. Each app can expose:
- `status` - Health/state information
- `config` - Configuration (readable, maybe writable)
- `commands` - Write to trigger actions
- `logs` - Recent activity
- App-specific data directories

Example:
```bash
$ cat /app/mcp/status
{
  "sessions": 3,
  "uptime": "4h 22m",
  "last_request": "2025-11-27T20:45:00Z"
}

$ echo '{"action":"cleanup"}' > /app/mcp/commands
Cleaned up 2 stale sessions.
```

### /system/
System introspection (like `/proc` on Linux).

| File | Content |
|------|---------|
| `/system/version` | API version string |
| `/system/uptime` | Server uptime |
| `/system/whoami` | Current user info from JWT |
| `/system/tenant` | Current tenant name |
| `/system/database` | Database name (e.g., "monk") |
| `/system/namespace` | Namespace (e.g., "ns_tenant_foo") |
| `/system/connections` | Active TTY sessions |
| `/system/env` | Environment info |

## Natural Language Integration

Special command prefixes for LLM-powered queries:

### `!` - Action Mode
Makes changes, requires confirmation for destructive operations.

```bash
$ ! find users who haven't logged in for 90 days and mark them inactive

Found 12 users. Marking inactive...
Updated 12 records.

$ ! delete all trashed records older than 30 days

⚠️  This will permanently delete 47 records across 5 models.
Proceed? (yes/no):
```

### `@` - Query Mode
Read-only exploration and explanation.

```bash
$ @ how many users signed up this month?

23 users created since Nov 1, 2025.

$ @ explain the relationship between users and credentials

The credentials model stores authentication secrets for users.
Each credential has a user_id foreign key linking to users.id.
A user can have multiple credentials (password, API keys, etc.)

$ @ what's the largest table?

Model sizes:
  1. tracked     - 145,203 records (23.4 MB)
  2. audit_logs  -  52,891 records (8.2 MB)
  3. users       -   1,247 records (0.3 MB)
```

### Implementation Notes
- LLM receives: JWT (for auth), current path, schema context, recent commands
- LLM can call API tools to fetch data
- Results formatted for terminal width
- Command history provides conversation context

## Additional Ideas

### Tab Completion
- Model names: `cd /api/data/<TAB>` → shows models
- Record IDs: `cat /api/data/users/<TAB>` → shows recent/matching IDs
- Commands: `<TAB>` → shows available commands

### Aliases
```bash
$ alias ll='ls -l'
$ alias data='cd /api/data'
$ alias desc='cd /api/describe'
```

### History
```bash
$ history
  1  cd /api/data/users
  2  ls
  3  cat abc123.json
  4  ! find inactive users
```

### Pipes and Filters
```bash
$ ls /api/data/users | head -5
$ cat /api/data/users/*.json | jq '.name'
$ find /api/data -name "*.json" -mtime -7
```

### Watch Mode
```bash
$ watch ls /api/data/users    # Refresh every 2s
$ tail -f /app/mcp/logs       # Stream logs
```

### Multi-Tenant (Future)
If needed, could add tenant switching:
```bash
$ su tenant:other_tenant
Password: ****
Switched to other_tenant

$ tenant
other_tenant

$ exit
Returned to original_tenant
```

## Migration Path

1. **v1.1**: Add `/api/data/` prefix, keep flat model structure working
2. **v1.2**: Add `/api/describe/` with YAML schemas
3. **v1.3**: Add `/system/` pseudo-files
4. **v1.4**: Add `/app/` directory
5. **v2.0**: Natural language integration (`!` and `@`)

## Open Questions

1. **Query syntax**: How to handle POST-based endpoints like `/api/find`?
2. **Binary files**: How to handle non-JSON data (images, files)?
3. **Transactions**: Should multi-file operations be atomic?
4. **Permissions**: Map model access controls to Unix permissions?
5. **Symlinks**: Could be useful for shortcuts or aliases

---

*Document created: 2025-11-27*
*Status: Design discussion*

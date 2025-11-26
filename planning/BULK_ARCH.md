# Bulk Operations Architecture

## Overview

This document defines the scope and responsibilities of the various tools for managing groups of records/models in the Monk API platform.

---

## Responsibility Matrix

| Tool | Scope | Direction | Operation | Format | Atomic |
|------|-------|-----------|-----------|--------|--------|
| **Data API** | Single model | Read/Write | Additive | JSON | Per-request |
| **Bulk API** | Multi-model | Read/Write | Additive | JSON | Yes |
| **Describe API** | Schema | Read/Write | Additive | JSON/YAML | Per-model |
| **Extracts** | Partial/Full | Export | N/A | ZIP (YAML + JSONL) | N/A |
| **Restores** | Partial/Full | Import | Additive | ZIP (YAML + JSONL) | Configurable |
| **Snapshots** | Full tenant | Internal | Replacement | SQLite | Yes |
| **Sandboxes** | Full tenant | Clone | Replacement | SQLite tenant | Yes |
| **Fixtures** | Full tenant | Provision | Additive | YAML source | Yes |

---

## Tool Definitions

### Data API (`/api/data/:model`)

**Purpose**: Single-model runtime CRUD operations.

- Standard REST endpoints for create/read/update/delete
- Supports array-based operations (`createAll`, `updateAll`, `deleteAll`)
- All operations go through observer pipeline
- JSON request/response format

**When to use**: Normal application data operations.

---

### Bulk API (`/api/bulk`)

**Purpose**: Multi-model atomic transactions (data only).

- Execute multiple operations in a single atomic transaction
- Supports all Data API operation types across multiple models
- Rollback on any failure
- **Does NOT include schema/describe operations** (data only)

**When to use**: Complex workflows requiring atomicity across models.

**Example**:
```json
{
  "operations": [
    { "operation": "create-one", "model": "orders", "data": { "status": "pending" } },
    { "operation": "update-one", "model": "inventory", "id": "xxx", "data": { "quantity": 99 } }
  ]
}
```

---

### Describe API (`/api/describe/:model`)

**Purpose**: Schema management (models and fields).

**Current capabilities**:
- `GET /api/describe/:model` - Get model metadata
- `POST /api/describe/:model` - Create 1 model + N fields (atomic)

**Gap**: No endpoint to create N models atomically.

**Proposed addition**:
```yaml
# POST /api/describe (no :model param)
models:
  - model_name: grids
    status: system
    fields:
      - field_name: name
        type: text
        required: true
  - model_name: grid_cells
    status: system
    fields:
      - field_name: grid_id
        type: uuid
        required: true
```

**When to use**: Runtime schema changes, model creation.

---

### Extracts (`/api/extracts`)

**Purpose**: Partial or full data export from a tenant.

- Configurable scope: select specific models or all models
- Configurable content: schema only, data only, or both
- Output format: ZIP containing `describe.yaml` + `{model}.jsonl` files
- Human-readable, diffable, portable

**Configuration options**:
```json
{
  "name": "Account Export",
  "include": ["describe", "data"],
  "models": ["accounts", "contacts"],
  "format": "jsonl"
}
```

**When to use**:
- Dev workflow (export before breaking changes)
- Sharing models/data between tenants
- Creating portable backups
- Package distribution

---

### Restores (`/api/restores`)

**Purpose**: Partial or full data import into a tenant.

- **Additive by default** - does not replace entire tenant
- Configurable scope: select specific models or all models
- Configurable content: schema only, data only, or both
- Multiple conflict resolution strategies

**Conflict strategies**:

| Strategy | Behavior | Use Case |
|----------|----------|----------|
| `replace` | Delete all existing data, import fresh | Dev restore (fresh DB) |
| `upsert` | Update existing records, insert new | Dev restore (existing DB) |
| `merge` | Create new models, import only for new models | Package install |
| `sync` | Create new models, import only new record IDs | Sandbox → Parent |
| `skip` | Skip existing records silently | Best-effort import |
| `error` | Fail on any conflict | Strict validation |

**Configuration options**:
```json
{
  "name": "Install Slack Package",
  "conflict_strategy": "merge",
  "include": ["describe", "data"],
  "models": ["channels", "messages"],
  "create_models": true
}
```

**When to use**:
- Dev workflow (restore after autoinstall)
- Package installation
- Partial migrations
- Sandbox → parent merge

---

### Snapshots (`/api/snapshots`)

**Purpose**: Full tenant point-in-time backup (internal "save game").

- Always captures **entire tenant** (all models, all data)
- Stored as SQLite file (internal format)
- **Replacement semantics** - restore overwrites entire tenant state
- Used for rollback and sandbox creation

**Flow**:
```
Tenant ──► POST /api/snapshots ──► Snapshot (SQLite file)
                                        │
                    ┌───────────────────┼───────────────────┐
                    │                   │                   │
                    ▼                   ▼                   ▼
            GET /download      POST /restore      POST /sandbox
            (export file)      (rollback)         (create sandbox)
```

**When to use**:
- Before risky operations ("save game")
- Creating sandboxes for experimentation
- Full tenant rollback

**Difference from Extracts**:
- Snapshots are full/replacement, extracts are partial/additive
- Snapshots are internal (SQLite), extracts are portable (ZIP)
- Snapshots are for rollback, extracts are for sharing

---

### Sandboxes (`/api/sandboxes`)

**Purpose**: Temporary isolated tenant for experimentation.

- Created from a snapshot
- Runs as SQLite tenant (lightweight)
- Can be discarded or "graduated" to real tenant
- Isolated from source tenant

**Flow**:
```
Tenant ──► Snapshot ──► Sandbox (SQLite tenant)
                              │
                    ┌─────────┴─────────┐
                    │                   │
                    ▼                   ▼
            DELETE /sandbox     POST /graduate
            (discard)           (promote to tenant)
```

**When to use**:
- Testing schema changes safely
- "What-if" experimentation
- Preview migrations before applying

---

### Fixtures (`fixtures/`)

**Purpose**: Tenant provisioning templates.

- Define models, fields, and seed data for new tenants
- **Additive** - can stack multiple fixtures (system + audit + exports)
- Source format: YAML files
- Deployed via Describe API + Data API internally

**Structure**:
```
fixtures/{name}/
├── template.json           # Metadata, dependencies
├── describe/*.yaml         # Model + field definitions
└── data/*.yaml             # Seed data
```

**Registration flow**:
```
POST /auth/register { template: "system,audit,exports" }
    │
    ▼
1. Create empty namespace (PG schema or SQLite file)
2. Bootstrap (raw SQL): create models/fields/users tables
3. Apply fixtures via API:
   - POST /api/describe for each model
   - POST /api/data/:model for seed data
4. Create user, register tenant
```

**Bootstrap exception**: The system fixture (models, fields, users tables) requires raw SQL due to chicken-and-egg problem. All other fixtures use API-based deployment.

**When to use**: New tenant registration with pre-defined templates.

---

## Architectural Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        CORE ENGINES                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐          │
│  │   Query     │    │   Mutate    │    │   Schema    │          │
│  │   Engine    │    │   Engine    │    │   Engine    │          │
│  └─────────────┘    └─────────────┘    └─────────────┘          │
│         ▲                  ▲                  ▲                   │
│         └──────────────────┼──────────────────┘                   │
│                            │                                      │
│                    ┌───────┴───────┐                             │
│                    │   Observer    │                             │
│                    │   Pipeline    │                             │
│                    └───────────────┘                             │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
                              ▲
                              │
┌──────────────────────────────────────────────────────────────────┐
│                       API SURFACES                                │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  /api/data/:model      → Mutate Engine (single model)            │
│  /api/find/:model      → Query Engine                            │
│  /api/describe/:model  → Schema Engine                           │
│  /api/bulk             → Mutate Engine (multi-model, atomic)     │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
                              ▲
                              │
┌──────────────────────────────────────────────────────────────────┐
│                    HIGHER-LEVEL TOOLS                             │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  PORTABLE / ADDITIVE:                                             │
│  ├─ Extracts   = Query all models → ZIP (YAML + JSONL)           │
│  ├─ Restores   = ZIP → Schema Engine + Mutate Engine             │
│  └─ Fixtures   = YAML → Schema Engine + Mutate Engine            │
│                                                                   │
│  INTERNAL / REPLACEMENT:                                          │
│  ├─ Snapshots  = Full tenant → SQLite file                       │
│  └─ Sandboxes  = Snapshot → SQLite tenant                        │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## Format Summary

| Tool | Format | Rationale |
|------|--------|-----------|
| **Extracts/Restores** | ZIP (YAML + JSONL) | Portable, partial, diffable, human-readable |
| **Snapshots/Sandboxes** | SQLite | Full tenant, binary OK, widely supported |
| **Fixtures** | YAML source | Human-editable, stackable, deployed via API |

---

## Decision Log

### Bulk API: Data Only

**Decision**: Bulk API handles data operations only, not schema operations.

**Rationale**: Clear separation of concerns. Schema changes have different semantics (DDL generation, observer triggers) than data changes.

**Gap to fill**: Add `POST /api/describe` (no `:model` param) for atomic multi-model schema creation.

### Extracts/Restores: Additive

**Decision**: Restores are additive by default (upsert strategy), not replacement.

**Rationale**:
- Supports partial imports (specific models only)
- Enables package installation workflow
- Configurable via conflict_strategy for different use cases

### Snapshots: SQLite Format

**Decision**: Snapshots stored as SQLite files.

**Rationale**:
- Full tenant state in single file
- Widely supported (Excel, Python, browsers, mobile)
- Queryable without full import
- Lightweight for sandboxes

### Fixtures: API-Based Deployment

**Decision**: Feature fixtures deploy via Describe API + Data API, not raw SQL.

**Rationale**:
- Observer pipeline handles DDL generation per adapter
- Single source of truth (YAML)
- No dialect-specific SQL maintenance

**Exception**: System fixture (bootstrap) requires raw SQL for chicken-and-egg problem.

---

## Open Items

1. **POST /api/describe**: Implement multi-model atomic creation endpoint

2. **Fixtures format migration**: Convert existing SQL fixtures to YAML format

3. **Snapshot implementation**: Build SQLite-based snapshot system

4. **Sandbox lifecycle**: Define auto-expiration, graduation flow

5. **Extract format option**: Consider SQLite as alternative export format for full-tenant exports

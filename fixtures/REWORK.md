# Fixtures System Rework Plan

## Overview

This document outlines the comprehensive rework of the Monk API fixtures system to support:
- Separate entity types (templates, tenants, sandboxes, snapshots)
- API-based fixture building (no direct PostgreSQL access required)
- YAML-based fixture definitions for developer maintainability
- Pure API workflows for remote/production environments

## Current State (Before Rework)

### Database Schema
- Single `tenants` table with `tenant_type` discriminator
- Values: `'template'`, `'normal'`
- Mixed concerns in one table

### Fixture Build Process
- `scripts/fixtures-build.sh` - Bash script with PostgreSQL dependency
- Direct SQL execution via `psql` command
- Schema loading: `fixtures/*/describe/*.sql` files
- Data loading: `fixtures/*/data/*.sql` files
- Template creation: Direct database rename via SQL

### Pain Points
1. **Infrastructure coupling**: Requires PostgreSQL client (`psql`)
2. **No validation**: SQL INSERT bypasses observer pipeline
3. **Local-only**: Can't run remotely, only on DB machine
4. **Single table**: Mixed entity types in `tenants` table
5. **SQL format**: Fixtures defined in SQL (harder to maintain)

## Target State (After Rework)

### Database Schema

#### 1. Templates Table (Immutable Prototypes)
```sql
CREATE TABLE templates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(255) UNIQUE NOT NULL,
    database varchar(255) UNIQUE NOT NULL,
    description text,
    parent_template varchar(255),
    is_system boolean DEFAULT false,
    schema_count int DEFAULT 0,
    record_count int DEFAULT 0,
    size_bytes bigint,
    created_by uuid,
    created_at timestamp NOT NULL DEFAULT now(),
    access_read uuid[] DEFAULT '{}',
    access_edit uuid[] DEFAULT '{}',
    access_full uuid[] DEFAULT '{}',
    CONSTRAINT templates_database_prefix CHECK (database LIKE 'monk_template_%')
);

CREATE INDEX idx_templates_parent ON templates(parent_template);
CREATE INDEX idx_templates_system ON templates(is_system);
```

#### 2. Tenants Table (Production)
```sql
CREATE TABLE tenants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(255) UNIQUE NOT NULL,
    database varchar(255) UNIQUE NOT NULL,
    description text,
    source_template varchar(255),
    naming_mode varchar(20) DEFAULT 'enterprise' CHECK (
        naming_mode IN ('enterprise', 'personal')
    ),
    owner_id uuid NOT NULL,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now(),
    is_active boolean DEFAULT true,
    trashed_at timestamp,
    deleted_at timestamp,
    access_read uuid[] DEFAULT '{}',
    access_edit uuid[] DEFAULT '{}',
    access_full uuid[] DEFAULT '{}',
    access_deny uuid[] DEFAULT '{}',
    CONSTRAINT tenants_database_prefix CHECK (database LIKE 'tenant_%')
);

CREATE INDEX idx_tenants_owner ON tenants(owner_id);
CREATE INDEX idx_tenants_active ON tenants(is_active);
CREATE INDEX idx_tenants_source_template ON tenants(source_template);
```

#### 3. Sandboxes Table (Temporary/Experimental)
```sql
CREATE TABLE sandboxes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(255) UNIQUE NOT NULL,
    database varchar(255) UNIQUE NOT NULL,
    description text,
    purpose text,
    parent_tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
    parent_template varchar(255),
    created_by uuid NOT NULL,
    created_at timestamp NOT NULL DEFAULT now(),
    expires_at timestamp,
    last_accessed_at timestamp,
    is_active boolean DEFAULT true,
    CONSTRAINT sandboxes_database_prefix CHECK (database LIKE 'sandbox_%'),
    CONSTRAINT sandboxes_one_parent CHECK (
        (parent_tenant_id IS NOT NULL AND parent_template IS NULL) OR
        (parent_tenant_id IS NULL AND parent_template IS NOT NULL)
    )
);

CREATE INDEX idx_sandboxes_parent_tenant ON sandboxes(parent_tenant_id);
CREATE INDEX idx_sandboxes_parent_template ON sandboxes(parent_template);
CREATE INDEX idx_sandboxes_created_by ON sandboxes(created_by);
CREATE INDEX idx_sandboxes_expires ON sandboxes(expires_at) WHERE expires_at IS NOT NULL;
```

#### 4. Snapshots Table (Point-in-Time Backups - IN TENANT DATABASES)
**Location:** Each tenant database has its own `snapshots` table

```sql
CREATE TABLE snapshots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(255) UNIQUE NOT NULL,
    database varchar(255) UNIQUE NOT NULL,
    description text,
    status varchar(20) DEFAULT 'pending' CHECK (
        status IN ('pending', 'processing', 'active', 'failed')
    ),
    snapshot_type varchar(20) DEFAULT 'manual' CHECK (
        snapshot_type IN ('manual', 'auto', 'pre_migration', 'scheduled')
    ),
    size_bytes bigint,
    record_count int,
    error_message text,  -- For failed snapshots
    created_by uuid NOT NULL,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now(),
    expires_at timestamp,
    trashed_at timestamp,
    deleted_at timestamp,
    access_read uuid[] DEFAULT '{}',
    access_edit uuid[] DEFAULT '{}',
    access_full uuid[] DEFAULT '{}',
    access_deny uuid[] DEFAULT '{}',
    CONSTRAINT snapshots_database_prefix CHECK (database LIKE 'snapshot_%')
);

CREATE INDEX idx_snapshots_status ON snapshots(status);
CREATE INDEX idx_snapshots_created_by ON snapshots(created_by);
CREATE INDEX idx_snapshots_created_at ON snapshots(created_at);
```

**Key Differences from Original Plan:**
- ❌ No `source_tenant_id` or `source_tenant_name` (snapshot record IS in the tenant)
- ✅ Added `status` field for async processing tracking
- ✅ Added `error_message` for failed snapshot diagnostics
- ✅ Added standard ACL fields (tenant-scoped permissions)
- ✅ Added soft delete fields (trashed_at, deleted_at)

### API Endpoints

All infrastructure operations under `/api/sudo/*`:

#### Templates
```
GET    /api/sudo/templates                    # List all templates
GET    /api/sudo/templates/{name}             # Get template details
POST   /api/sudo/templates/promote            # Promote sandbox → template
DELETE /api/sudo/templates/{name}             # Delete template (TODO: constraints)
```

#### Tenants
```
GET    /api/sudo/tenants                      # List all tenants
GET    /api/sudo/tenants/{name}               # Get tenant details
POST   /api/sudo/tenants                      # Create tenant (admin)
PUT    /api/sudo/tenants/{name}               # Update tenant metadata
DELETE /api/sudo/tenants/{name}               # Delete tenant
POST   /api/sudo/tenants/{name}/sandbox       # Create sandbox from tenant
```

#### Sandboxes
```
GET    /api/sudo/sandboxes                    # List all sandboxes
GET    /api/sudo/sandboxes/{name}             # Get sandbox details
POST   /api/sudo/sandboxes                    # Create sandbox from template
DELETE /api/sudo/sandboxes/{name}             # Delete sandbox
POST   /api/sudo/sandboxes/{name}/extend      # Extend expiration
```

#### Snapshots
```
GET    /api/sudo/snapshots                    # List tenant's snapshots
GET    /api/sudo/snapshots/{name}             # Get snapshot details (poll for status)
POST   /api/sudo/snapshots                    # Create snapshot (async via observer)
DELETE /api/sudo/snapshots/{name}             # Delete snapshot + database
```

**Snapshot Workflow:**
1. POST creates record with `status='pending'` (returns immediately)
2. AsyncObserver (Ring 8) detects pending → updates to 'processing'
3. Observer runs pg_dump/restore in background
4. Observer updates both source tenant DB and snapshot DB to 'active'
5. Observer locks snapshot database as read-only
6. User polls GET to check status

**Important Notes:**
- Snapshots are **tenant-scoped** (each tenant only sees their own)
- Snapshots are **stored in tenant databases** (not central `monk` database)
- Snapshot databases contain **their own metadata** (consistent with source)
- Snapshot databases are **immutable** (read-only after creation)
- Snapshots **cannot be created from sandboxes** (tenant databases only)
- Restoration feature: **Future work** (requires design decisions)

### Fixture Format: YAML

**Why YAML over JSON:**
1. ✅ Better readability for complex schemas
2. ✅ Inline documentation with comments
3. ✅ Easier to maintain and modify
4. ✅ Cleaner git diffs
5. ✅ API already supports it natively (bidirectional)
6. ✅ Standard for configuration files (Docker, K8s, CI/CD)

**Structure:**
```
fixtures/
├── default/                    # Base template (was "empty")
│   ├── describe/
│   │   ├── schemas.yaml       # System schemas
│   │   ├── columns.yaml
│   │   └── users.yaml
│   ├── data/
│   │   └── users.yaml         # Default root user
│   └── template.yaml          # Metadata
│
├── testing/
│   ├── describe/
│   │   ├── account.yaml       # Schema definitions
│   │   └── contact.yaml
│   ├── data/
│   │   ├── account.yaml       # Test data
│   │   └── contact.yaml
│   └── template.yaml
│
└── demo/
    ├── describe/
    │   └── *.yaml
    ├── data/
    │   └── *.yaml
    └── template.yaml
```

### Fixture Build Workflow (Pure API)

**Recommended Path: Tenant → Sandbox → Template**

```bash
# 1. Register sandbox from default template
POST /auth/register
{
  "tenant": "fixture-build-testing",
  "username": "root@fixture.test",
  "template": "default",
  "create_as": "sandbox"
}

# 2. Login (root user has sudo by default)
POST /auth/login
{
  "tenant": "fixture-build-testing",
  "username": "root@fixture.test"
}
# → JWT with is_sudo: true

# 3. Load schemas via Describe API
POST /api/describe/account
Content-Type: application/yaml
<YAML schema definition>

# 4. Load data via Data API (VALIDATED!)
POST /api/data/account
Content-Type: application/yaml
<YAML data array>

# 5. Validate data loaded correctly
GET /api/data/account

# 6. Promote sandbox → template
POST /api/sudo/templates/promote
{
  "sandbox_name": "fixture-build-testing",
  "template_name": "testing",
  "description": "Test fixture with accounts",
  "parent_template": "default"
}
# → Renames sandbox_abc123 → monk_template_testing
# → Moves from sandboxes table to templates table
# → Sandbox consumed (no longer exists)
```

### Updated Build Script

`scripts/fixtures-build.sh` becomes pure API client:

```bash
#!/usr/bin/env bash
# Pure API-based fixture building (no psql required)

API_BASE="${API_BASE:-http://localhost:9001}"
FIXTURE_NAME="$1"
FIXTURES_DIR="fixtures/$FIXTURE_NAME"

# 1. Register sandbox from default template
# 2. Login and get JWT token
# 3. Load schemas from YAML files via POST /api/describe
# 4. Load data from YAML files via POST /api/data
# 5. Validate loaded data
# 6. Promote sandbox to template via POST /api/sudo/templates/promote
```

**Key Changes:**
- No `psql` commands
- No direct SQL execution
- Pure HTTP/curl operations
- Works remotely (no DB machine access needed)
- All data validated through observers

## Implementation Phases

### Phase 1: Database Schema Migration ✅ COMPLETE
1. ✅ Created new tables: `templates`, `sandboxes`, `snapshots`
2. ✅ Migrated data from `tenants` table via migration script
3. ✅ Renamed `monk_template_empty` → `monk_template_default`
4. ✅ Updated `tenants` table structure (removed `tenant_type`, added `owner_id`, `source_template`)
5. ✅ Moved snapshots from `monk` database to tenant databases
6. ✅ Removed `sandboxes_one_parent` constraint (allow tracking both tenant and template)

**Key Changes:**
- `sql/init-monk.sql` - Separate tables for templates, tenants, sandboxes
- `sql/init-template-default.sql` - Snapshots table in each tenant database
- Database naming: `monk_template_default` for CHECK constraint compliance
- Default template renamed from "empty" to "default"

### Phase 2: API Endpoints ✅ COMPLETE
1. ✅ Implemented `/api/sudo/templates/*` routes (GET list, GET detail)
2. ✅ Implemented `/api/sudo/sandboxes/*` routes (GET list, POST create, GET detail, DELETE, POST extend)
3. ✅ Implemented `/api/sudo/snapshots/*` routes (GET list, POST create, GET detail, DELETE)
4. ⚠️  Tenant management routes (POST, PUT, DELETE) - Use direct PostgreSQL access
5. ⚠️  Template promotion - Future work

**Architectural Decisions:**
- **Templates**: Read-only via API (create via init scripts)
- **Sandboxes**: Tenant-scoped (team collaboration model)
  - Belongs to `parent_tenant_id` for team access
  - `created_by` for audit trail only
  - Can track both source tenant and template
- **Snapshots**: Tenant-scoped with async observer pipeline
  - Stored in tenant databases (not `monk` database)
  - Created with `status='pending'`
  - AsyncObserver (Ring 8) processes via pg_dump
  - Updates both source and snapshot DBs to `status='active'`
  - Locked as read-only (`default_transaction_read_only = on`)
  - **Restriction**: Only from tenant databases (not sandboxes)
- **Tenants**: No DELETE/UPDATE via API (direct DB access required)

**Services & Infrastructure:**
- `src/lib/services/infrastructure-service.ts` - Utility methods for DB operations
- `src/lib/database-template.ts` - Updated to query `templates` table
- `src/observers/snapshots/8/50-snapshot-processor.ts` - Async snapshot processing
- `src/lib/database-connection.ts` - Added `getConnectionParams()` for pg_dump credentials

### Phase 3: Convert Fixtures to YAML ✓ TODO
1. Convert `fixtures/empty/` → `fixtures/default/`
2. Convert SQL schemas to YAML format
3. Convert SQL data to YAML format
4. Create YAML validator/schema

### Phase 4: Update Build Script ✓ TODO
1. Rewrite `fixtures-build.sh` as pure API client
2. Remove PostgreSQL dependencies
3. Add YAML file support
4. Add validation and error handling

### Phase 5: Documentation ✓ TODO
1. Update fixture documentation
2. Document new API endpoints
3. Create migration guide
4. Update developer guides

### Phase 6: Testing ✓ TODO
1. Test fixture build with YAML
2. Test template promotion workflow
3. Test sandbox creation from templates and tenants
4. Integration tests for new endpoints

## Workflows

### Workflow 1: Build Fixture (Developer)
```
Developer workflow:
1. Register sandbox from 'default' template
2. Login as root (auto-sudo)
3. POST schemas to /api/describe (from YAML)
4. POST data to /api/data (from YAML, validated!)
5. GET data to verify correctness
6. POST /api/sudo/templates/promote
   → Sandbox becomes template
```

### Workflow 2: Production Tenant Testing
```
Production workflow:
1. User has prod tenant 'acme-corp'
2. POST /api/sudo/tenants/acme-corp/sandbox
   → Creates 'acme-corp-sandbox-abc'
3. Test changes in sandbox
4. If good → Manually apply to production
   OR promote to template for reuse
5. DELETE sandbox when done
```

### Workflow 3: Pre-Migration Snapshot
```
Backup workflow:
1. Login to tenant 'acme-corp'
2. POST /api/sudo/snapshots
   {name: 'pre-v3-migration', description: 'Before v3 schema changes'}
   → Returns: {status: 'pending', database: 'snapshot_abc123', ...}
3. Poll GET /api/sudo/snapshots/pre-v3-migration
   → Check status: pending → processing → active
4. Run migration on tenant
5. If failed → Restore from snapshot (TODO: design restoration)
6. If success → Keep snapshot per retention policy

Note: Snapshot creation is non-blocking. The API returns immediately
with status='pending', and an async observer processes pg_dump in the
background. Poll the GET endpoint to check when status='active'.
```

## Design Decisions

### 1. Separate Tables vs Single Table
**Decision:** Separate tables for templates/tenants/sandboxes/snapshots

**Rationale:**
- Clear separation of concerns
- Type-specific constraints and validation
- Simpler queries (no type filtering needed)
- Better documentation via schema structure

### 2. Sandbox Naming
**Decision:** 
- From template: `sandbox_{random}`
- From tenant: `sandbox_{tenant_name}_{random}`

**Rationale:**
- Isolation: Tenant-based sandboxes grouped by parent name
- Clarity: Easy to identify sandbox source

### 3. Sandbox Lifecycle
**Decision:** Manual cleanup only (for now)

**Rationale:**
- Simpler implementation initially
- Auto-expiration can be added later
- Explicit deletion prevents accidental data loss

**TODO:** Implement auto-expiration background job

### 4. Template Deletion
**Decision:** Future work

**TODO:** Decide on constraints:
- Prevent deleting if tenants reference it?
- Cascade delete references?
- Soft delete only?

### 5. Snapshot Restoration
**Decision:** Future work

**TODO:** Implement restoration logic:
- Create new tenant from snapshot?
- Overwrite existing tenant?
- Both options?

### 6. Template Access Control
**Decision:** Open for now (anyone can clone)

**TODO:** Implement ACL-based access:
- Public templates (system)
- Private templates (user-owned)
- Shared templates (ACL-based)

### 7. Fixture Format
**Decision:** YAML for core fixtures, JSON supported for users

**Rationale:**
- YAML more readable for developers
- Comments for documentation
- Cleaner git diffs
- API supports both natively
- Users can choose their preference

### 8. Base Template Name
**Decision:** Rename "empty" → "default"

**Rationale:**
- More intuitive name
- Matches common conventions
- Database: `monk_default` (clearer than `monk_empty`)

## Benefits

### Developer Experience
- ✅ No PostgreSQL client required
- ✅ Works from any machine with API access
- ✅ YAML fixtures easier to read/maintain
- ✅ Inline documentation via comments
- ✅ All data validated (no invalid fixtures)

### Production Readiness
- ✅ Remote fixture building
- ✅ Sandbox testing before template promotion
- ✅ Snapshot/restore capability (TODO)
- ✅ Proper entity separation
- ✅ ACL support for templates (TODO)

### Architecture
- ✅ Clean entity separation
- ✅ Type-specific constraints
- ✅ Clear lineage tracking
- ✅ Consistent API patterns
- ✅ Infrastructure under `/api/sudo`

## Migration Notes

### Breaking Changes
1. Template names: `empty` → `default`
2. Database structure: Single `tenants` table → Multiple tables
3. Fixture format: SQL files → YAML files
4. Build script: PostgreSQL-based → API-based

### Backward Compatibility
- Existing templates continue to work during migration
- SQL-based fixtures supported until YAML conversion complete
- API changes are additive (new endpoints, not breaking existing)

### Migration Steps for Users
1. Update template references: `empty` → `default`
2. Update any scripts using `tenants` table directly
3. Use new `/api/sudo/*` endpoints for infrastructure operations
4. Convert custom fixtures from SQL to YAML (optional, both supported)

## Timeline Estimate

- Phase 1 (Schema): 2-3 days
- Phase 2 (API): 3-4 days
- Phase 3 (YAML conversion): 1-2 days
- Phase 4 (Build script): 1-2 days
- Phase 5 (Documentation): 1 day
- Phase 6 (Testing): 2-3 days

**Total: ~10-15 days**

## Success Criteria

- ✅ Fixture build works without PostgreSQL client
- ✅ Fixtures load via API with full validation
- ✅ Separate tables for templates/tenants/sandboxes/snapshots
- ✅ All endpoints under `/api/sudo/*`
- ✅ YAML fixture format adopted
- ✅ Template promotion workflow functional
- ✅ Base template renamed to "default"
- ✅ Full test coverage for new endpoints
- ✅ Documentation updated

## References

- Architecture discussion: This conversation
- Formatters: `src/lib/formatters/README.md`
- Current fixtures: `fixtures/*/`
- Build script: `scripts/fixtures-build.sh`
- Test fixtures: `fixtures/import_test/`

---

## Current Status

**Overall Progress:** Phase 2 Complete ✅

### Completed (Phases 1-2)
- ✅ **Database schema migration** - Separate tables for templates, tenants, sandboxes, snapshots
- ✅ **Infrastructure service** - Utility methods for DB cloning, pg_dump, locking
- ✅ **Sudo API routes** - Templates (read), Sandboxes (CRUD), Snapshots (CRUD)
- ✅ **Async observer pipeline** - Background snapshot processing with dual metadata updates
- ✅ **Database locking** - Snapshots are immutable (read-only)
- ✅ **Connection extraction** - DatabaseConnection.getConnectionParams() for pg_dump
- ✅ **Sudo access control** - isSudo() helper, root users get automatic sudo
- ✅ **Sandbox ownership model** - Team collaboration (tenant-scoped, not user-scoped)

### Key Architectural Decisions Made
1. **Snapshots in tenant DBs** - Not in central `monk` database (enables observer pipeline)
2. **Tenant-scoped sandboxes** - Multiple admins can manage team's sandboxes
3. **Async snapshot processing** - Non-blocking API, background pg_dump via observer
4. **Dual metadata updates** - Both source and snapshot DBs show status='active'
5. **Read-only snapshots** - Immutable via `default_transaction_read_only = on`
6. **No snapshot from sandboxes** - Sandboxes are temporary, snapshots are for tenants only

### Remaining Work (Phases 3-4)
- ⚠️  **Phase 3:** Convert fixtures to YAML format
- ⚠️  **Phase 4:** Rewrite `fixtures-build.sh` as pure API client (no psql dependency)
- ⚠️  **Phase 5:** Documentation updates
- ⚠️  **Phase 6:** Integration testing

### Future Enhancements (Not Blocking)
- Template promotion (sandbox → template)
- Tenant CRUD via API (currently requires direct DB access)
- Snapshot restoration (create tenant from snapshot)
- Auto-expiration for sandboxes
- ACL-based template access control

**Next Step:** Begin Phase 3 (Convert fixtures to YAML format)

**Git Branch:** `3.1` (10 commits ahead of origin)

**Last Updated:** 2025-11-18

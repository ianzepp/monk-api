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

#### 4. Snapshots Table (Point-in-Time Backups)
```sql
CREATE TABLE snapshots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(255) UNIQUE NOT NULL,
    database varchar(255) UNIQUE NOT NULL,
    description text,
    snapshot_type varchar(20) DEFAULT 'manual' CHECK (
        snapshot_type IN ('manual', 'auto', 'pre_migration', 'scheduled')
    ),
    source_tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
    source_tenant_name varchar(255) NOT NULL,
    size_bytes bigint,
    record_count int,
    created_by uuid NOT NULL,
    created_at timestamp NOT NULL DEFAULT now(),
    expires_at timestamp,
    CONSTRAINT snapshots_database_prefix CHECK (database LIKE 'snapshot_%')
);

CREATE INDEX idx_snapshots_source_tenant ON snapshots(source_tenant_id);
CREATE INDEX idx_snapshots_created_by ON snapshots(created_by);
CREATE INDEX idx_snapshots_created_at ON snapshots(created_at);
```

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
GET    /api/sudo/snapshots                    # List all snapshots
GET    /api/sudo/snapshots/{name}             # Get snapshot details
POST   /api/sudo/snapshots                    # Create snapshot from tenant
POST   /api/sudo/snapshots/{name}/restore     # Restore → new tenant (TODO)
DELETE /api/sudo/snapshots/{name}             # Delete snapshot
```

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

### Phase 1: Database Schema Migration ✓ TODO
1. Create new tables: `templates`, `sandboxes`, `snapshots`
2. Migrate data from `tenants` table:
   - `tenant_type='template'` → `templates` table
   - `tenant_type='normal'` → keep in `tenants`, add `owner_id`
3. Rename `monk_template_empty` → `monk_default`
4. Update `tenants` table structure (remove `tenant_type`, add constraints)

### Phase 2: API Endpoints ✓ TODO
1. Implement `/api/sudo/templates/*` routes
2. Implement `/api/sudo/sandboxes/*` routes  
3. Implement `/api/sudo/tenants/*` routes (management)
4. Implement `/api/sudo/snapshots/*` routes
5. Update `/auth/register` to support `create_as` parameter

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
1. POST /api/sudo/snapshots
   {tenant: 'acme-corp', snapshot_name: 'pre-v3-migration'}
2. Run migration on tenant
3. If failed → TODO: Restore from snapshot
4. If success → Keep snapshot per retention policy
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

**Status:** Planning complete, ready for implementation
**Next Step:** Begin Phase 1 (Database Schema Migration)

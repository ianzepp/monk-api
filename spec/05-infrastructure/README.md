# 05-infrastructure: Infrastructure Management Tests

Infrastructure tests covering database entity management, connectivity, and server configuration.

**Scope:**
- Infrastructure entity management (templates, tenants, sandboxes, snapshots)
- Core system connectivity
- Server configuration validation
- Database provisioning and cloning
- Async snapshot processing

**Test Focus:**
- Template management and listing
- Sandbox creation, extension, and deletion
- Snapshot async workflow (pending → processing → active)
- Database connectivity testing
- Database naming and validation
- Infrastructure API endpoints (`/api/sudo/*`)
- Server configuration validation
- Environment variable validation

## Infrastructure Concepts

### Templates (Immutable Prototypes)
- **Purpose**: Pre-configured databases for fast tenant/sandbox provisioning
- **Database**: `monk_template_*` (e.g., `monk_template_system`)
- **Registry**: `templates` table in central `monk` database
- **Performance**: Instant cloning via `CREATE DATABASE WITH TEMPLATE` (30x faster)
- **API**: `/api/sudo/templates/*` (read-only)

### Tenants (Production Databases)
- **Purpose**: Production customer databases
- **Database**: `tenant_*` (e.g., `tenant_acme_abc123`)
- **Registry**: `tenants` table in central `monk` database
- **Lifecycle**: Long-lived, created from templates
- **Isolation**: Separate database per tenant with JWT routing

### Sandboxes (Temporary Testing)
- **Purpose**: Safe experimental environments for testing changes
- **Database**: `sandbox_*` (e.g., `sandbox_acme_xyz789`)
- **Registry**: `sandboxes` table in central `monk` database
- **Lifecycle**: Short-lived with expiration (7-14 days typical)
- **Source**: Cloned from templates or tenants
- **Ownership**: Team-scoped (belongs to parent tenant)
- **API**: `/api/sudo/sandboxes/*` (CRUD operations)

### Snapshots (Point-in-Time Backups)
- **Purpose**: Disaster recovery, pre-migration backups
- **Database**: `snapshot_*` (e.g., `snapshot_acme_backup123`)
- **Registry**: `snapshots` table in **tenant databases** (not central `monk`)
- **Processing**: Async via observer pipeline using `pg_dump`/`pg_restore`
- **Status Flow**: `pending` → `processing` → `active` or `failed`
- **Immutability**: Read-only after creation
- **Restriction**: Only from tenant databases (not sandboxes)
- **API**: `/api/sudo/snapshots/*` (CRUD operations with async creation)

## Tests

### database-naming.test.ts (Unit Test)

Tests the DatabaseNaming service which handles database name generation for all entity types.

**Test Coverage:**
- Hash consistency and format validation (tenant_ prefix, 16-char hex)
- Unicode character handling and normalization
- Whitespace trimming
- Database name validation (alphanumeric + underscore only)
- PostgreSQL identifier limits (63 chars max)
- SQL injection prevention
- Security validation for reserved names
- Template, sandbox, and snapshot naming conventions

**Running:**
```bash
npm run test:ts 05
```

**37 test cases** covering enterprise mode hashing, validation, and integration tests.

---

### Future Tests (Planned)

**Template API Tests** (`templates-api.test.sh`)
- List all templates (`GET /api/sudo/templates`)
- Get template details (`GET /api/sudo/templates/:name`)
- Verify template metadata (schema count, size, parent)

**Sandbox API Tests** (`sandboxes-api.test.sh`)
- Create sandbox from template (`POST /api/sudo/sandboxes`)
- List tenant's sandboxes (`GET /api/sudo/sandboxes`)
- Extend sandbox expiration (`POST /api/sudo/sandboxes/:name/extend`)
- Delete sandbox (`DELETE /api/sudo/sandboxes/:name`)
- Verify team-scoped access

**Snapshot API Tests** (`snapshots-api.test.sh`)
- Create snapshot with async processing (`POST /api/sudo/snapshots`)
- Poll snapshot status (`GET /api/sudo/snapshots/:name`)
- Verify status transitions (pending → processing → active)
- List tenant's snapshots (`GET /api/sudo/snapshots`)
- Delete snapshot (`DELETE /api/sudo/snapshots/:name`)
- Test immutability (read-only enforcement)
- Verify restriction (no snapshots from sandboxes)

---

## API Reference

Complete infrastructure API documentation: [/api/sudo/PUBLIC.md](../../src/routes/api/sudo/PUBLIC.md)

## Related Documentation

- **Fixtures System**: [fixtures/README.md](../../fixtures/README.md) - Template creation and management
- **Developer Guide**: [DEVELOPER.md](../../DEVELOPER.md) - Infrastructure architecture overview
- **Rework Plan**: [fixtures/REWORK.md](../../fixtures/REWORK.md) - Infrastructure redesign details

# Monk API Fixtures System

> **Template-based database cloning for ultra-fast tenant provisioning**

The fixtures system uses PostgreSQL's `CREATE DATABASE WITH TEMPLATE` to clone pre-built databases instantly, achieving **sub-second** setup for tests, demos, and tenant provisioning.

## Quick Start

```bash
# Build system template (required, one-time setup)
npm run fixtures:build system

# Build testing template (extends system)
npm run fixtures:build testing

# Build demo template (extends system)
npm run fixtures:build demo

# Rebuild with force flag
npm run fixtures:build -- --force system
```

## Template Architecture

### Template Hierarchy

Templates use inheritance via the `parent` property in `template.json`:

```
system (no parent)
  ├── testing (extends system)
  └── demo (extends system)
```

When building a template:
- If `parent: null` → Builds from scratch
- If `parent: "system"` → Clones from `monk_template_system` then adds schemas/data

### Available Templates

| Template | Parent | Schemas | Purpose | Build Time |
|----------|--------|---------|---------|------------|
| `system` | none | 4 core | Base infrastructure (schemas, columns, users, history) | ~0.3s |
| `testing` | `system` | +2 | Test suite with account/contact schemas | ~0.1s |
| `demo` | `system` | +12 | Demo environment with workspaces, teams, repos, etc. | ~0.2s |

## Fixture Directory Structure

Each fixture directory must contain:

```
fixtures/TEMPLATE_NAME/
├── template.json          # Required - Template metadata
├── load.sql              # Required - Load script
├── describe/             # Schema definitions (SQL)
│   ├── schema1.sql
│   └── schema2.sql
└── data/                 # Sample data (SQL)
    ├── data1.sql
    └── data2.sql
```

### template.json Format

```json
{
  "name": "testing",
  "description": "Testing template with sample schemas",
  "parent": "system",
  "version": "1.0.0",
  "schemas": 2,
  "sample_data": true,
  "features": ["account-management", "contact-management"]
}
```

**Required Fields:**
- `name` - Template name (must match directory name)
- `description` - Human-readable description
- `parent` - Parent template name or `null`

**Optional Fields:**
- `version` - Template version
- `schemas` - Number of additional schemas (not counting system)
- `sample_data` - Whether template includes data
- `features` - Array of feature tags
- `is_system` - Mark as system template (true for system fixture only)

### load.sql Format

The `load.sql` file orchestrates loading in correct dependency order:

```sql
-- Phase 1: User initialization (if needed)
\ir init.sql

-- Phase 2: Schema definitions
\ir describe/workspaces.sql
\ir describe/teams.sql
\ir describe/members.sql

-- Phase 3: Sample data
\ir data/01-workspaces-teams.sql
\ir data/02-members.sql
```

**Best Practices:**
- Use `\echo` statements to show progress
- Load schemas in dependency order (foreign keys)
- Number data files for clarity (01-, 02-, etc.)
- Comment phases for maintainability

## How Fixtures Build Works

### Build Process

1. **Read template.json** - Parse metadata and validate
2. **Check parent** - If `parent` specified, verify parent template exists
3. **Create database**:
   - If `parent: null` → `createdb monk_template_NAME`
   - If `parent: "system"` → `createdb monk_template_NAME -T monk_template_system`
4. **Load fixture** - Execute `load.sql` against new database
5. **Register template** - Insert into `templates` table in `monk` database

### Template Registry

Templates are registered in the `monk.templates` table:

```sql
-- fixtures/init-monk.sql defines the templates table
CREATE TABLE templates (
    name VARCHAR(255) PRIMARY KEY,
    database VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    is_system BOOLEAN DEFAULT false,
    schema_count INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);
```

**Note:** Templates are registered in the `templates` table, NOT the `tenants` table.

## Template Inheritance

### System Template (Base)

The `system` template is the foundation:
- **Parent:** `null` (builds from scratch)
- **Contains:** 4 core schemas (schemas, columns, users, history)
- **File:** `fixtures/system/load.sql`
- **Status:** All 4 schemas have `status='system'` for protection

### Extending Templates

Child templates clone from parent then add features:

```bash
# Build system first
npm run fixtures:build system

# Build testing (clones system, adds account/contact schemas)
npm run fixtures:build testing
```

This approach:
- ✅ Faster builds (clone vs create from scratch)
- ✅ Consistent base schemas across all templates
- ✅ Modular feature additions
- ✅ Easy to maintain

## Migration from Old System

### What Changed

**Before:**
- `sql/init-tenant.sql` created base schemas
- `fixtures-build.sh` ran init-tenant.sql then loaded fixtures
- Templates marked as `tenant_type='template'` in `tenants` table

**After:**
- `fixtures/init-monk.sql` creates main database structure
- `fixtures/system/load.sql` creates base schemas
- Templates use `parent` property for inheritance
- Templates registered in separate `templates` table

### Breaking Changes

1. **No more sql/ directory** - Moved to `fixtures/init-monk.sql`
2. **No more init-tenant.sql** - Replaced by `fixtures/system/load.sql`
3. **load.sql required** - All fixtures must have `load.sql`
4. **template.json required** - All fixtures must have `template.json`
5. **Templates table** - Uses `templates` table, not `tenants` with `tenant_type`

## Creating New Templates

### Step 1: Create Directory Structure

```bash
mkdir -p fixtures/my_template/{describe,data}
```

### Step 2: Create template.json

```json
{
  "name": "my_template",
  "description": "My custom template",
  "parent": "system",
  "version": "1.0.0",
  "schemas": 3,
  "sample_data": true
}
```

### Step 3: Create Schema Definitions

```sql
-- fixtures/my_template/describe/products.sql
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO schemas (schema_name, status)
VALUES ('products', 'active');
```

### Step 4: Create load.sql

```sql
\echo 'Loading my_template fixture'
\ir describe/products.sql
\ir describe/categories.sql
\ir data/products.sql
\echo 'my_template loaded successfully'
```

### Step 5: Build Template

```bash
npm run fixtures:build my_template
```

## Troubleshooting

### Template Not Found

```bash
# Error: Parent template database not found: monk_template_system
# Solution: Build parent first
npm run fixtures:build system
```

### load.sql Not Found

```bash
# Error: load.sql not found in fixtures/my_template (required for all fixtures)
# Solution: Create load.sql
```

### Verify Template

```bash
# Check template databases exist
psql -l | grep monk_template

# Verify template registry
psql -d monk -c "SELECT name, database, description FROM templates"

# Check template content
psql -d monk_template_testing -c "\dt"
```

## Test Integration

### Using Templates in Tests

```typescript
// spec/test-helpers.ts
const tenant = await TestHelpers.createTestTenant('my-test', 'testing');
// → Clones from monk_template_testing (~0.1s)
```

### Performance Benefits

| Operation | Time | Notes |
|-----------|------|-------|
| Clone system template | ~0.05s | Copy-on-write |
| Clone testing template | ~0.1s | Includes data |
| Clone demo template | ~0.2s | Large dataset |

## Command Reference

```bash
# Build templates
npm run fixtures:build system
npm run fixtures:build testing
npm run fixtures:build demo

# Rebuild with force
npm run fixtures:build -- --force system

# Verify templates
psql -d monk -c "SELECT * FROM templates"

# List template databases
psql -l | grep monk_template
```

## Next Steps

1. Build system template: `npm run fixtures:build system`
2. Build testing template: `npm run fixtures:build testing`
3. Run tests: `npm run test:ts`
4. Create custom templates for your use cases

---

**💡 Pro Tip:** Always build `system` template first. All other templates extend from it.

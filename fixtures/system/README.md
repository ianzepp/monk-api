# System Fixture

The **system** fixture provides the core system schemas required for the Monk API to function. This is the foundation that all tenant databases are built upon.

## Structure

```
fixtures/system/
├── load.sql                 # Master loader script (includes initialization)
├── README.md               # This file
│
├── describe/               # Table definitions (DDL)
│   ├── schemas.sql        # schemas table
│   ├── columns.sql        # columns table
│   ├── users.sql          # users table
│   ├── snapshots.sql      # snapshots table
│   ├── definitions.sql    # definitions table
│   ├── extracts.sql       # extracts table
│   ├── extract_runs.sql   # extract_runs table
│   ├── extract_artifacts.sql # extract_artifacts table
│   └── history.sql        # history table (via function) + indexes
│
├── functions/             # PostgreSQL functions
│   ├── create-table-from-schema.sql      # Dynamically create tables
│   └── regenerate-schema-definition.sql  # Generate JSON Schema
│
└── data/                  # Data inserts (DML)
    ├── schemas.sql        # Register system schemas
    ├── columns.sql        # Define columns for system schemas
    ├── users.sql          # Insert root user
    ├── history.sql        # Create history table (via function)
    └── definitions.sql    # Generate JSON Schema definitions
```

## Load Order

The fixture must be loaded in this specific order:

1. **Initialization** (embedded in `load.sql`)
   - Extensions (pgcrypto)
   - Custom types (column_type enum)

2. **Table Definitions** (`describe/*.sql`)
   - Core tables: schemas, columns, users, snapshots, definitions, history
   - Extract system: extracts, extract_runs, extract_artifacts

3. **Functions** (`functions/*.sql`)
   - `create_table_from_schema()` - Dynamically creates tables
   - `regenerate_schema_definition()` - Generates JSON Schema

4. **Data** (`data/*.sql`)
   - Schema registrations (self-references)
   - Column definitions for all system schemas
   - Default root user
   - History table creation (via function)
   - JSON Schema generation

5. **Indexes** (`describe/history.sql`)
   - Additional indexes after data load

## System Schemas

The system fixture creates these system schemas:

| Schema | Purpose | Tables |
|--------|---------|--------|
| **schemas** | Schema registry | `schemas` |
| **columns** | Column metadata | `columns` |
| **users** | User management | `users` |
| **history** | Change tracking | `history` |
| **snapshots** | DB backups | `snapshots` |
| **definitions** | JSON Schema cache | `definitions` |

## Usage

### Via psql

```bash
createdb monk_template_system
psql -d monk_template_system -f fixtures/system/load.sql
```

### Via Node.js

```typescript
import { readFile } from 'fs/promises';
import { join } from 'path';

async function loadDefaultFixture(client) {
    const fixtureDir = join(process.cwd(), 'fixtures', 'system');

    // Initialize (extensions & types)
    await client.query(`
        CREATE EXTENSION IF NOT EXISTS pgcrypto;
        CREATE TYPE column_type AS ENUM (
            'text', 'integer', 'bigserial', 'numeric', 'boolean',
            'jsonb', 'uuid', 'timestamp', 'date',
            'text[]', 'integer[]', 'numeric[]', 'uuid[]'
        );
    `);

    // Load in order
    const files = [
        'describe/schemas.sql',
        'describe/columns.sql',
        'describe/users.sql',
        'describe/snapshots.sql',
        'describe/definitions.sql',
        'functions/create-table-from-schema.sql',
        'functions/regenerate-schema-definition.sql',
        'data/schemas.sql',
        'data/columns.sql',
        'data/users.sql',
        'data/history.sql',
        'data/definitions.sql',
        'describe/history.sql'
    ];

    for (const file of files) {
        const sql = await readFile(join(fixtureDir, file), 'utf-8');
        await client.query(sql);
    }
}
```

## Adding New System Schemas

To add new system schemas (like `extracts`, `restores`):

1. **Create table definition**: `describe/new_schema.sql`
   ```sql
   CREATE TABLE "new_schema" (
       -- System fields (auto-added)
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       -- ... other system fields ...

       -- Custom columns
       "name" text NOT NULL,
       "status" text DEFAULT 'pending'
   );
   ```

2. **Register schema**: Add to `data/schemas.sql`
   ```sql
   INSERT INTO "schemas" (schema_name, status, sudo)
   VALUES ('new_schema', 'system', true);
   ```

3. **Define columns**: Add to `data/columns.sql`
   ```sql
   INSERT INTO "columns" (schema_name, column_name, type, required, description) VALUES
       ('new_schema', 'name', 'text', true, 'Schema name'),
       ('new_schema', 'status', 'text', false, 'Processing status');
   ```

4. **Generate definition**: Add to `data/definitions.sql`
   ```sql
   SELECT regenerate_schema_definition('new_schema');
   ```

5. **Update load order**: Add to `load.sql` in appropriate phases

## Design Principles

1. **Separation of Concerns**
   - `describe/` = structure (DDL)
   - `data/` = content (DML)
   - `functions/` = logic (PL/pgSQL)

2. **Idempotency**
   - Use `CREATE TABLE IF NOT EXISTS`
   - Use `ON CONFLICT DO NOTHING` for inserts
   - Safe to re-run

3. **Self-Documenting**
   - Comments explain purpose
   - File names indicate content
   - Load order is explicit

4. **Extensibility**
   - Easy to add new schemas
   - Functions enable dynamic table creation
   - Metadata-driven design

## Relationship to init-template-default.sql

This fixture structure **replaces** the monolithic `sql/init-template-default.sql`. The old file combined everything into one script. This new structure:

- ✅ Separates concerns (DDL vs DML vs functions)
- ✅ Makes it easy to add new schemas
- ✅ Follows fixture conventions
- ✅ Supports both SQL and programmatic loading
- ✅ Is self-documenting

The `sql/init-template-default.sql` file can eventually be replaced with a simple loader that sources these files.

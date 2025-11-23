# System Fixture

The **system** fixture provides the core system models required for the Monk API to function. This is the foundation that all tenant databases are built upon.

## Structure

```
fixtures/system/
├── load.sql                 # Master loader script (includes initialization)
├── README.md               # This file
│
├── describe/               # Table definitions (DDL)
│   ├── models.sql        # models table
│   ├── fields.sql        # fields table
│   ├── users.sql          # users table
│   ├── snapshots.sql      # snapshots table
│   ├── extracts.sql       # extracts table
│   ├── extract_runs.sql   # extract_runs table
│   ├── extract_artifacts.sql # extract_artifacts table
│   └── history.sql        # history table (via function) + indexes
│
├── functions/             # PostgreSQL functions
│   ├── create-table-from-model.sql      # Dynamically create tables
└── data/                  # Data inserts (DML)
    ├── models.sql        # Register system models
    ├── fields.sql        # Define fields for system models
    ├── users.sql          # Insert root user
    ├── history.sql        # Create history table (via function)
```
## Load Order

The fixture must be loaded in this specific order:

1. **Initialization** (embedded in `load.sql`)
   - Extensions (pgcrypto)
   - Custom types (field_type enum)

2. **Table Definitions** (`describe/*.sql`)
   - Core tables: models, fields, users, snapshots, history
   - Extract system: extracts, extract_runs, extract_artifacts

3. **Functions** (`functions/*.sql`)
   - `create_table_from_model()` - Dynamically creates tables
   - `create_table_from_model()` - Dynamically creates data tables

4. **Data** (`data/*.sql`)
   - Model registrations (self-references)
   - Field definitions for all system models
   - Default root user
   - History table creation (via function)

5. **Indexes** (`describe/history.sql`)
   - Additional indexes after data load

## System Models

The system fixture creates these system models:

| Model | Purpose | Tables |
|--------|---------|--------|
| **models** | Model registry | `models` |
| **fields** | Field metadata | `fields` |
| **users** | User management | `users` |
| **history** | Change tracking | `history` |
| **snapshots** | DB backups | `snapshots` |

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
        CREATE TYPE field_type AS ENUM (
            'text', 'integer', 'bigserial', 'numeric', 'boolean',
            'jsonb', 'uuid', 'timestamp', 'date',
            'text[]', 'integer[]', 'numeric[]', 'uuid[]'
        );
    `);

    // Load in order
    const files = [
        'describe/models.sql',
        'describe/fields.sql',
        'describe/users.sql',
        'describe/snapshots.sql',
        'functions/create-table-from-model.sql',
        'data/models.sql',
        'data/fields.sql',
        'data/users.sql',
        'data/history.sql',
        'describe/history.sql'
    ];

    for (const file of files) {
        const sql = await readFile(join(fixtureDir, file), 'utf-8');
        await client.query(sql);
    }
}
```

## Adding New System Models

To add new system models (like `extracts`, `restores`):

1. **Create table definition**: `describe/new_model.sql`
   ```sql
   CREATE TABLE "new_model" (
       -- System fields (auto-added)
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       -- ... other system fields ...

       -- Custom fields
       "name" text NOT NULL,
       "status" text DEFAULT 'pending'
   );
   ```

2. **Register model**: Add to `data/models.sql`
   ```sql
   INSERT INTO "models" (model_name, status, sudo)
   VALUES ('new_model', 'system', true);
   ```

3. **Define fields**: Add to `data/fields.sql`
   ```sql
   INSERT INTO "fields" (model_name, field_name, type, required, description) VALUES
       ('new_model', 'name', 'text', true, 'Model name'),
       ('new_model', 'status', 'text', false, 'Processing status');
   ```

   ```sql
: Add to `load.sql` in appropriate phases

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
   - Easy to add new models
   - Functions enable dynamic table creation
   - Metadata-driven design

## Relationship to init-template-default.sql

This fixture structure **replaces** the monolithic `sql/init-template-default.sql`. The old file combined everything into one script. This new structure:

- ✅ Separates concerns (DDL vs DML vs functions)
- ✅ Makes it easy to add new models
- ✅ Follows fixture conventions
- ✅ Supports both SQL and programmatic loading
- ✅ Is self-documenting

The `sql/init-template-default.sql` file can eventually be replaced with a simple loader that sources these files.

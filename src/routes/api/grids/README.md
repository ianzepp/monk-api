# Grid API - Design Plan

**Category:** 45-grid-api
**Status:** Phase 0, 1 & 2 Complete - Ready for Testing
**Created:** 2025-11-20
**Phase 0 Complete:** 2025-11-20
**Phase 1 Complete:** 2025-11-20
**Phase 2 Complete:** 2025-11-20

## TODO: Migrate to App Endpoint

**Future Migration:** This API should be moved from `/api/grids/*` to `/api/grids/*` as part of a broader initiative to separate specialized application endpoints from standard REST API endpoints. The `/app` path will host application-specific functionality (grids, extracts, restores) while `/api` remains focused on core data/schema operations.

**Target Path:** `/api/grids/:id/:range`
**Rationale:** Grid API is an application-level feature (spreadsheet functionality) rather than a direct data model operation, making it a better fit for the `/app` namespace.

## Overview

Grid API provides Excel-like spreadsheet functionality within Monk API. It fills the gap between unstructured data (JSONB) and formal schemas - offering structured tabular data with calculation capabilities without requiring upfront schema design.

## Use Case

**The Problem:**
Personal project exploration follows this pattern:
1. "Interesting idea" → Just thoughts
2. "Need to track things" → README with bullet points
3. "Need structure" → Markdown table
4. "Need calculations" → **STUCK** (markdown can't do formulas)
5. "Need scale" → Forced into formal schema (but problem not well understood yet)

**The Gap:**
Between markdown tables and formal schemas, there's a missing tool for "I need to do calculations and handle more data, but I'm still figuring out what this even is."

Normally this would be Excel, but we want to keep data in Monk API for:
- Centralization (everything in one place)
- API access (programmatic queries)
- History/audit (built-in tracking)
- ACLs (security model)
- Multi-tenant isolation
- Integration with existing Monk data
- Discoverability (`/api/data/grids` shows all exploration projects)

## Implementation Status

### ✅ Phase 0: External Schema Foundation (Complete)

**What Was Built:**
- External schema pattern infrastructure
- Schema class extended with `external` property
- All DDL observers (7 files) updated to skip external schemas
- Ring 0 security guard observer (protects all code paths)
- Performance optimization (SchemaCache usage in observers)

**Key Files:**
- `/src/lib/schema.ts` - Added external property
- `/src/lib/database-types.ts` - Added external to SchemaRecord
- `/src/observers/all/0/05-external-schema-guard.ts` - Ring 0 guard
- `/src/observers/schemas/6/*.ts` - Schema DDL guards (3 files)
- `/src/observers/columns/6/*.ts` - Column DDL guards (4 files)
- `/fixtures/system/describe/schemas.sql` - Added external column to DDL

**Testing:**
- ✅ TypeScript compilation successful
- ✅ Build verification passed
- ✅ External schemas protected from Data API operations
- ✅ Performance validated (SchemaCache integration)

### ✅ Phase 1: Grid Infrastructure (Complete)

**What Was Built:**
- Grid metadata table (`grids`) - regular schema for Data API management
- Grid cells table (`grid_cells`) - external schema for Grid API only
- System fixtures for both schemas (DDL + schema registration)
- Foreign key constraint (grid_cells → grids with CASCADE delete)

**Key Files:**
- `/fixtures/system/describe/grids.sql` - CREATE TABLE grids
- `/fixtures/system/describe/grid_cells.sql` - CREATE TABLE grid_cells
- `/fixtures/system/data/grids.sql` - Schema/column registration
- `/fixtures/system/data/grid_cells.sql` - Schema/column registration (external=true)
- `/fixtures/system/load.sql` - Added both fixtures to load order

**Database Schema:**
```sql
-- Grids table (regular schema)
grids: id, name, description, row_count, row_max, col_max + system fields

-- Grid cells table (external schema)
grid_cells: grid_id (UUID FK), row (INT), col (CHAR), value (TEXT)
PRIMARY KEY: (grid_id, row, col)
```

**Testing:**
- ✅ Both tables created in system template
- ✅ Schema records exist (grids: external=false, grid_cells: external=true)
- ✅ Column definitions registered
- ✅ Foreign key constraint validated
- ✅ Fixture loading successful

**Known Issues Resolved:**
- Fixed fixture structure to follow extracts pattern (DDL in describe/, DML in data/)
- Fixed grid_id type mismatch (VARCHAR → UUID) for foreign key
- Fixed fixture load order (Phase 2 DDL, Phase 4 DML)

### ✅ Phase 2: Grid API - Basic Operations (Complete)

**What Was Built:**
- Range parser utility (Excel-style notation: A1, A1:Z100, A:A, 5:5)
- Four route handlers (GET/PUT/DELETE/POST)
- Barrel export pattern (follows data/describe route structure)
- Transaction-aware operations (withTransactionParams)
- Comprehensive validation (bounds, format, request body)
- GRID_* prefixed error codes (consistent error handling)

**Key Files:**
- `/src/routes/api/grids/range-parser.ts` - Range parsing and validation
- `/src/routes/api/grids/:id/:range/GET.ts` - Read cells handler
- `/src/routes/api/grids/:id/:range/PUT.ts` - Update cells handler (UPSERT)
- `/src/routes/api/grids/:id/:range/DELETE.ts` - Delete cells handler
- `/src/routes/api/grids/:id/cells/POST.ts` - Bulk upsert handler
- `/src/routes/api/grids/routes.ts` - Barrel exports
- `/src/index.ts` - Route registration (45-grid-api section)
- `/spec/45-grid-api/README.md` - Comprehensive test specification

**Features Implemented:**
- Single cell operations (A1)
- Range operations (A1:Z100)
- Row operations (5:5)
- Column operations (A:A)
- Bulk operations (up to 1000 cells)
- Sparse storage (null values delete cells)
- Bounds validation (row_max, col_max per grid)
- Transaction support (atomic commits/rollbacks)
- Raw SQL operations (bypasses observer pipeline)

**Testing:**
- Comprehensive test specification created (spec/45-grid-api/README.md)
- 16 test categories defined
- 200+ test cases outlined
- Test utilities and fixtures documented
- Target: 95%+ code coverage

**Known Issues:**
- None - all builds passing

### 🚧 Phase 3: Grid API - Advanced Features (Next)

Ready to implement formulas, Monk references, and schema export when needed.

## API Design

### URL Structure

**Validated:** Hono correctly handles colons in path parameters (tested successfully).

**Grid API Endpoints:**
```
GET    /api/grids/:id/:range          # Read cells (A1, A1:Z100, A:A, 5:5)
PUT    /api/grids/:id/:range          # Update cells/range
DELETE /api/grids/:id/:range          # Clear cells/range
POST   /api/grids/:id/cells           # Bulk upsert (body contains cells)
```

**Range Notation (Excel-style):**
- Single cell: `/api/grids/abc123/A1`
- Range: `/api/grids/abc123/A1:Z100`
- Entire column: `/api/grids/abc123/A:A`
- Entire row: `/api/grids/abc123/5:5`

**Grid Management:**
- Grids managed via existing Data API: `/api/data/grids`
- Inherits: CRUD, ACLs, history, observers, multi-tenant isolation

## Storage Architecture

### Two-Table Approach

**1. Grid Metadata (Monk schema)**
```json
{
  "name": "grids",
  "columns": [
    {"name": "name", "type": "string", "required": true},
    {"name": "description", "type": "string"},
    {"name": "row_count", "type": "integer", "default": 1000}
  ]
}
```

**2. Grid Cells**

Phase 1 simplified schema (row/col/value only):

```sql
CREATE TABLE grid_cells (
  grid_id VARCHAR NOT NULL,
  row INTEGER NOT NULL CHECK (row > 0 AND row <= 1000),
  col CHAR(1) NOT NULL CHECK (col ~ '^[A-Z]$'),
  value TEXT,

  PRIMARY KEY (grid_id, row, col),
  FOREIGN KEY (grid_id) REFERENCES grids(id) ON DELETE CASCADE
);

CREATE INDEX idx_grid_range ON grid_cells(grid_id, row, col);
```

### Storage Options Considered

**Option 1: Sparse Cell Table** ✅ RECOMMENDED
- One record per cell
- Only stores non-empty cells
- Fast range queries with indexes
- Simple model

**Option 2: Row-Based Storage** ❌
- One record per row, cells in JSONB
- Good for row operations, bad for columns
- JSONB queries slower than indexed columns

**Option 3: Column-Based Storage** ❌
- One record per column, cells in JSONB
- Good for column operations, bad for viewport scrolling
- Not ideal for UI use case

### Integration Architecture: External Schemas

**Chosen Approach:** External Schema Pattern ✅

Grid API uses the **external schema pattern** - schema definition lives in the system, but data is managed by specialized API using raw SQL.

**Principle:** "External schemas can be understood but not interacted with as native tables"

**How it works:**
1. **Schema definition** in `schemas`/`columns` tables (for documentation/discovery)
2. **Marked `external: true`** - Data API refuses to interact with it
3. **Table created manually** in tenant initialization SQL
4. **Grid API uses raw SQL** via `system.db`/`system.tx` (no observer pipeline)
5. **DDL observer skips** external schemas (no auto-generation)

**Benefits:**
- ✅ Schema definition in canonical location (discoverable via `/api/describe`)
- ✅ Data API protected (can't accidentally CRUD external schemas)
- ✅ Grid API has full control (raw SQL, custom logic, no system fields)
- ✅ No auto-generated system fields (`id`, `created_at`, ACLs, etc.)
- ✅ Reusable pattern for future use cases

**Long-term use cases for external schemas:**
- 3rd-party databases (external PostgreSQL, MySQL, Salesforce API)
- Legacy systems (pre-existing tables you don't control)
- Read-only data sources
- Specialized tables (like grid_cells)

## Phase 1 Design Decisions

### Constraints
1. **Columns:** A-Z (26 columns max)
2. **Rows:** Fixed count (stored in grid metadata)
3. **Schema:** Just `row`, `col`, `value` - no formulas, no types, no timestamps
4. **Null handling:**
   - Database: `NULL`
   - JSON API: `null`
   - UI rendering: blank string (client-side)
5. **Observers:** Bypass observer pipeline - use raw SQL for grid_cells operations

### Rationale
- Start minimal, add features progressively
- Validate core concept (grid storage/retrieval) before tackling formula complexity
- Raw SQL for grid_cells (no observer overhead, full control)

## External Schema Implementation

### 1. Add `external` Column to Schemas

**Migration:**
```sql
ALTER TABLE schemas ADD COLUMN external BOOLEAN DEFAULT false;
```

**Purpose:** Flag schemas as externally managed (data not accessible via Data API)

### 2. Schema Definitions

**Location:** `/fixtures/system/describe/` (system-level schemas)

**Grid metadata (regular schema):**
```sql
-- /fixtures/system/describe/grids.sql
INSERT INTO schemas (schema_name, external) VALUES ('grids', false);
INSERT INTO columns (schema_name, column_name, type, required, default_value) VALUES
  ('grids', 'name', 'string', true, NULL),
  ('grids', 'description', 'string', false, NULL),
  ('grids', 'row_count', 'integer', false, NULL),
  ('grids', 'row_max', 'integer', false, 1000),
  ('grids', 'col_max', 'string', false, 'Z');
```

**Grid cells (external schema):**
```sql
-- /fixtures/system/describe/grid_cells.sql

-- 1. Insert schema/column metadata
INSERT INTO schemas (schema_name, external) VALUES ('grid_cells', true);
INSERT INTO columns (schema_name, column_name, type, required) VALUES
  ('grid_cells', 'grid_id', 'string', true),
  ('grid_cells', 'row', 'integer', true),
  ('grid_cells', 'col', 'string', true),
  ('grid_cells', 'value', 'string', false);

-- 2. Create the actual table (DDL runs after metadata insertion)
CREATE TABLE grid_cells (
  grid_id VARCHAR NOT NULL,
  row INTEGER NOT NULL,
  col CHAR(1) NOT NULL,
  value TEXT,

  PRIMARY KEY (grid_id, row, col),
  FOREIGN KEY (grid_id) REFERENCES grids(id) ON DELETE CASCADE
);

CREATE INDEX idx_grid_range ON grid_cells(grid_id, row, col);

COMMENT ON TABLE grid_cells IS 'Grid cell storage for Grid API (external schema - see /api/grids/*)';
```

**Note:** Schema definitions go in `/fixtures/system/describe/` which becomes the root for all fixtures/tenants/sandboxes. DDL runs after metadata insertion in the same fixture file.

**Propagation:** Every tenant database gets metadata + table automatically via fixture system

### 3. DDL Observer Updates

All schema and column DDL observers need external schema guard clauses to skip operations on external schemas.

#### Schema DDL Observers

**Files:**
- `/src/observers/schemas/6/10-ddl-create.ts`
- `/src/observers/schemas/6/10-ddl-update.ts`
- `/src/observers/schemas/6/10-ddl-delete.ts`

**Pattern:**
```typescript
async executeOne(record: SchemaRecord, context: ObserverContext): Promise<void> {
    const { system } = context;
    const { schema_name, external } = record;

    // Skip DDL operations for external schemas (managed elsewhere)
    if (external === true) {
        console.info(`Skipping DDL operation for external schema: ${schema_name}`);
        return;
    }

    // Normal DDL execution for internal schemas
    // ... rest of existing DDL logic
}
```

#### Column DDL Observers

**Files:**
- `/src/observers/columns/6/10-ddl-create.ts`
- `/src/observers/columns/6/10-ddl-update.ts`
- `/src/observers/columns/6/10-ddl-delete.ts`
- `/src/observers/columns/6/20-ddl-indexes.ts`

**Pattern:**
```typescript
async executeOne(record: SchemaRecord, context: ObserverContext): Promise<void> {
    const { system } = context;
    const { schema_name, column_name } = record;

    // Load schema to check if external
    const schema = await system.database.select404('schemas', {
        where: { schema_name }
    });

    // Skip DDL operations for external schemas (managed elsewhere)
    if (schema.external === true) {
        console.info(`Skipping DDL operation for external schema column: ${schema_name}.${columnName}`);
        return;
    }

    // Normal DDL execution for internal schemas
    // ... rest of existing DDL logic
}
```

**Note:** Column observers need to load the parent schema to check the `external` flag since column records don't carry this information.

### 4. External Schema Guard Observer

**File:** `/src/observers/all/0/05-external-schema-guard.ts`

Protects external schemas from modification via Data API and internal code. Runs in Ring 0 to catch all operations before validation.

```typescript
/**
 * External Schema Guard Observer - Ring 0 PreValidation
 *
 * Rejects any create/update/delete operations on external schemas.
 * External schemas are documented in the system but managed by specialized APIs.
 * This runs in Ring 0 to protect ALL code paths (API and internal).
 */
import { BaseObserver } from '@src/lib/observers/base-observer.js';
import type { ObserverContext } from '@src/lib/observers/interfaces.js';
import { ObserverRing } from '@src/lib/observers/types.js';
import { UserError } from '@src/lib/observers/errors.js';

export default class ExternalSchemaGuard extends BaseObserver {
    readonly ring = ObserverRing.DataPreparation; // Ring 0
    readonly operations = ['select', 'create', 'update', 'delete'] as const;
    readonly priority = 5; // Early execution, before most validation

    async execute(context: ObserverContext): Promise<void> {
        const { schema } = context;
        const schemaName = schema.schema_name;

        // Check if schema is external
        if (schema.external === true) {
            throw new UserError(
                `Schema '${schemaName}' is externally managed and cannot be modified via Data API. Use the appropriate specialized API instead.`,
                'SCHEMA_EXTERNAL'
            );
        }

        // Schema is internal, allow operation to continue
    }
}
```

**Benefits:**
- Protects ALL code paths (API routes, internal code, Bulk API)
- No middleware needed on individual routes
- Runs before any validation or database operations
- New APIs automatically protected

### 6. Grid API Implementation

**Read schema definition:**
```typescript
// Load schema for column definitions, validation
const schema = await system.database.toSchema('grid_cells');

// Verify it's external (safety check)
if (schema.external !== true) {
    throw new Error('grid_cells must be marked as external');
}
```

**Use raw SQL for operations:**
```typescript
// Get transaction-aware database context
const dbContext = system.tx || system.db;

// Direct SQL query (no observer pipeline)
const query = `
    SELECT row, col, value
    FROM grid_cells
    WHERE grid_id = $1
      AND row BETWEEN $2 AND $3
      AND col BETWEEN $4 AND $5
    ORDER BY row, col
`;

const result = await dbContext.query(query, [gridId, startRow, endRow, startCol, endCol]);
```

**Transaction support:**
- Grid API respects `system.tx` if active
- Multiple grid operations can participate in same transaction
- Rollback works correctly

### 7. Error Messages

**Data API rejection (403 Forbidden):**
```json
{
  "success": false,
  "error": "Schema 'grid_cells' is externally managed",
  "error_code": "SCHEMA_EXTERNAL",
  "message": "This schema is managed by a specialized API. Use /api/grids/* endpoints instead."
}
```

**Grid API safety check (500 Internal Error):**
```json
{
  "success": false,
  "error": "Configuration error: grid_cells schema must be marked as external",
  "error_code": "SCHEMA_CONFIGURATION_ERROR"
}
```

### 8. Describe API Behavior

**Read access (allowed):**
```bash
GET /api/describe/grid_cells
→ Returns schema definition (external: true)

GET /api/describe/grid_cells/columns/value
→ Returns column definition
```

**Write access (allowed):**
```bash
POST /api/describe/grid_cells/columns/:column
→ Can add/modify column definitions

PUT /api/describe/grid_cells
→ Can update schema metadata
```

**Rationale:** External schemas still need schema management (adding columns, updating descriptions)

## Phase 1 Implementation Guide

### Common Pattern for All Grid API Routes

```typescript
export async function GridOperation(c: Context) {
    const { system } = c.get('context');
    const gridId = c.req.param('id');
    const rangeStr = c.req.param('range');

    // 1. Load grid (validates existence + gets constraints)
    const grid = await system.database.select404('grids', {
        where: { id: gridId }
    });

    // 2. Parse range
    const range = parseRange(rangeStr);

    // 3. Validate against grid constraints
    if (range.maxRow && range.maxRow > grid.row_count) {
        throw HttpErrors.badRequest(
            `Row ${range.maxRow} exceeds grid limit ${grid.row_count}`,
            'ROW_OUT_OF_BOUNDS'
        );
    }

    // 4. Build SQL query (transaction-aware)
    const dbContext = system.tx || system.db;
    const { query, params } = buildQuery(gridId, range, ...);

    // 5. Execute query
    const result = await dbContext.query(query, params);

    // 6. Return with metadata
    return c.json({
        grid_id: gridId,
        range: rangeStr,
        cells: result.rows
    });
}
```

### Range Parser Specification

```typescript
interface ParsedRange {
    type: 'single' | 'range' | 'row' | 'col';
    row?: number;           // For single cell or row range
    col?: string;           // For single cell or col range
    startRow?: number;      // For range
    endRow?: number;        // For range
    startCol?: string;      // For range
    endCol?: string;        // For range
    maxRow?: number;        // Highest row referenced (for validation)
}

function parseRange(rangeStr: string): ParsedRange {
    // "A1" → {type: 'single', row: 1, col: 'A', maxRow: 1}
    // "A1:Z100" → {type: 'range', startRow: 1, endRow: 100, startCol: 'A', endCol: 'Z', maxRow: 100}
    // "5:5" → {type: 'row', row: 5, maxRow: 5}
    // "A:A" → {type: 'col', col: 'A'}
}
```

### SQL Query Patterns

```typescript
// Single cell: GET /api/grids/:id/A1
const query = `
    SELECT row, col, value
    FROM grid_cells
    WHERE grid_id = $1 AND row = $2 AND col = $3
`;
const params = [gridId, 1, 'A'];

// Range: GET /api/grids/:id/A1:Z100
const query = `
    SELECT row, col, value
    FROM grid_cells
    WHERE grid_id = $1
      AND row BETWEEN $2 AND $3
      AND col BETWEEN $4 AND $5
    ORDER BY row, col
`;
const params = [gridId, 1, 100, 'A', 'Z'];

// Row range: GET /api/grids/:id/5:5
const query = `
    SELECT row, col, value
    FROM grid_cells
    WHERE grid_id = $1 AND row = $2
    ORDER BY col
`;
const params = [gridId, 5];

// Column range: GET /api/grids/:id/A:A
const query = `
    SELECT row, col, value
    FROM grid_cells
    WHERE grid_id = $1 AND col = $2
    ORDER BY row
`;
const params = [gridId, 'A'];
```

### Request/Response Formats

**GET /api/grids/:id/A1 (single cell)**
```json
Response:
{
  "grid_id": "abc123",
  "range": "A1",
  "cells": [
    {"row": 1, "col": "A", "value": "Name"}
  ]
}
```

**GET /api/grids/:id/A1:B2 (range)**
```json
Response:
{
  "grid_id": "abc123",
  "range": "A1:B2",
  "cells": [
    {"row": 1, "col": "A", "value": "Name"},
    {"row": 1, "col": "B", "value": "Age"},
    {"row": 2, "col": "A", "value": "Alice"},
    {"row": 2, "col": "B", "value": "30"}
  ]
}
```

**PUT /api/grids/:id/A1 (single cell)**
```json
Request:
{"value": "Name"}

Response:
{
  "grid_id": "abc123",
  "range": "A1",
  "cells": [
    {"row": 1, "col": "A", "value": "Name"}
  ]
}
```

**PUT /api/grids/:id/A1:B2 (range)**
```json
Request:
{
  "cells": [
    {"row": 1, "col": "A", "value": "Name"},
    {"row": 1, "col": "B", "value": "Age"},
    {"row": 2, "col": "A", "value": "Alice"},
    {"row": 2, "col": "B", "value": "30"}
  ]
}

Response:
{
  "grid_id": "abc123",
  "range": "A1:B2",
  "cells": [
    {"row": 1, "col": "A", "value": "Name"},
    {"row": 1, "col": "B", "value": "Age"},
    {"row": 2, "col": "A", "value": "Alice"},
    {"row": 2, "col": "B", "value": "30"}
  ]
}
```

**POST /api/grids/:id/cells (bulk)**
```json
Request:
{
  "cells": [
    {"row": 1, "col": "A", "value": "Name"},
    {"row": 5, "col": "Z", "value": "Last"},
    // ... up to 1000 cells
  ]
}

Response:
{
  "grid_id": "abc123",
  "count": 2,
  "cells": [
    {"row": 1, "col": "A", "value": "Name"},
    {"row": 5, "col": "Z", "value": "Last"}
  ]
}
```

**DELETE /api/grids/:id/A1:B2**
```json
Response:
{
  "grid_id": "abc123",
  "range": "A1:B2",
  "deleted": 4
}
```

### Update Operations (PUT/POST)

**UPSERT pattern (INSERT ... ON CONFLICT UPDATE):**
```typescript
// Single cell
const query = `
    INSERT INTO grid_cells (grid_id, row, col, value)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (grid_id, row, col)
    DO UPDATE SET value = EXCLUDED.value
    RETURNING *
`;

// Bulk cells (transaction)
await dbContext.query('BEGIN');
for (const cell of cells) {
    await dbContext.query(query, [gridId, cell.row, cell.col, cell.value]);
}
await dbContext.query('COMMIT');
```

**Handle null values (DELETE instead):**
```typescript
if (value === null) {
    // DELETE cell instead of updating to NULL
    const query = `DELETE FROM grid_cells WHERE grid_id = $1 AND row = $2 AND col = $3`;
    await dbContext.query(query, [gridId, row, col]);
} else {
    // UPSERT
    const query = `INSERT INTO grid_cells ... ON CONFLICT ... UPDATE`;
    await dbContext.query(query, [gridId, row, col, value]);
}
```

### Delete Operations

```typescript
// DELETE /api/grids/:id/A1:B2
const query = `
    DELETE FROM grid_cells
    WHERE grid_id = $1
      AND row BETWEEN $2 AND $3
      AND col BETWEEN $4 AND $5
    RETURNING row, col
`;
const result = await dbContext.query(query, [gridId, 1, 2, 'A', 'B']);

return c.json({
    grid_id: gridId,
    range: rangeStr,
    deleted: result.rowCount
});
```

### Error Handling

```typescript
// Grid not found (handled by select404)
const grid = await system.database.select404('grids', {where: {id: gridId}});
// Throws 404 automatically if not found

// Row out of bounds
if (range.maxRow > grid.row_count) {
    throw HttpErrors.badRequest(
        `Row ${range.maxRow} exceeds grid limit ${grid.row_count}`,
        'ROW_OUT_OF_BOUNDS'
    );
}

// Column out of bounds
if (range.endCol && range.endCol > 'Z') {
    throw HttpErrors.badRequest(
        'Column must be A-Z',
        'COLUMN_OUT_OF_BOUNDS'
    );
}

// Invalid range format
if (!isValidRange(rangeStr)) {
    throw HttpErrors.badRequest(
        'Invalid range format. Expected: A1, A1:Z100, A:A, or 5:5',
        'INVALID_RANGE'
    );
}

// Backwards range
if (range.type === 'range' && range.startRow > range.endRow) {
    throw HttpErrors.badRequest(
        'Invalid range: start row after end row',
        'INVALID_RANGE'
    );
}

// Bulk operation too large
if (cells.length > 1000) {
    throw HttpErrors.badRequest(
        'Bulk operation limited to 1000 cells',
        'BULK_LIMIT_EXCEEDED'
    );
}
```

### Validation Checklist

For every Grid API operation:
1. ✅ Load grid (validates existence)
2. ✅ Parse range (validates format)
3. ✅ Validate row bounds (against grid.row_max)
4. ✅ Validate column bounds (against grid.col_max)
5. ✅ Validate range direction (start <= end)
6. ✅ Execute SQL (transaction-aware)
7. ✅ Return with metadata

## Phase 2+ Future Features

**Formulas:**
- Cell types: static value vs formula
- Basic formulas: `=SUM(A1:A10)`, `=B2*1.5`, `=AVERAGE(C:C)`
- Dependency tracking (recompute on write)
- Excel-like syntax (familiar)

**Monk Integration:**
- Monk references: `=monk://users/1234/email`
- Grids pull live data from schemas
- Dashboards/reports on structured data

**Schema Export:**
- Analyze grid columns, infer types
- Generate schema JSON
- "Promote" grid to formal schema
- Migration path from exploration → production

**Advanced Features:**
- Cell metadata (formatting, comments)
- Computed columns
- Validation rules
- Collaboration (concurrent edits)
- History tracking (per-cell changes)

## Design Decisions Made

### Architecture
1. **Row limit:** ✅ Per-grid (grid.row_max), validated in application layer
2. **Column limit:** ✅ Per-grid (grid.col_max), validated in application layer
3. **Value storage:** ✅ TEXT for everything, type coercion in application layer (Phase 1)
4. **Range query response:** ✅ Sparse array (only non-empty cells), client fills empties
5. **External schema pattern:** ✅ Schema definition in system, data via specialized API
6. **Table creation:** ✅ Manual creation in `/sql/init-tenant.sql`
7. **Schema location:** ✅ Definitions in `/fixtures/system/describe/`

### Phase 1 Implementation
8. **Range queries:** ✅ Simple WHERE clauses (`row = 5`, `col = 'A'`) - no expansion
9. **Response format:** ✅ Include metadata (grid_id, range, cells)
10. **Grid validation:** ✅ In route handlers (not middleware) - load grid for constraints
11. **Delete semantics:** ✅ Actually DELETE rows - don't keep NULL cells
12. **Null values:** ✅ PUT with `{"value": null}` = DELETE cell (consistency)
13. **Validation strategy:** ✅ Load grid → get row_max/col_max → validate + existence check
14. **Bulk operations:** ✅ Single transaction, cell limit based on grid.row_max × grid.col_max
15. **Middleware:** ✅ Same stack as Data API (JWT, system context, response pipeline)

## Key Questions Still Open

1. **Bulk operations:**
   - How to efficiently update 100+ cells at once?
   - Single transaction? Batched?
   - Response format for bulk operations?

2. **Grid size limits:**
   - Max cells per grid: Defined by grid.row_max × grid.col_max
   - Max value length?
   - Quota per tenant?

3. **Concurrency:**
   - Optimistic locking (ETags)?
   - Last-write-wins?
   - Cell-level locking?

4. **Range query optimization:**
   - Viewport caching?
   - Prefetching adjacent ranges?
   - Compression for large ranges?

## Example API Operations

**Create grid:**
```bash
POST /api/data/grids
{"name": "Q1 Revenue", "description": "Revenue tracking", "row_count": 1000}
→ {"id": "grid_abc123", ...}
```

**Set single cell:**
```bash
PUT /api/grids/grid_abc123/A1
{"value": "Name"}
```

**Set range:**
```bash
PUT /api/grids/grid_abc123/A1:B2
{
  "cells": [
    {"row": 1, "col": "A", "value": "Name"},
    {"row": 1, "col": "B", "value": "Age"},
    {"row": 2, "col": "A", "value": "Alice"},
    {"row": 2, "col": "B", "value": "30"}
  ]
}
```

**Get range:**
```bash
GET /api/grids/grid_abc123/A1:Z100
→ {
  "cells": [
    {"row": 1, "col": "A", "value": "Name"},
    {"row": 1, "col": "B", "value": "Age"},
    // Only non-empty cells
  ]
}
```

**Delete grid:**
```bash
DELETE /api/data/grids/grid_abc123
→ CASCADE deletes all grid_cells
```

## Performance Considerations

**Range Queries:**
```sql
SELECT row, col, value
FROM grid_cells
WHERE grid_id = 'abc123'
  AND row BETWEEN 1 AND 100
  AND col >= 'A' AND col <= 'Z'
ORDER BY row, col;
```

- Index on `(grid_id, row, col)` makes this fast
- Returns sparse array (only non-empty cells)
- Client reconstructs grid, filling empties with `null`

**Sparse Storage Benefits:**
- Only stores meaningful data
- Efficient for typical use (most cells empty)
- PostgreSQL handles many small records well

## Design Philosophy

**Exploration-first, not production-first:**
- This isn't competing with Google Sheets
- It's a personal data exploration tool
- Lives inside Monk's ecosystem
- Provides Excel-like power without leaving Monk

**Progressive formalization:**
- Grids are a middle step between markdown and schemas
- Start loose, formalize when patterns emerge
- Export to schema when ready for production

**Integration over features:**
- Doesn't need all Excel features
- Needs to play nice with Monk's existing data/schemas
- Leverage existing infrastructure (ACLs, history, observers)

## Implementation Checklist

### Phase 0: External Schema Foundation ✅ COMPLETE
- [x] Add `external` column to `schemas` table DDL
- [x] Add `external` property to Schema class and SchemaRecord interface
- [x] Update all schema DDL observers (create/update/delete) to skip external schemas
- [x] Update all column DDL observers (create/update/delete/indexes) to skip external schemas
- [x] Column observers use SchemaCache for performance (not database queries)
- [x] Create Ring 0 external schema guard observer (replaces middleware approach)
- [x] Guard protects ALL code paths (API + internal) automatically
- [x] Test compilation and build successful

**Implementation Changes:**
- Used Ring 0 observer instead of middleware for broader protection
- Column observers load schema from SchemaCache (performance optimization)
- Used SecurityError instead of UserError for proper error categorization

### Phase 1: Grid Infrastructure ✅ COMPLETE
- [x] Create grids table DDL in `/fixtures/system/describe/grids.sql`
- [x] Create grid_cells table DDL in `/fixtures/system/describe/grid_cells.sql`
- [x] Create grids schema/column registration in `/fixtures/system/data/grids.sql`
- [x] Create grid_cells schema/column registration in `/fixtures/system/data/grid_cells.sql`
- [x] Mark grid_cells as `external: true` in fixture
- [x] Add fixture files to system load.sql (Phase 2 and Phase 4)
- [x] Test fixture build includes both schemas
- [x] Test tenant databases have both tables
- [x] Verify foreign key constraint (grid_cells.grid_id → grids.id)

**Implementation Changes:**
- Followed extracts/restores fixture pattern (DDL in describe/, DML in data/)
- Fixed grid_id type from VARCHAR to UUID to match grids.id
- Both tables created in system template, propagate to all tenants

### Phase 2: Grid API - Basic Operations ✅ COMPLETE
- [x] Create `/src/routes/api/grids/` directory
- [x] Implement range parser (A1:Z100 → coordinates)
- [x] GET `/api/grids/:id/:range` - Read cells
- [x] PUT `/api/grids/:id/:range` - Update cells/range
- [x] POST `/api/grids/:id/cells` - Bulk upsert
- [x] DELETE `/api/grids/:id/:range` - Clear cells
- [x] Add Grid API routes to `/src/index.ts`
- [x] Create comprehensive test specification (spec/45-grid-api/README.md)

**Implementation Changes:**
- Used barrel export pattern (routes.ts) instead of Hono router
- All error codes prefixed with GRID_ for consistency
- Used withParams/withTransactionParams helpers
- Implemented sparse storage (null values delete cells)
- Added bounds validation against grid.row_max/col_max
- All operations use raw SQL (bypass observer pipeline)
- Test specification created (200+ test cases, 16 categories)

### Phase 3: Grid API - Advanced Features
- [ ] Range query optimization (BETWEEN clauses)
- [ ] Sparse array response format
- [ ] Bulk operations (multiple cells in one request)
- [ ] Error handling and validation
- [ ] Integration tests

### Phase 4: Documentation
- [ ] Update main README with Grid API section
- [ ] Create `/docs/grid.md` API documentation
- [ ] Add examples to PLAN.md
- [ ] Document external schema pattern

### Future Phases (Phase 2+)
- [ ] Formula support (Phase 2)
- [ ] Monk references (Phase 2)
- [ ] Schema export (Phase 3)
- [ ] Cell metadata/formatting (Phase 3)

## Performance Optimizations

### Grid Compact Formatter

**File:** `/src/lib/formatters/grid-compact.ts`

**Purpose:** Reduce wire transfer size for Grid API responses by converting verbose cell objects to compact arrays.

**Implementation:**
- Converts cells from `{row, col, value}` to `[row, col, value]`
- Response-only formatter (no decode support)
- Optional via `?format=grid-compact` query parameter
- JSON-compatible (no special parsing required)

**Wire Savings:**

| Grid Size | Standard Format | Compact Format | Savings |
|-----------|----------------|----------------|---------|
| 100 cells | ~6 KB | ~2.4 KB | 60% |
| 1000 cells | ~60 KB | ~24 KB | 60% |
| 10000 cells | ~600 KB | ~240 KB | 60% |

**Usage:**
```bash
# Standard response format
GET /api/grids/:id/A1:Z100
{
  "grid_id": "abc123",
  "range": "A1:Z100",
  "cells": [
    {"row": 1, "col": "A", "value": "Name"},
    {"row": 1, "col": "B", "value": "Age"}
  ]
}

# Compact response format (60% smaller)
GET /api/grids/:id/A1:Z100?format=grid-compact
{
  "grid_id": "abc123",
  "range": "A1:Z100",
  "cells": [
    [1, "A", "Name"],
    [1, "B", "Age"]
  ]
}
```

**Client Consumption:**
```javascript
// Easy array destructuring
const { cells } = await fetch('/api/grids/abc123/A1:Z100?format=grid-compact')
    .then(r => r.json());

cells.forEach(([row, col, value]) => {
    console.log(`Cell ${col}${row}: ${value}`);
});
```

**Benefits:**
- ✅ 60% reduction in payload size
- ✅ Maintains sparse cell format
- ✅ JSON-compatible (no special libraries)
- ✅ Optional (clients can still use standard format)
- ✅ Composable with existing formatters

**Use Cases:**
- Mobile clients with limited bandwidth
- Large grid exports (1000+ cells)
- High-frequency polling scenarios
- Low-bandwidth networks

## References

- Hono routing validation: Tested 2025-11-20 ✅
- External schema pattern: Designed 2025-11-20 ✅
- Excel formula syntax: For future reference
- Monk observer system: Rings 0-9 pipeline
- Monk schema system: Auto-generated columns, validation

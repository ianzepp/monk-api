# Grid Application

Excel-like spreadsheet functionality for exploratory data work. Store and manipulate tabular data with cell-based operations using familiar spreadsheet notation.

## Base Path
All Grid application routes are prefixed with `/api/grids`

Grid metadata management uses: `/api/data/grids` (Data API)

## Endpoint Summary

| Method | Path | Description |
|--------|------|-------------|
| GET | [`/api/grids/:id/:range`](#get-apigrididrange) | Read cells from a range |
| PUT | [`/api/grids/:id/:range`](#put-apigrididrange) | Update cells in a range |
| DELETE | [`/api/grids/:id/:range`](#delete-apigrididrange) | Clear cells in a range |
| POST | [`/api/grids/:id/cells`](#post-apigrididcells) | Bulk upsert cells |

**Note:** Grid configuration management (create, read, update, delete grids) is handled via the standard Data API at `/api/data/grids`.

## Content Type
- **Request**: `application/json`
- **Response**: `application/json`

## Authentication Required
All endpoints require a valid JWT bearer token. Authorization follows standard ACL rules based on the grid record.

---

## Range Notation

Grid application uses Excel-style range notation for cell operations:

### Single Cell
- `A1` - Cell at column A, row 1
- `Z100` - Cell at column Z, row 100

### Cell Range
- `A1:Z100` - Rectangle from A1 to Z100
- `B2:D10` - Smaller range from B2 to D10

### Row Range
- `5:5` - All cells in row 5
- `1:10` - All cells in rows 1 through 10

### Column Range
- `A:A` - All cells in column A
- `B:Z` - All cells in columns B through Z

### Constraints
- Rows are 1-based (1, 2, 3, ...)
- Columns are A-Z (26 columns max in Phase 1)
- Bounds checked against grid's `row_max` and `col_max` settings

---

## GET /api/grids/:id/:range

Read cells from a grid. Returns only populated cells (sparse storage).

### Path Parameters
- `id` (string, required): Grid ID (UUID)
- `range` (string, required): Range notation (e.g., `A1`, `A1:Z100`, `5:5`, `A:A`)

### Success Response (200)

**Single Cell:**
```json
{
  "grid_id": "abc123...",
  "range": "A1",
  "cells": [
    {"row": 1, "col": "A", "value": "Name"}
  ]
}
```

**Cell Range:**
```json
{
  "grid_id": "abc123...",
  "range": "A1:B2",
  "cells": [
    {"row": 1, "col": "A", "value": "Name"},
    {"row": 1, "col": "B", "value": "Age"},
    {"row": 2, "col": "A", "value": "Alice"},
    {"row": 2, "col": "B", "value": "30"}
  ]
}
```

**Empty Range:**
```json
{
  "grid_id": "abc123...",
  "range": "A1:Z100",
  "cells": []
}
```

### Notes
- Returns sparse array (only non-empty cells)
- Cells ordered by row, then column
- Empty cells not returned (sparse storage)

### Error Responses

| Status | Error Code | Description |
|--------|------------|-------------|
| 404 | `RECORD_NOT_FOUND` | Grid not found |
| 400 | `GRID_INVALID_RANGE` | Invalid range format |
| 400 | `GRID_ROW_OUT_OF_BOUNDS` | Row exceeds grid's row_max |
| 400 | `GRID_COLUMN_OUT_OF_BOUNDS` | Column exceeds grid's col_max |

### Usage Examples

```bash
# Read single cell
curl http://localhost:9001/api/grids/abc123/A1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Read range
curl http://localhost:9001/api/grids/abc123/A1:Z100 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Read entire row
curl http://localhost:9001/api/grids/abc123/5:5 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Read entire column
curl http://localhost:9001/api/grids/abc123/A:A \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## PUT /api/grids/:id/:range

Update cells in a grid. Uses UPSERT pattern (insert if new, update if exists).

### Path Parameters
- `id` (string, required): Grid ID (UUID)
- `range` (string, required): Range notation

### Request Body

**Single Cell:**
```json
{
  "value": "Hello"
}
```

**Cell Range:**
```json
{
  "cells": [
    {"row": 1, "col": "A", "value": "Name"},
    {"row": 1, "col": "B", "value": "Age"},
    {"row": 2, "col": "A", "value": "Alice"},
    {"row": 2, "col": "B", "value": "30"}
  ]
}
```

### Success Response (200)

Returns updated cells (excluding deleted cells):

```json
{
  "grid_id": "abc123...",
  "range": "A1:B2",
  "cells": [
    {"row": 1, "col": "A", "value": "Name"},
    {"row": 1, "col": "B", "value": "Age"},
    {"row": 2, "col": "A", "value": "Alice"},
    {"row": 2, "col": "B", "value": "30"}
  ]
}
```

### Notes
- **UPSERT behavior**: Creates new cells or updates existing cells
- **Null handling**: Setting `value: null` deletes the cell (sparse storage)
- **Range validation**: All cells must be within specified range
- **Transaction**: All operations atomic (commit or rollback together)

### Error Responses

| Status | Error Code | Description |
|--------|------------|-------------|
| 404 | `RECORD_NOT_FOUND` | Grid not found |
| 400 | `GRID_INVALID_RANGE` | Invalid range format |
| 400 | `GRID_INVALID_REQUEST_BODY` | Missing value or cells array |
| 400 | `GRID_INVALID_CELL_FORMAT` | Cell missing row/col properties |
| 400 | `GRID_CELL_OUT_OF_RANGE` | Cell outside specified range |
| 400 | `GRID_ROW_OUT_OF_BOUNDS` | Row exceeds grid's row_max |
| 400 | `GRID_COLUMN_OUT_OF_BOUNDS` | Column exceeds grid's col_max |

### Usage Examples

```bash
# Update single cell
curl -X PUT http://localhost:9001/api/grids/abc123/A1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"value": "Hello"}'

# Update range
curl -X PUT http://localhost:9001/api/grids/abc123/A1:B2 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "cells": [
      {"row": 1, "col": "A", "value": "Name"},
      {"row": 1, "col": "B", "value": "Age"}
    ]
  }'

# Delete cell (set to null)
curl -X PUT http://localhost:9001/api/grids/abc123/A1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"value": null}'
```

---

## DELETE /api/grids/:id/:range

Clear cells in a range. Actually removes cells from storage (sparse storage).

### Path Parameters
- `id` (string, required): Grid ID (UUID)
- `range` (string, required): Range notation

### Success Response (200)

```json
{
  "grid_id": "abc123...",
  "range": "A1:B2",
  "deleted": 4
}
```

### Notes
- **Permanent deletion**: Cells removed from database (not set to null)
- **Idempotent**: Deleting non-existent cells returns `deleted: 0`
- **Transaction**: All deletions atomic

### Error Responses

| Status | Error Code | Description |
|--------|------------|-------------|
| 404 | `RECORD_NOT_FOUND` | Grid not found |
| 400 | `GRID_INVALID_RANGE` | Invalid range format |
| 400 | `GRID_ROW_OUT_OF_BOUNDS` | Row exceeds grid's row_max |
| 400 | `GRID_COLUMN_OUT_OF_BOUNDS` | Column exceeds grid's col_max |

### Usage Examples

```bash
# Clear single cell
curl -X DELETE http://localhost:9001/api/grids/abc123/A1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Clear range
curl -X DELETE http://localhost:9001/api/grids/abc123/A1:Z100 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Clear entire row
curl -X DELETE http://localhost:9001/api/grids/abc123/5:5 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Clear entire column
curl -X DELETE http://localhost:9001/api/grids/abc123/A:A \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## POST /api/grids/:id/cells

Bulk upsert cells. Efficient for updating many cells at once.

### Path Parameters
- `id` (string, required): Grid ID (UUID)

### Request Body

```json
{
  "cells": [
    {"row": 1, "col": "A", "value": "Name"},
    {"row": 1, "col": "B", "value": "Age"},
    {"row": 2, "col": "A", "value": "Alice"},
    {"row": 2, "col": "B", "value": "30"},
    {"row": 3, "col": "A", "value": "Bob"},
    {"row": 3, "col": "B", "value": null}
  ]
}
```

### Success Response (200)

Returns created/updated cells (excluding deleted cells):

```json
{
  "grid_id": "abc123...",
  "count": 5,
  "cells": [
    {"row": 1, "col": "A", "value": "Name"},
    {"row": 1, "col": "B", "value": "Age"},
    {"row": 2, "col": "A", "value": "Alice"},
    {"row": 2, "col": "B", "value": "30"},
    {"row": 3, "col": "A", "value": "Bob"}
  ]
}
```

### Notes
- **Bulk limit**: Maximum 1000 cells per request (or grid's row_max × 26, whichever is smaller)
- **UPSERT behavior**: Creates or updates cells atomically
- **Null handling**: `value: null` deletes the cell
- **Transaction**: All operations commit or rollback together
- **Performance**: More efficient than multiple single-cell operations

### Error Responses

| Status | Error Code | Description |
|--------|------------|-------------|
| 404 | `RECORD_NOT_FOUND` | Grid not found |
| 400 | `GRID_INVALID_REQUEST_BODY` | Missing cells array |
| 400 | `GRID_INVALID_CELL_FORMAT` | Cell missing row/col properties |
| 400 | `GRID_BULK_LIMIT_EXCEEDED` | Too many cells in request |
| 400 | `GRID_ROW_OUT_OF_BOUNDS` | Row exceeds grid's row_max |
| 400 | `GRID_COLUMN_OUT_OF_BOUNDS` | Column exceeds grid's col_max |
| 400 | `GRID_INVALID_COLUMN_FORMAT` | Column not single character A-Z |

### Usage Example

```bash
curl -X POST http://localhost:9001/api/grids/abc123/cells \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "cells": [
      {"row": 1, "col": "A", "value": "Product"},
      {"row": 1, "col": "B", "value": "Price"},
      {"row": 2, "col": "A", "value": "Widget"},
      {"row": 2, "col": "B", "value": "19.99"},
      {"row": 3, "col": "A", "value": "Gadget"},
      {"row": 3, "col": "B", "value": "29.99"}
    ]
  }'
```

---

## Grid Management

Grids are managed via the standard Data API. Use `/api/data/grids` for CRUD operations.

### Create Grid

```bash
curl -X POST http://localhost:9001/api/data/grids \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '[{
    "name": "Q1 Revenue Analysis",
    "description": "Revenue tracking for Q1 2025",
    "row_max": 1000,
    "col_max": "Z"
  }]'
```

### Grid Properties
- `name` (string, required): Human-readable grid name
- `description` (string, optional): Purpose and notes
- `row_count` (integer, auto): Current number of populated rows
- `row_max` (integer, default: 1000): Maximum row number allowed
- `col_max` (string, default: 'Z'): Maximum column letter allowed

### List Grids

```bash
curl http://localhost:9001/api/data/grids \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Update Grid

```bash
curl -X PUT http://localhost:9001/api/data/grids/abc123 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Q1 Revenue - Updated",
    "row_max": 2000
  }'
```

### Delete Grid

Deletes grid and all cells (CASCADE):

```bash
curl -X DELETE http://localhost:9001/api/data/grids/abc123 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## Use Cases

### Data Exploration
Perfect for exploratory analysis when you're not ready to define a formal schema:

```bash
# Create exploration grid
POST /api/data/grids
[{"name": "Revenue Exploration", "description": "Testing different metrics"}]

# Add headers
PUT /api/grids/{id}/A1:C1
{"cells": [
  {"row": 1, "col": "A", "value": "Region"},
  {"row": 1, "col": "B", "value": "Revenue"},
  {"row": 1, "col": "C", "value": "Growth"}
]}

# Add data as you discover patterns
POST /api/grids/{id}/cells
{"cells": [
  {"row": 2, "col": "A", "value": "West"},
  {"row": 2, "col": "B", "value": "150000"},
  {"row": 3, "col": "A", "value": "East"},
  {"row": 3, "col": "B", "value": "200000"}
]}
```

### Spreadsheet Replacement
Use for simple tabular data without needing schema definitions:

```bash
# Create spreadsheet-style grid
POST /api/data/grids
[{"name": "Team Contact List", "row_max": 100}]

# Populate with bulk operation
POST /api/grids/{id}/cells
{"cells": [
  {"row": 1, "col": "A", "value": "Name"},
  {"row": 1, "col": "B", "value": "Email"},
  {"row": 1, "col": "C", "value": "Phone"},
  {"row": 2, "col": "A", "value": "Alice"},
  {"row": 2, "col": "B", "value": "alice@example.com"},
  {"row": 2, "col": "C", "value": "555-0100"}
]}
```

### Form Data Collection
Store form responses in rows:

```bash
# Each row is a form submission
POST /api/grids/{id}/cells
{"cells": [
  {"row": 1, "col": "A", "value": "Timestamp"},
  {"row": 1, "col": "B", "value": "Name"},
  {"row": 1, "col": "C", "value": "Feedback"},
  {"row": 2, "col": "A", "value": "2025-01-19T10:30:00Z"},
  {"row": 2, "col": "B", "value": "Alice"},
  {"row": 2, "col": "C", "value": "Great product!"}
]}
```

---

## Sparse Storage

Grid application uses sparse storage - only populated cells are stored in the database.

**Benefits:**
- Efficient storage (1000×26 grid with 100 cells = 100 database rows, not 26,000)
- Fast operations (only process non-empty cells)
- No NULL values stored

**Behavior:**
- GET on empty cell returns empty array
- PUT with `value: null` deletes cell
- DELETE removes cell from database

---

## Access Control

Grid operations respect ACL permissions on the grid record:

- **access_read**: Can read cells (GET operations)
- **access_edit**: Can modify cells (PUT/DELETE/POST operations)
- **access_full**: Can delete grid and all cells
- **access_deny**: Cannot access grid at all

Grid ACLs managed via `/api/acls/grids/:id`

---

## External Schema

The `grid_cells` table is marked as an **external schema** - it cannot be accessed via the Data API. All cell operations must go through the Grid application endpoints.

**Attempting to use Data API:**
```bash
GET /api/data/grid_cells
→ 403 Forbidden: Schema 'grid_cells' is externally managed
```

**Grid metadata is NOT external:**
```bash
GET /api/data/grids
→ ✅ Returns list of grids (standard Data API)
```

---

## Response Format Optimization

### Compact Format (`?format=grid-compact`)

All Grid application endpoints support an optional `grid-compact` format for reduced payload size.

**Standard Response Format:**
```json
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

**Compact Response Format:**
```json
{
  "grid_id": "abc123",
  "range": "A1:B2",
  "cells": [
    [1, "A", "Name"],
    [1, "B", "Age"],
    [2, "A", "Alice"],
    [2, "B", "30"]
  ]
}
```

**Benefits:**
- **60% smaller payload** - Critical for large grids (1000+ cells)
- **JSON-compatible** - No special parsing libraries required
- **Optional** - Use standard format or compact as needed
- **Bandwidth-efficient** - Perfect for mobile clients or low-bandwidth scenarios

**Usage:**
```bash
# Add ?format=grid-compact to any Grid application request
curl http://localhost:9001/api/grids/abc123/A1:Z100?format=grid-compact \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Client Consumption:**
```javascript
// Easy array destructuring in JavaScript
const response = await fetch('/api/grids/abc123/A1:Z100?format=grid-compact', {
    headers: { 'Authorization': 'Bearer YOUR_JWT_TOKEN' }
});

const { grid_id, range, cells } = await response.json();

// Destructure cell arrays
cells.forEach(([row, col, value]) => {
    console.log(`Cell ${col}${row}: ${value}`);
});
```

**When to Use:**
- Large grid ranges (100+ cells)
- Mobile applications with limited bandwidth
- High-frequency polling scenarios
- Performance-critical applications

**Wire Size Comparison:**

| Grid Size | Standard | Compact | Savings |
|-----------|----------|---------|---------|
| 100 cells | ~6 KB | ~2.4 KB | 60% |
| 1000 cells | ~60 KB | ~24 KB | 60% |
| 10000 cells | ~600 KB | ~240 KB | 60% |

---

## Error Codes

All Grid application errors are prefixed with `GRID_`:

| Error Code | Description |
|------------|-------------|
| `GRID_INVALID_RANGE` | Range format invalid (e.g., "1A", "AA1") |
| `GRID_ROW_OUT_OF_BOUNDS` | Row exceeds grid's row_max |
| `GRID_COLUMN_OUT_OF_BOUNDS` | Column exceeds grid's col_max |
| `GRID_INVALID_REQUEST_BODY` | Missing value or cells array |
| `GRID_INVALID_CELL_FORMAT` | Cell missing row/col properties |
| `GRID_CELL_OUT_OF_RANGE` | Cell outside specified range |
| `GRID_BULK_LIMIT_EXCEEDED` | Too many cells in bulk operation |
| `GRID_INVALID_COLUMN_FORMAT` | Column not single character A-Z |

---

## Performance Notes

- **Sparse storage**: Only populated cells consume storage
- **Bulk operations**: Use POST /api/grids/:id/cells for multiple cells
- **Range queries**: Indexed for efficient retrieval
- **Transactions**: All operations atomic (commit or rollback together)

---

## Phase 1 Limitations

Current implementation (Phase 1) has these constraints:

- **Columns**: A-Z only (26 columns max)
- **Data type**: All values stored as TEXT
- **Formulas**: Not yet implemented (Phase 3+)
- **Calculations**: Not yet implemented (Phase 3+)

Future phases will add formulas, Monk references, and schema export capabilities.

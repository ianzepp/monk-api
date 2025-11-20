# Grid API Test Specification

Test cases for the Grid API endpoints and functionality.

## Overview

Grid API provides Excel-like spreadsheet functionality within Monk API. It fills the gap between unstructured data (JSONB) and formal schemas - offering structured tabular data with calculation capabilities without requiring upfront schema design.

**Key Features:**
- Excel-style range notation (A1, A1:Z100, A:A, 5:5)
- Sparse storage (only non-empty cells stored)
- Raw SQL operations (bypasses observer pipeline)
- External schema pattern (grid_cells managed by Grid API only)
- Transaction-aware operations
- Bounds validation (per-grid row_max and col_max)

## Test Structure

Each test case should:
1. Create test grid via Data API (POST /api/data/grids)
2. Execute Grid API operation
3. Verify results (cells stored, sparse storage, bounds validation)
4. Verify transaction behavior if applicable
5. Clean up test data

## Grid Management (via Data API)

### Test: create-grid.test.sh
**POST /api/data/grids**

Test cases:
- ✅ Create grid with minimal config (name only)
- ✅ Create grid with full config (name, description, row_max, col_max)
- ✅ Verify default row_max=1000
- ✅ Verify default col_max='Z'
- ✅ Create grid with custom row_max (500)
- ✅ Create grid with custom col_max ('M')
- ✅ Verify grid inherits Data API features (ACLs, history, timestamps)
- ❌ Reject invalid row_max (negative, zero, non-integer)
- ❌ Reject invalid col_max (not A-Z, lowercase, multi-char)

### Test: update-grid.test.sh
**PUT /api/data/grids/:id**

Test cases:
- ✅ Update grid name
- ✅ Update grid description
- ✅ Update row_max (increase)
- ✅ Update col_max (increase)
- ✅ Update row_max (decrease - cells beyond limit remain)
- ✅ Update col_max (decrease - cells beyond limit remain)
- ❌ Cannot update non-existent grid
- ❌ Reject invalid row_max/col_max values

### Test: delete-grid.test.sh
**DELETE /api/data/grids/:id**

Test cases:
- ✅ Delete grid
- ✅ Verify CASCADE delete removes all grid cells (foreign key)
- ✅ Verify grid appears in history table
- ❌ Cannot delete non-existent grid

### Test: list-grids.test.sh
**GET /api/data/grids**

Test cases:
- ✅ List all grids
- ✅ Filter grids by name
- ✅ Order grids by created_at
- ✅ Verify row_count field present
- ✅ Pagination works correctly

## Range Notation Parsing

### Test: range-single-cell.test.sh
**Single Cell Notation**

Test cases:
- ✅ Parse "A1" → {type: 'single', row: 1, col: 'A'}
- ✅ Parse "Z100" → {type: 'single', row: 100, col: 'Z'}
- ✅ Parse "M50" → {type: 'single', row: 50, col: 'M'}
- ❌ Reject invalid formats: "1A", "AA1", "a1", "A0", "A-1"
- ❌ Reject empty string
- ❌ Reject null/undefined

### Test: range-cell-range.test.sh
**Cell Range Notation**

Test cases:
- ✅ Parse "A1:Z100" → {type: 'range', startRow: 1, endRow: 100, startCol: 'A', endCol: 'Z'}
- ✅ Parse "B2:D10" → {type: 'range', startRow: 2, endRow: 10, startCol: 'B', endCol: 'D'}
- ✅ Parse "A1:A10" → vertical range
- ✅ Parse "A5:Z5" → horizontal range
- ❌ Reject backwards range: "Z100:A1"
- ❌ Reject backwards rows: "A10:A1"
- ❌ Reject backwards cols: "Z1:A1"
- ❌ Reject invalid format: "A1-Z100", "A1..Z100"

### Test: range-row-range.test.sh
**Row Range Notation**

Test cases:
- ✅ Parse "5:5" → {type: 'row', row: 5, startRow: 5, endRow: 5}
- ✅ Parse "1:10" → {type: 'row', startRow: 1, endRow: 10}
- ✅ Parse "100:200" → large row range
- ❌ Reject backwards: "10:1"
- ❌ Reject zero/negative: "0:10", "-1:5", "5:-10"
- ❌ Reject invalid format: "1-10", "1..10"

### Test: range-column-range.test.sh
**Column Range Notation**

Test cases:
- ✅ Parse "A:A" → {type: 'col', col: 'A', startCol: 'A', endCol: 'A'}
- ✅ Parse "A:Z" → {type: 'col', startCol: 'A', endCol: 'Z'}
- ✅ Parse "M:P" → subset range
- ❌ Reject backwards: "Z:A"
- ❌ Reject lowercase: "a:z"
- ❌ Reject multi-char: "AA:ZZ"
- ❌ Reject invalid format: "A-Z", "A..Z"

## Cell Read Operations

### Test: read-single-cell.test.sh
**GET /app/grids/:id/:range - Single Cell**

Test cases:
- ✅ Read existing cell returns value
- ✅ Read empty cell returns empty array (sparse storage)
- ✅ Read cell A1
- ✅ Read cell Z100
- ✅ Response format: {grid_id, range, cells: [{row, col, value}]}
- ✅ Grid not found returns 404
- ❌ Range exceeds grid bounds returns GRID_ROW_OUT_OF_BOUNDS
- ❌ Range exceeds grid bounds returns GRID_COLUMN_OUT_OF_BOUNDS

### Test: read-cell-range.test.sh
**GET /app/grids/:id/:range - Cell Range**

Test cases:
- ✅ Read range A1:B2 returns only populated cells
- ✅ Read range with no cells returns empty array
- ✅ Read range with partial cells returns sparse array
- ✅ Cells returned in order (row, col)
- ✅ Response includes all cells within range
- ✅ Large range (A1:Z100) performs efficiently
- ❌ Range exceeds grid bounds returns error

### Test: read-row-range.test.sh
**GET /app/grids/:id/:range - Row Range**

Test cases:
- ✅ Read single row "5:5" returns cells in that row
- ✅ Read row range "1:10" returns cells in order
- ✅ Empty rows return empty array
- ✅ Cells ordered by col (A, B, C, ...)
- ❌ Row exceeds grid bounds returns error

### Test: read-column-range.test.sh
**GET /app/grids/:id/:range - Column Range**

Test cases:
- ✅ Read single column "A:A" returns cells in that column
- ✅ Read column range "A:Z" returns cells in order
- ✅ Empty columns return empty array
- ✅ Cells ordered by row (1, 2, 3, ...)
- ❌ Column exceeds grid bounds returns error

## Cell Write Operations

### Test: write-single-cell.test.sh
**PUT /app/grids/:id/:range - Single Cell**

Test cases:
- ✅ Write new cell creates record
- ✅ Update existing cell updates value
- ✅ Write null value deletes cell (sparse storage)
- ✅ Request format: {value: "text"}
- ✅ Response returns updated cell
- ✅ Transaction commits successfully
- ❌ Missing value field returns GRID_INVALID_REQUEST_BODY
- ❌ Range exceeds bounds returns error
- ❌ Grid not found returns 404

### Test: write-cell-range.test.sh
**PUT /app/grids/:id/:range - Cell Range**

Test cases:
- ✅ Write multiple cells in single transaction
- ✅ Request format: {cells: [{row, col, value}, ...]}
- ✅ Update multiple existing cells
- ✅ Create multiple new cells
- ✅ Mix of updates and creates
- ✅ Null values delete cells
- ✅ All cells in range validated
- ✅ Response returns all updated cells
- ❌ Missing cells array returns GRID_INVALID_REQUEST_BODY
- ❌ Cell outside specified range returns GRID_CELL_OUT_OF_RANGE
- ❌ Cell missing row/col returns GRID_INVALID_CELL_FORMAT
- ❌ Transaction rolls back on error

### Test: write-upsert-behavior.test.sh
**UPSERT Pattern**

Test cases:
- ✅ INSERT new cell (doesn't exist)
- ✅ UPDATE existing cell (same row/col)
- ✅ Verify ON CONFLICT DO UPDATE works
- ✅ Composite primary key (grid_id, row, col) enforced
- ✅ No duplicate cells created

### Test: write-null-handling.test.sh
**Null Value Handling**

Test cases:
- ✅ PUT with value=null deletes cell
- ✅ PUT with value=undefined deletes cell
- ✅ Deleted cell not returned in GET
- ✅ Cell actually removed from database (not stored as NULL)
- ✅ Sparse storage maintained

## Cell Delete Operations

### Test: delete-single-cell.test.sh
**DELETE /app/grids/:id/:range - Single Cell**

Test cases:
- ✅ Delete existing cell
- ✅ Delete non-existent cell (no error)
- ✅ Response format: {grid_id, range, deleted: count}
- ✅ Deleted count is 0 or 1
- ✅ Transaction commits successfully
- ❌ Range exceeds bounds returns error
- ❌ Grid not found returns 404

### Test: delete-cell-range.test.sh
**DELETE /app/grids/:id/:range - Cell Range**

Test cases:
- ✅ Delete all cells in range
- ✅ Delete partial range (some cells exist, some don't)
- ✅ Delete empty range (deleted: 0)
- ✅ Response includes deleted count
- ✅ Verify cells actually removed from database
- ❌ Range exceeds bounds returns error

### Test: delete-row-range.test.sh
**DELETE /app/grids/:id/:range - Row Range**

Test cases:
- ✅ Delete all cells in single row "5:5"
- ✅ Delete all cells in row range "1:10"
- ✅ Cells in other rows preserved
- ✅ Response includes deleted count

### Test: delete-column-range.test.sh
**DELETE /app/grids/:id/:range - Column Range**

Test cases:
- ✅ Delete all cells in single column "A:A"
- ✅ Delete all cells in column range "A:Z"
- ✅ Cells in other columns preserved
- ✅ Response includes deleted count

## Bulk Operations

### Test: bulk-upsert-cells.test.sh
**POST /app/grids/:id/cells**

Test cases:
- ✅ Bulk insert 100 cells
- ✅ Bulk update 100 existing cells
- ✅ Mix of inserts and updates
- ✅ Request format: {cells: [{row, col, value}, ...]}
- ✅ Response format: {grid_id, count, cells: [...]}
- ✅ All operations in single transaction
- ✅ Transaction commits or rolls back atomically
- ✅ Null values delete cells
- ❌ Exceeds bulk limit (1000 cells) returns GRID_BULK_LIMIT_EXCEEDED
- ❌ Missing cells array returns GRID_INVALID_REQUEST_BODY
- ❌ Cell missing row/col returns GRID_INVALID_CELL_FORMAT
- ❌ Cell exceeds row bounds returns GRID_ROW_OUT_OF_BOUNDS
- ❌ Cell exceeds col bounds returns GRID_COLUMN_OUT_OF_BOUNDS
- ❌ Invalid column format returns GRID_INVALID_COLUMN_FORMAT

### Test: bulk-limit-validation.test.sh
**Bulk Operation Limits**

Test cases:
- ✅ Bulk limit is min(1000, row_max * 26)
- ✅ Grid with row_max=10 has limit of 260 cells
- ✅ Grid with row_max=1000 has limit of 1000 cells (capped)
- ✅ Verify limit calculated correctly
- ❌ Exceeding limit returns detailed error with max/actual counts

## Bounds Validation

### Test: validate-row-bounds.test.sh
**Row Bounds Validation**

Test cases:
- ✅ Grid with row_max=100: row 100 is valid
- ✅ Grid with row_max=100: row 101 is invalid
- ✅ Validation applies to all operations (GET/PUT/DELETE/POST)
- ✅ Error includes actual row and grid limit
- ❌ Row 0 always invalid (1-based indexing)
- ❌ Negative rows always invalid

### Test: validate-column-bounds.test.sh
**Column Bounds Validation**

Test cases:
- ✅ Grid with col_max='M': column 'M' is valid
- ✅ Grid with col_max='M': column 'N' is invalid
- ✅ Validation applies to all operations (GET/PUT/DELETE/POST)
- ✅ Error includes actual column and grid limit
- ❌ Lowercase columns rejected
- ❌ Multi-character columns rejected (AA, AB, etc.)

### Test: validate-dynamic-bounds.test.sh
**Dynamic Bounds Changes**

Test cases:
- ✅ Create grid with row_max=100, populate cells at row 100
- ✅ Update grid row_max to 50
- ✅ Cells at row 100 still exist in database
- ✅ Cannot read/write row 100 after bound change
- ✅ Increasing bounds re-enables access to cells

## Transaction Support

### Test: transaction-commit.test.sh
**Transaction Commit Behavior**

Test cases:
- ✅ PUT operation uses withTransactionParams
- ✅ DELETE operation uses withTransactionParams
- ✅ POST operation uses withTransactionParams
- ✅ Successful operation commits transaction
- ✅ Multiple cells updated atomically
- ✅ Verify system.tx used instead of system.db

### Test: transaction-rollback.test.sh
**Transaction Rollback Behavior**

Test cases:
- ✅ Error during operation rolls back transaction
- ✅ No partial data written on error
- ✅ Database state unchanged after rollback
- ✅ Bulk operation with validation error rolls back all changes
- ✅ Verify error handling preserves transaction integrity

## External Schema Protection

### Test: external-schema-guard.test.sh
**Ring 0 External Schema Guard**

Test cases:
- ✅ Data API cannot SELECT from grid_cells
- ✅ Data API cannot INSERT into grid_cells
- ✅ Data API cannot UPDATE grid_cells
- ✅ Data API cannot DELETE from grid_cells
- ✅ Error message references specialized API
- ✅ Error code is SCHEMA_EXTERNAL
- ❌ GET /api/data/grid_cells returns 403
- ❌ POST /api/data/grid_cells returns 403

### Test: ddl-observer-skip.test.sh
**DDL Observers Skip External Schemas**

Test cases:
- ✅ Schema DDL observers skip grid_cells (create/update/delete)
- ✅ Column DDL observers skip grid_cells (create/update/delete/indexes)
- ✅ Adding column to grid_cells via Describe API doesn't alter table
- ✅ Deleting grid_cells schema doesn't drop table
- ✅ Manual DDL on grid_cells table works (outside observers)

## Sparse Storage

### Test: sparse-storage-behavior.test.sh
**Sparse Storage Pattern**

Test cases:
- ✅ Empty cells not stored in database
- ✅ GET on empty cell returns empty array
- ✅ Writing null deletes cell
- ✅ Only non-empty cells consume storage
- ✅ Grid with 1000 cells but only 10 populated: database has 10 rows
- ✅ DELETE removes row from database (not UPDATE to NULL)
- ✅ Verify sparse storage with direct database query

### Test: sparse-storage-efficiency.test.sh
**Storage Efficiency**

Test cases:
- ✅ Create grid with 26,000 possible cells (1000 rows × 26 cols)
- ✅ Populate only 100 cells
- ✅ Verify database contains exactly 100 rows in grid_cells
- ✅ DELETE all cells results in 0 rows
- ✅ Sparse storage maintains performance at scale

## Error Handling

### Test: error-grid-not-found.test.sh
**Grid Not Found Errors**

Test cases:
- ❌ GET /app/grids/invalid-id/A1 returns 404
- ❌ PUT /app/grids/invalid-id/A1 returns 404
- ❌ DELETE /app/grids/invalid-id/A1 returns 404
- ❌ POST /app/grids/invalid-id/cells returns 404
- ✅ Error uses select404 (consistent with Data API)

### Test: error-invalid-range.test.sh
**Invalid Range Errors**

Test cases:
- ❌ Invalid format returns GRID_INVALID_RANGE
- ❌ Error includes expected format in message
- ✅ All range types validated (single, range, row, col)
- ✅ Error message helpful for debugging

### Test: error-bounds-exceeded.test.sh
**Bounds Exceeded Errors**

Test cases:
- ❌ Row exceeds limit returns GRID_ROW_OUT_OF_BOUNDS
- ❌ Column exceeds limit returns GRID_COLUMN_OUT_OF_BOUNDS
- ✅ Error includes actual value and grid limit
- ✅ Error code is GRID_ prefixed

### Test: error-invalid-request.test.sh
**Invalid Request Errors**

Test cases:
- ❌ PUT single cell missing value returns GRID_INVALID_REQUEST_BODY
- ❌ PUT range missing cells array returns GRID_INVALID_REQUEST_BODY
- ❌ POST missing cells array returns GRID_INVALID_REQUEST_BODY
- ❌ Cell missing row/col returns GRID_INVALID_CELL_FORMAT
- ❌ Cell outside range returns GRID_CELL_OUT_OF_RANGE
- ❌ Invalid column format returns GRID_INVALID_COLUMN_FORMAT

## Edge Cases

### Test: edge-cases-special-values.test.sh
**Special Values**

Test cases:
- ✅ Store empty string ""
- ✅ Store very long text (10KB)
- ✅ Store Unicode characters (emoji, Chinese, Arabic)
- ✅ Store JSON string
- ✅ Store numeric strings ("123", "3.14")
- ✅ Store special characters (\n, \t, \r, quotes)
- ✅ All values stored as TEXT (no type coercion)

### Test: edge-cases-boundaries.test.sh
**Boundary Conditions**

Test cases:
- ✅ Cell A1 (first cell)
- ✅ Cell at row_max, col_max (last valid cell)
- ✅ Grid with row_max=1 (minimal rows)
- ✅ Grid with col_max='A' (single column)
- ✅ Grid with row_max=10000 (large grid)
- ✅ Empty grid (no cells)
- ✅ Fully populated grid (all cells filled)

### Test: edge-cases-concurrent-access.test.sh
**Concurrent Access**

Test cases:
- ✅ Multiple users reading same grid simultaneously
- ✅ Multiple users writing different cells simultaneously
- ✅ Multiple users writing same cell (last write wins)
- ✅ Transaction isolation prevents race conditions
- ✅ No deadlocks under load

### Test: edge-cases-grid-lifecycle.test.sh
**Grid Lifecycle**

Test cases:
- ✅ Create grid → populate cells → read cells → delete grid
- ✅ Verify CASCADE delete removes all cells
- ✅ Create grid → populate → clear all cells → verify empty
- ✅ Create grid → update bounds → verify validation changes
- ✅ Soft delete grid (trashed_at) preserves cells

## Integration Tests

### Test: integration-data-api.test.sh
**Data API Integration**

Test cases:
- ✅ Create grid via Data API
- ✅ Update grid via Data API
- ✅ Grid appears in GET /api/data/grids
- ✅ Grid has ACLs (access_read, access_edit, etc.)
- ✅ Grid has history tracking
- ✅ Grid has timestamps (created_at, updated_at)
- ✅ Soft delete grid sets trashed_at
- ✅ Hard delete grid removes cells (CASCADE)

### Test: integration-acls.test.sh
**ACL Integration**

Test cases:
- ✅ User can only access grids they have ACL for
- ✅ User with access_read can GET cells
- ✅ User with access_edit can PUT/DELETE cells
- ✅ User without ACL cannot access grid
- ✅ ACLs checked via grid lookup (select404)

### Test: integration-history.test.sh
**History Integration**

Test cases:
- ✅ Grid changes tracked in history table
- ✅ Grid creation logged
- ✅ Grid updates logged
- ✅ Grid deletion logged
- ✅ Cell operations NOT logged (external schema)
- ✅ Verify grid history via /api/history/grids/:id

## Use Case Tests

### Test: use-case-exploration.test.sh
**Data Exploration Use Case**

Test cases:
- ✅ Create exploration grid "Q1 Revenue"
- ✅ Add column headers (A1="Region", B1="Revenue", etc.)
- ✅ Add data rows (A2="West", B2="150000", etc.)
- ✅ Read back data for analysis
- ✅ Update values as analysis evolves
- ✅ Clear cells when starting over

### Test: use-case-spreadsheet.test.sh
**Simple Spreadsheet Use Case**

Test cases:
- ✅ Create grid with headers
- ✅ Populate data in rows
- ✅ Read entire grid (A1:Z100)
- ✅ Update specific cells
- ✅ Delete rows (5:5)
- ✅ Clear columns (C:C)
- ✅ Bulk import data from array

### Test: use-case-form-data.test.sh
**Form Data Collection Use Case**

Test cases:
- ✅ Create grid for form responses
- ✅ Each row is a form submission
- ✅ Columns are form fields
- ✅ Append new submissions (find next empty row)
- ✅ Update existing submission
- ✅ Export all submissions (GET full range)

## Performance Tests

### Test: performance-read.test.sh
**Read Performance** (optional)

Test cases:
- ⏱️ Read single cell < 50ms
- ⏱️ Read range (A1:Z100) < 500ms
- ⏱️ Read full grid (1000 rows) < 2s
- ⏱️ Sparse storage doesn't slow down reads

### Test: performance-write.test.sh
**Write Performance** (optional)

Test cases:
- ⏱️ Write single cell < 100ms
- ⏱️ Write 100 cells (bulk) < 1s
- ⏱️ Write 1000 cells (bulk) < 5s
- ⏱️ UPSERT performance comparable to INSERT

### Test: performance-delete.test.sh
**Delete Performance** (optional)

Test cases:
- ⏱️ Delete single cell < 50ms
- ⏱️ Delete range (A1:Z100) < 500ms
- ⏱️ Clear entire grid (1000 rows) < 2s

## Test Utilities Needed

Create helper functions in `spec/helpers/grid-helpers.sh`:
- `create_test_grid()` - Create grid via Data API
- `populate_cells()` - Bulk populate cells for testing
- `verify_cell_value()` - Verify cell has expected value
- `verify_cell_deleted()` - Verify cell doesn't exist
- `verify_sparse_storage()` - Query database directly to verify row count
- `cleanup_grids()` - Clean up test grids

## Test Data Fixtures

Create test data patterns:
- Simple grid (10 rows, 5 columns)
- Large grid (1000 rows, 26 columns)
- Sparse grid (1000 possible cells, only 10 populated)
- Full grid (all cells populated)
- Unicode data (emoji, multi-language)
- Edge case values (empty strings, very long text)

## Coverage Goals

- ✅ All endpoints have basic success tests
- ✅ All endpoints have error condition tests
- ✅ All range notation types tested (single, range, row, col)
- ✅ All validation scenarios tested (bounds, format, etc.)
- ✅ Transaction behavior verified
- ✅ External schema protection verified
- ✅ Sparse storage behavior verified
- ✅ Error handling comprehensive (all GRID_* error codes)
- ✅ Edge cases covered
- ✅ Integration with Data API verified
- ✅ Use cases validated

Target: 95%+ code coverage for Grid API

## Test Execution Order

Recommended order for implementing tests:
1. Grid management (create/update/delete via Data API)
2. Range notation parsing (all types)
3. Single cell operations (GET/PUT/DELETE)
4. Cell range operations (A1:Z100)
5. Row range operations (5:5)
6. Column range operations (A:A)
7. Bulk operations (POST /app/grids/:id/cells)
8. Bounds validation (row_max, col_max)
9. Transaction behavior
10. Sparse storage verification
11. External schema protection
12. Error handling (all GRID_* codes)
13. Edge cases
14. Integration tests (Data API, ACLs, history)
15. Use case tests
16. Performance tests (optional)

## Notes

- Grid API bypasses observer pipeline (uses raw SQL)
- All operations are transaction-aware (withTransactionParams)
- Sparse storage is critical for efficiency
- Bounds validation is per-grid (not global)
- External schema pattern prevents accidental Data API access
- All error codes prefixed with GRID_
- Range notation follows Excel conventions (1-based rows, A-Z columns)

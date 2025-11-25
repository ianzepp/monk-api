# 52-grids-app: Grid/Spreadsheet Application

**Priority**: NICE TO HAVE
**Coverage**: 0% (No tests implemented - specification only)
**Status**: Complete specification with 150+ planned test cases

## Critical / Smoke Tests

### Missing Critical Tests (8+ for core functionality)
- POST /api/data/grids - Create grid via Data API
- GET /api/grids/:id/:range - Read cells (single, range, row, field)
- PUT /api/grids/:id/:range - Write cells (single and range)
- DELETE /api/grids/:id/:range - Delete cells
- POST /api/grids/:id/cells - Bulk upsert cells
- Range notation parsing (A1, A1:Z100, 5:5, A:A)
- Bounds validation (row_max, col_max enforcement)
- Sparse storage verification (empty cells not stored)

## Additional Tests

### Missing Coverage (145+ test cases planned)

**Grid Management (via Data API):**
- CRUD operations for grids
- Default row_max=1000, col_max='Z'
- Custom row_max and col_max configuration
- Validation (positive integers, A-Z only)
- CASCADE delete removes all cells

**Range Notation Parsing (4 types):**
- Single cell (A1, Z100)
- Cell range (A1:Z100, B2:D10)
- Row range (5:5, 1:10)
- Field range (A:A, A:Z)
- Invalid format rejection (backwards ranges, lowercase, etc.)

**Cell Read Operations:**
- Read single cell (existing and empty)
- Read cell range with sparse results
- Read row range (all cells in row)
- Read field range (all cells in field)
- Response format: {grid_id, range, cells: [{row, col, value}]}

**Cell Write Operations:**
- Write single cell (create new, update existing)
- Write cell range (multiple cells in transaction)
- Bulk upsert cells (POST endpoint, up to 1000 cells)
- UPSERT pattern (ON CONFLICT DO UPDATE)
- Null value handling (null deletes cell for sparse storage)

**Cell Delete Operations:**
- Delete single cell
- Delete cell range
- Delete row range (all cells in row)
- Delete field range (all cells in field)
- Response includes deleted count

**Bounds Validation:**
- Row bounds enforcement (1 to row_max)
- Field bounds enforcement (A to col_max)
- Dynamic bounds changes (cells exist but inaccessible after limit decrease)
- Error codes: GRID_ROW_OUT_OF_BOUNDS, GRID_FIELD_OUT_OF_BOUNDS

**Transaction Support:**
- All operations use withTransactionParams
- Successful operations commit atomically
- Errors trigger rollback
- No partial data on failure

**External Model Protection:**
- Data API cannot SELECT/INSERT/UPDATE/DELETE from grid_cells
- DDL observers skip grid_cells (no automatic table alterations)
- Error code: MODEL_EXTERNAL
- Ring 0 guard enforcement

**Sparse Storage:**
- Empty cells not stored in database
- GET on empty cell returns empty array
- Writing null deletes cell (removes row from database)
- Only populated cells consume storage
- Verification via direct database queries

**Bulk Operations:**
- Bulk limit: min(1000, row_max × 26)
- All operations in single transaction
- Validation before any writes
- Error codes: GRID_BULK_LIMIT_EXCEEDED, GRID_INVALID_CELL_FORMAT

**Error Handling:**
- Grid not found (404)
- Invalid range format (GRID_INVALID_RANGE)
- Bounds exceeded (GRID_ROW_OUT_OF_BOUNDS, GRID_FIELD_OUT_OF_BOUNDS)
- Invalid request body (GRID_INVALID_REQUEST_BODY)
- Cell outside range (GRID_CELL_OUT_OF_RANGE)
- Invalid field format (GRID_INVALID_FIELD_FORMAT)

**Edge Cases:**
- Special values (empty string, very long text, Unicode, JSON strings)
- Boundary conditions (A1, last valid cell, minimal/large grids)
- Concurrent access (multiple users, same cell, transaction isolation)
- Grid lifecycle (create → populate → read → delete, cascade behavior)

**Integration:**
- Data API integration (grid creation, ACLs, history, timestamps)
- ACL validation (access_read, access_edit enforcement)
- History tracking (grid changes logged, cell operations not logged)
- Soft delete (trashed_at preserves cells)

**Use Cases:**
- Data exploration (ad-hoc tabular data)
- Simple spreadsheet (headers, rows, bulk import)
- Form data collection (row per submission, field per field)

**Performance (optional):**
- Read single cell < 50ms
- Read range (A1:Z100) < 500ms
- Write 100 cells (bulk) < 1s
- Delete range < 500ms

## Notes

- Comprehensive specification document with detailed test cases
- All test cases marked with checkboxes (none implemented)
- Excel-like functionality (range notation, sparse storage, calculations)
- Bypasses observer pipeline (raw SQL operations)
- External model pattern prevents accidental Data API access
- Fills gap between unstructured JSONB and formal models
- Includes helper function specifications
- Includes test fixture requirements
- Target: 95%+ code coverage
- Application feature for spreadsheet-like data management

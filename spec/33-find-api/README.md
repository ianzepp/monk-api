# 33-find-api: Search & Query API

**Priority**: CRITICAL (basic tests only, advanced testing can be deferred)
**Coverage**: 95% (Excellent)
**Status**: Comprehensive coverage of all query capabilities with complete unit test suite

## Critical / Smoke Tests

### Integration Tests (30 total: 26 shell, 4 TypeScript)
- POST /api/find/:model - Empty filter queries (basic-find.test.sh, basic-find.test.ts)
- Simple equality where clauses (simple-where.test.sh, where-equality.test.sh)
- Basic field selection with ?select parameter (select-basic.test.sh)
- Limit/pagination (limit-basic.test.sh, limit-basic.test.ts)
- ORDER BY sorting (order-basic.test.sh, order-basic.test.ts)
- COUNT aggregation (count-total.test.sh, count-total.test.ts)

### Unit Tests (245 total: TypeScript/Vitest)
- **Filter API** (65 tests) - filter.unit.ts
  - Input normalization (UUID, arrays, objects)
  - SELECT clause generation and field validation
  - WHERE clause building with soft delete options
  - Operator handling ($eq, $in, $like, $and, $or, $between, etc.)
  - ORDER BY clause generation
  - LIMIT/OFFSET handling
  - SQL generation methods (toSQL, toWhereSQL, toCountSQL, toAggregateSQL)
  - Helper methods and edge cases

- **SQL Generation** (42 tests) - filter-sql-generator.unit.ts
  - Complete SELECT query generation
  - WHERE clause extraction
  - COUNT query generation
  - Aggregation queries ($sum, $avg, $min, $max, $count, $distinct)
  - GROUP BY support (single and multiple fields)
  - Field validation and SQL injection prevention
  - Helper methods (getWhereClause, getOrderClause, getLimitClause)

- **WHERE Clause Logic** (80 tests) - filter-where.unit.ts
  - Basic comparison operators ($eq, $ne, $gt, $gte, $lt, $lte)
  - String pattern operators ($like, $nlike, $ilike, $nilike, $regex, $nregex)
  - Array value operators ($in, $nin with empty array handling)
  - PostgreSQL array operators ($any, $all, $nany, $nall)
  - Array size operators ($size with nested operators)
  - Range operators ($between with validation)
  - Existence operators ($exists, $null)
  - Search operators ($find, $text)
  - Logical operators ($and, $or, $not, $nand, $nor)
  - Soft delete options (trashed: 'exclude' | 'include' | 'only')
  - Parameter offsetting for complex queries
  - Comprehensive validation (field names, operators, data types)
  - Edge cases (null/undefined, nested conditions, special values)

- **ORDER BY Logic** (58 tests) - filter-order.unit.ts
  - String format parsing ("name asc", "created_at desc")
  - Array format ([{ field: 'name', sort: 'asc' }])
  - Object format ({ name: 'asc', created_at: 'desc' })
  - Field name sanitization and SQL injection protection
  - Sort direction normalization (asc/desc/ascending/descending)
  - Multiple input format handling
  - Validation vs sanitization behavior
  - Edge cases and complex scenarios

## Additional Tests

### Comprehensive Where Clause Coverage
- Comparison operators (>, <, >=, <=, !=) (where-comparison.test.sh)
- BETWEEN range queries (where-between.test.sh)
- LIKE pattern matching (where-like.test.sh)
- Regex pattern matching (where-regex.test.sh)
- Full-text search (where-text.test.sh)
- Existence checks (where-exists.test.sh)
- Logical operators (AND, OR, NOT) (where-logical.test.sh)
- Array operations (where-arrays.test.sh)
- ANY array matching (where-arrays-any.test.sh)
- Find within arrays (where-find.test.sh)

### Complex Query Tests
- Multi-condition queries with nested logic (complex-01 through complex-05.test.sh)
- Combined filters, sorting, and pagination
- Edge case handling

### Missing Tests (1 minor)
- Performance benchmarks with large datasets (10k+ records)

## Notes

- **This is one of the best-tested components in the codebase**
- **Triple coverage strategy**:
  1. Shell scripts for end-to-end integration testing (26 tests)
  2. TypeScript integration tests for API validation (4 tests)
  3. **NEW: Comprehensive unit tests for filter logic (245 tests)**
- Unit tests run without database or API server (fast, isolated)
- All 30+ filter operators tested and validated
- SQL injection protection verified across all components
- Soft delete behavior fully documented and tested
- Parameter offsetting for complex queries verified
- Both strict validation (FilterWhere) and permissive sanitization (FilterOrder) behaviors tested
- Excellent documentation of query capabilities
- Missing performance benchmarks are minor - all core functionality comprehensively tested

## Test Execution

### Run Unit Tests Only
```bash
npm run test:unit                    # Run all unit tests (245 tests)
npm run test:unit -- filter          # Run filter-related tests only
npm run test:unit -- --watch         # Watch mode for development
```

### Run Integration Tests
```bash
npm run test:sh spec/33-find-api/    # Run all shell integration tests
npm run test:ts                      # Run TypeScript integration tests
```

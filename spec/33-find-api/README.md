# 33-find-api: Search & Query API

**Priority**: CRITICAL (basic tests only, advanced testing can be deferred)
**Coverage**: 90% (Excellent)
**Status**: Comprehensive coverage of all query capabilities

## Critical / Smoke Tests

### Existing Basic Tests (30 total: 26 shell, 4 TypeScript)
- POST /api/find/:model - Empty filter queries (basic-find.test.sh, basic-find.test.ts)
- Simple equality where clauses (simple-where.test.sh, where-equality.test.sh)
- Basic field selection with ?select parameter (select-basic.test.sh)
- Limit/pagination (limit-basic.test.sh, limit-basic.test.ts)
- ORDER BY sorting (order-basic.test.sh, order-basic.test.ts)
- COUNT aggregation (count-total.test.sh, count-total.test.ts)

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

### Missing Tests (2 minor)
- Offset parameter testing (limit + offset combinations for pagination)
- Performance benchmarks with large datasets (10k+ records)

## Notes

- This is one of the best-tested components
- Dual coverage: shell scripts for integration, TypeScript for unit validation
- Filter logic should be tested in TypeScript without API connection (vitest recommended)
- Shell tests validate end-to-end API behavior
- Excellent documentation of query capabilities
- Missing tests are minor - core functionality is comprehensive

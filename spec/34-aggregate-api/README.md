# 34-aggregate-api: Aggregation Functions

**Priority**: MODERATE
**Coverage**: 40% (Basic coverage only)
**Status**: COUNT operations tested, numeric aggregations missing

## Critical / Smoke Tests

### Existing Tests (2)
- POST /api/aggregate/:schema - COUNT(*) all records (basic-count.test.sh)
- POST /api/aggregate/:schema - GROUP BY single column with COUNT (group-by-basic.test.sh)

## Additional Tests

### Existing Coverage
- COUNT with WHERE filter
- COUNT DISTINCT values
- Multiple aggregations in single query
- GROUP BY with multiple aggregations
- Response format and structure validation

### Missing Tests (5 - marked as TODO)
- SUM/AVG/MIN/MAX numeric aggregations (needs numeric field schema testing)
- Multi-column GROUP BY operations
- Complex WHERE clauses combined with GROUP BY
- Soft delete integration with aggregations (_deleted_at filtering)
- ACL filtering with aggregations (permission-aware counts)

## Notes

- Good basic coverage for COUNT operations
- Missing comprehensive numeric aggregation testing (SUM, AVG, MIN, MAX)
- Should test with numeric fields (revenue, quantities, scores) to validate math operations
- ACL and soft delete integration important for production data accuracy

# 34-Aggregate API Tests

Tests for the Aggregate API endpoint (`/api/aggregate/:schema`).

## Test Coverage

### Basic Aggregation Functions
- **basic-count.test.sh** - Simple COUNT(*) aggregations
  - COUNT all records
  - COUNT with WHERE filter
  - COUNT DISTINCT values
  - Multiple aggregations in single query

### GROUP BY Operations
- **group-by-basic.test.sh** - GROUP BY with aggregations
  - Single column GROUP BY
  - Multiple aggregations per group
  - Verify grouped results structure

## Running Tests

Run all aggregate API tests:
```bash
npm run test:sh spec/34-aggregate-api/
```

Run specific test:
```bash
npm run test:sh spec/34-aggregate-api/basic-count.test.sh
```

## Test Scope

These tests verify:
- ✅ Basic aggregation functions (COUNT, SUM, AVG, MIN, MAX)
- ✅ COUNT(*) vs COUNT(field) behavior
- ✅ COUNT DISTINCT functionality
- ✅ WHERE clause filtering with aggregations
- ✅ GROUP BY single column
- ✅ GROUP BY with multiple aggregations
- ✅ Response format and structure
- ✅ Error handling for invalid aggregations

## Not Covered (TODO)

- ⚠️ SUM/AVG/MIN/MAX numeric aggregations (needs numeric field in schema)
- ⚠️ Multi-column GROUP BY
- ⚠️ Complex WHERE clauses with GROUP BY
- ⚠️ Soft delete integration with aggregations
- ⚠️ ACL filtering with aggregations
- ⚠️ Performance testing with large datasets

## Dependencies

Tests require:
- `basic` fixture with account schema
- Account schema fields: name, email, status
- Authentication via JWT tokens

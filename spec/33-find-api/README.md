# 33-Find API Tests

Comprehensive test suite for the Find API covering advanced search, filtering, and query optimization.

## Test Coverage

### Core Search Functionality
- **basic-find.test.sh** - Basic search with empty filters and result validation
- **simple-where.test.sh** - Simple where conditions and exact matching
- **limit-basic.test.sh** - Pagination and limit functionality

## Test Environment

Tests run against a dedicated test tenant with pre-configured schemas:
- `account` - Account management schema with sample data
- Test data is automatically cleaned up after each test run
- Templates provide consistent test datasets (5 accounts with known properties)

## Key Test Scenarios

### Basic Search Operations
- Empty filter queries returning all records
- Simple equality filters (exact match by name, email)
- Null value handling and existence checks
- Result structure validation and field verification

### Pagination and Limits
- Basic limit functionality (limit=2, limit=10)
- Handling limits larger than available dataset
- Result consistency across different limit values
- Record structure validation under pagination

### Filter Validation
- Simple where conditions with exact matches
- Single record retrieval by unique fields
- Multiple record filtering with shared properties
- Search result accuracy and completeness

### Performance Testing
- Query response time validation
- Large dataset handling capabilities
- Memory usage optimization
- Query plan efficiency (when explain parameter available)

## Running Tests

Individual test files can be run directly:
```bash
./spec/33-find-api/basic-find.test.sh
./spec/33-find-api/simple-where.test.sh
./spec/33-find-api/limit-basic.test.sh
```

Or run the complete test suite:
```bash
cd spec/33-find-api && for test in *.test.sh; do ./"$test"; done
```
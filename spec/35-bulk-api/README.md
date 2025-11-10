# 35-Bulk API Tests

Comprehensive test suite for the Bulk API covering transaction safety, rollback scenarios, and mixed operation types.

## Test Coverage

### Core Bulk Operations
- **create-accounts-simple.test.sh** - Basic bulk creation with multiple records
- **rollback-check.test.sh** - Transaction rollback on validation failures
- **rollback-mixed-operations.test.sh** - Mixed operation rollback across schemas

## Test Environment

Tests run against a dedicated test tenant with pre-configured schemas:
- `account` - Account management schema with validation rules
- `contact` - Contact schema for relationship testing
- Test data is automatically cleaned up after each test run
- Templates provide consistent test datasets

## Key Test Scenarios

### Transaction Safety
- All-or-nothing execution guarantee
- Automatic rollback on any operation failure
- Data consistency verification after rollback
- Baseline comparison before and after operations

### Rollback Scenarios
- Validation failure during bulk creation
- Invalid data causing operation failure
- Mixed operations with partial failure
- Cross-schema transaction rollback

### Bulk Creation
- Multiple record creation in single operation
- Record structure validation
- Field requirement verification
- Bulk response format validation

### Mixed Operations
- Create, update, and delete in single transaction
- Cross-schema operations with dependencies
- Operation ordering and dependencies
- Complex business workflow simulation

## Running Tests

Individual test files can be run directly:
```bash
./spec/35-bulk-api/create-accounts-simple.test.sh
./spec/35-bulk-api/rollback-check.test.sh
./spec/35-bulk-api/rollback-mixed-operations.test.sh
```

Or run the complete test suite:
```bash
cd spec/35-bulk-api && for test in *.test.sh; do ./"$test"; done
```
# 32-Data API Tests

Comprehensive test suite for the Data API covering CRUD operations, relationship management, bulk operations, and soft delete functionality.

## Test Coverage

### Core CRUD Operations
- **create-record.test.sh** - Single and bulk record creation
- **select-record.test.sh** - Record retrieval and filtering
- **update-record.test.sh** - Single and bulk record updates
- **delete-record.test.sh** - Soft delete functionality

### Relationship Management
- **create-relationship-post.test.sh** - Creating relationships via POST
- **update-relationship-post.test.sh** - Updating relationship data
- **delete-relationship-post.test.sh** - Removing individual relationships
- **delete-relationship-array.test.sh** - Bulk relationship removal

## Test Environment

Tests run against a dedicated test tenant with pre-configured schemas:
- `users` - User management schema
- `posts` - Content schema with relationships
- `comments` - Related content schema
- Test data is automatically cleaned up after each test run

## Key Test Scenarios

### Data Validation
- Required field validation
- Data type constraints
- Unique field constraints
- Relationship integrity

### Bulk Operations
- Array-based record creation
- Filter-based bulk updates
- Filter-based bulk deletes
- Transaction rollback on errors

### Soft Delete System
- Three-tier access pattern validation
- Exclusion from list operations
- Preservation of direct access
- Update blocking for trashed records

### Error Handling
- Record not found scenarios
- Validation error responses
- Permission denied cases
- Invalid relationship operations

## Running Tests

Individual test files can be run directly:
```bash
./spec/32-data-api/create-record.test.sh
./spec/32-data-api/select-record.test.sh
```

Or run the complete test suite:
```bash
cd spec/32-data-api && for test in *.test.sh; do ./"$test"; done
```
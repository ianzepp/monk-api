# 37-File API Tests

Comprehensive test suite for the File API covering virtual file system operations, content management, and access control.

## Test Coverage

### Core File Operations
- **store-update-record.test.sh** - File storage and record creation/update via file interface
- **retrieve-field-raw.test.sh** - File retrieval for records and field content (JSON and raw modes)
- **stat-size-modify.test.sh** - File metadata, size calculation, and modification time operations
- **list-root-schema.test.sh** - Directory listing and browsing (root, schemas, records)
- **delete-record-soft.test.sh** - File deletion (soft delete) and cleanup operations

### Advanced Features
- **retrieve-show-hidden.test.sh** - Hidden field filtering for record retrieval (`show_hidden` option)
- **list-show-hidden.test.sh** - Hidden field filtering for directory listings and file sizes

## Test Environment

Tests run against a dedicated test tenant with pre-configured schemas:
- `account` - Account management schema for file operations
- Test data is automatically cleaned up after each test run
- Templates provide consistent test datasets

## Key Test Scenarios

### File Storage
- JSON record creation via file storage interface
- Content type detection and validation
- Parent directory creation (create_parents option)
- File overwrite protection and validation

### File Retrieval
- Complete record content retrieval
- Metadata inclusion and formatting
- Content type preservation
- File format conversion options

### File Metadata (Stat)
- Directory metadata (type, children count, access levels)
- File metadata (size, content type, timestamps)
- Schema information integration
- Permission and access level validation

### Directory Operations
- Directory listing with pagination
- Recursive directory browsing (planned)
- File type filtering and sorting
- Hidden file inclusion options (`show_hidden` controls system field visibility)

### Access Control
- Permission validation for read/write operations
- Access level enforcement (read-only, read-write)
- Schema-level permission inheritance
- User and group permission mapping

## Test Status

**✅ File API tests are fully implemented and passing.** All core operations and advanced features have comprehensive test coverage.

## Running Tests

Individual test files can be run directly:
```bash
npm run test:sh spec/37-file-api/retrieve-show-hidden.test.sh
npm run test:sh spec/37-file-api/stat-size-modify.test.sh
npm run test:sh spec/37-file-api/list-root-schema.test.sh
```

Or run the complete test suite:
```bash
npm run test:sh 37-file-api
```

All tests use the `basic` fixture template for fast, isolated testing with pre-populated data.
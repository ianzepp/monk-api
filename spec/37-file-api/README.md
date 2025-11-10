# 37-File API Tests

Comprehensive test suite for the File API covering virtual file system operations, content management, and access control.

## Test Coverage

### Core File Operations
- **store-basic.test.sh** - File storage and record creation via file interface
- **retrieve-basic.test.sh** - File retrieval and content access
- **stat-basic.test.sh** - File and directory metadata operations
- **list-basic.test.sh** - Directory listing and browsing
- **delete-basic.test.sh** - File deletion and cleanup operations

### Advanced Features
- **size-basic.test.sh** - File size calculation and storage information
- **modify-time-basic.test.sh** - File modification time operations
- **stat-access-levels.test.sh** - Access control and permission validation

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
- Recursive directory browsing
- File type filtering and sorting
- Hidden file inclusion options

### Access Control
- Permission validation for read/write operations
- Access level enforcement (read-only, read-write)
- Schema-level permission inheritance
- User and group permission mapping

## Test Status

**⚠️ IMPORTANT**: File API tests are currently disabled pending implementation review. All test files include early exit with status message indicating the implementation is under review.

## Running Tests

Individual test files can be run directly (currently will exit with skip message):
```bash
./spec/37-file-api/store-basic.test.sh
./spec/37-file-api/retrieve-basic.test.sh
./spec/37-file-api/stat-basic.test.sh
```

Or run the complete test suite:
```bash
cd spec/37-file-api && for test in *.test.sh; do ./"$test"; done
```

**Note**: Tests will currently exit with "FILE API TEST DISABLED" message until implementation review is complete.
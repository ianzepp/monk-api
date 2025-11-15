# Test Suite Overview

This directory contains the Monk API test suite - bash-based integration tests organized by feature series. For complete testing documentation, see [`docs/TEST.md`](../docs/TEST.md).

## Quick Start

```bash
# Run all shell integration tests
npm run test:sh

# Run specific test series
npm run test:sh 31-meta-api

# Run individual test
./spec/31-meta-api/create-schema.test.sh

# Run test series
./spec/run-series.sh 31-meta-api
```

## Test Organization

Tests are organized by numbered series for logical categorization:

### Core Infrastructure (00-09)
- **00-prerequisites**: System requirements
- **01-basic**: Basic API functionality
- **02-server-config**: Server configuration
- **03-template-infrastructure**: Database templates
- **05-infrastructure**: Core connectivity

### Security & Authentication (10-19)
- **10-auth**: Public authentication endpoints
- **11-security-sql**: SQL injection protection
- **12-security-api**: API security validation
- **13-security-comprehensive**: Integrated security
- **15-authentication**: Authentication workflows

### API Testing (20-39)
- **30-auth-api**: Protected auth endpoints
- **31-meta-api**: Schema management
- **32-data-api**: CRUD operations
- **33-find-api**: Search and filtering
- **35-bulk-api**: Bulk operations
- **37-file-api**: File operations
- **38-acls-api**: Access control lists
- **39-root-api**: Root-level operations

### Advanced Features (40+)
- **41-database**: Database management
- **42-tenant**: Multi-tenant functionality
- **44-filter**: Advanced filtering
- **50-integration**: Cross-feature integration
- **60-lifecycle**: Application lifecycle
- **70-validation**: Data validation
- **85-observer-integration**: Observer system
- **90-examples**: Usage examples

## Helper Libraries

- **`test-helper.sh`** - Main test setup and validation
- **`curl-helper.sh`** - HTTP request wrappers
- **`test-tenant-helper.sh`** - Tenant database management
- **`file-api-helpers.sh`** - File API operations
- **`run-series.sh`** - Series test runner

## Test Patterns

```bash
# Source helpers
source "$(dirname "$0")/../test-helper.sh"

# Setup with template (most common)
setup_test_with_template "test-name" "basic"
setup_full_auth

# Make authenticated request
response=$(auth_post "api/describe/account" "$schema_json")
assert_success "$response"

# Validate response
data=$(extract_and_validate_data "$response" "operation result")
validate_record_fields "$data" "id" "name" "email"
```

## Environment Variables

Key variables automatically configured:
- `API_BASE` - Server base URL (default: http://localhost:9001)
- `JWT_TOKEN` - User authentication token
- `ROOT_TOKEN` - Administrative token
- `TEST_TENANT_NAME` - Current test tenant name
- `TEST_DATABASE_NAME` - Current test database name

## Documentation

For complete testing documentation including:
- Detailed test execution patterns
- Helper function reference
- Test writing guidelines
- Troubleshooting guide
- Performance optimization

See: [`docs/TEST.md`](../docs/TEST.md)

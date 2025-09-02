# Test Suite Guide

## Overview

This directory contains the Monk API test suite - bash-based integration tests organized by feature series. Tests use helper libraries for consistent patterns and validation.

## Test Structure

```
spec/
├── NN-series/           # Test series by feature area
│   └── *.test.sh       # Individual test files
├── *.sh                # Helper libraries
├── account.json        # Test data fixture
└── run-series.sh       # Series runner script
```

### Series Organization

- `01-basic/` - Basic API functionality and discovery
- `10-auth/` - Authentication and authorization
- `31-meta-api/` - Schema management operations  
- `32-data-api/` - Record CRUD operations
- `35-bulk-api/` - Bulk operations
- `37-file-api/` - File operations
- `38-acls-api/` - Access control lists
- `42-tenant/` - Multi-tenant isolation
- `44-filter/` - Query filtering and search

## Test Execution Cycle

### Standard Development Workflow

1. **Build if source changed:**
   ```bash
   npm run build
   ```

2. **Restart server:**
   ```bash
   npm run stop && npm run start:bg
   ```

3. **Run specific test:**
   ```bash
   ./spec/31-meta-api/create-schema.test.sh
   ```

4. **Run entire series:**
   ```bash
   ./spec/run-series.sh 31-meta-api
   ```

## Helper Libraries

### Core Helpers

- **`test-helper.sh`** - Main test setup and validation functions
- **`curl-helper.sh`** - HTTP request wrappers and response validation  
- **`test-tenant-helper.sh`** - Isolated tenant database management
- **`file-api-helpers.sh`** - File API specific operations

### Common Test Patterns

#### Basic Test Setup

```bash
# Source helpers
source "$(dirname "$0")/../test-helper.sh"

# Simple API test (no isolation)
setup_test_basic

# Isolated tenant test
setup_test_isolated "test-name"

# Template-based test (with sample data)
setup_test_with_template "test-name" "basic"
```

#### Authentication Setup

```bash
# Admin user authentication
setup_admin_auth

# Root user authentication  
setup_root_auth
```

#### Request Patterns

```bash
# Authenticated requests
response=$(auth_get "api/data/account")
response=$(auth_post "api/meta/account" "$schema_json")
response=$(auth_put "api/data/account/$id" "$update_data")
response=$(auth_delete "api/data/account/$id")

# Root-level operations
response=$(root_post "api/admin/tenants" "$tenant_data")
```

#### Response Validation

```bash
# Validate successful response
assert_success "$response"
data=$(extract_and_validate_data "$response" "operation result")

# Validate specific fields exist
validate_record_fields "$record" "id" "name" "email"

# Validate system timestamps
validate_system_timestamps "$record"

# Check error responses
assert_error "$response"
assert_error_code "SCHEMA_NOT_FOUND" "$response"
```

#### Error Testing

```bash
# Test non-existent resources
test_nonexistent_record "account" "get"
test_nonexistent_schema "get"

# Test endpoint errors with expected codes
test_endpoint_error "GET" "api/meta/invalid" "" "SCHEMA_NOT_FOUND" "invalid schema"
```

## Test Data Generation

### Built-in Generators

```bash
# Generate test account data
account_data=$(generate_test_account "John Doe" "john@example.com" "johndoe")

# Generate simple schema
schema_data=$(generate_simple_schema "TestSchema" '"name"')
```

### Using Fixtures

```bash
# Load account schema fixture
account_schema=$(cat spec/account.json)
```

## Environment Variables

Key variables automatically configured:

- `API_BASE` - Server base URL (default: http://localhost:9001)
- `JWT_TOKEN` - User authentication token
- `ROOT_TOKEN` - Administrative token
- `TEST_TENANT_NAME` - Current test tenant name
- `TEST_DATABASE_NAME` - Current test database name

## Writing New Tests

### Basic Template

```bash
#!/usr/bin/env bash
set -e

# Test description and purpose
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing [feature description]"

# Setup appropriate test environment
setup_test_with_template "test-name"
setup_admin_auth

# Test implementation with clear steps
print_step "Testing specific operation"
response=$(auth_post "api/endpoint" "$test_data")
data=$(extract_and_validate_data "$response" "operation result")

# Validation with descriptive success messages
validate_record_fields "$data" "expected_field"
print_success "Test completed successfully"
```

### Best Practices

- Use descriptive test and step names
- Validate both success and error cases  
- Test with realistic data using generators
- Include verification steps after operations
- Use appropriate setup function for test needs
- Clean output with `print_step/print_success`
- Fail fast with descriptive error messages
# Testing Guide

Quick reference guide for running tests in the Monk API project.

> **📖 For complete technical specifications, architecture details, and implementation patterns, see [SPEC.md](SPEC.md)**

## Quick Start

```bash
# Run all tests (recommended)
npm run spec

# Run TypeScript tests only
npm run spec:ts

# Run shell tests only
npm run spec:sh
```

## Test Types

### TypeScript Tests
- **Unit tests**: Fast tests with no database dependencies
- **Integration tests**: Database operations and API endpoints
- **Security tests**: SQL injection protection and API security

### Shell Tests
- **End-to-end**: CLI and API testing with real database operations
- **Integration**: Multi-step workflows and external tool testing

## Running Specific Tests

```bash
# By category
npm run spec 15              # Authentication tests
npm run spec:ts 44           # Filter system unit tests
npm run spec:sh basic-auth   # Shell auth test

# By pattern
npm run spec:ts unit         # All unit tests
npm run spec:sh 15-20        # Auth and describe API tests

# Individual files
npm run spec:ts spec/44-filter/logical-operators.test.ts
npm run spec:sh spec/15-authentication/basic-auth.test.sh
```

## Test Organization

Tests are organized by numbered series for easy categorization:

- **00-prerequisites**: Command availability checks
- **05-infrastructure**: Core connectivity and configuration
- **15-authentication**: Auth workflows and JWT handling
- **20-describe-api**: Schema management (JSON operations)
- **30-data-api**: Data operations (CRUD)
- **40-49**: Unit test series (no database)
- **50-59**: Integration test series (requires database)

## Writing Tests

### TypeScript Tests
```typescript
import { describe, test, expect } from 'vitest';

describe('My Feature', () => {
  test('should work correctly', () => {
    // Test implementation
    expect(result).toBeDefined();
  });
});
```

### Shell Tests
```bash
#!/bin/bash
set -e

source "$(dirname "$0")/../helpers/test-env-setup.sh"
source "$(dirname "$0")/../helpers/auth-helper.sh"

if ! auth_as_user "root"; then
    exit 1
fi

# Test implementation using $TEST_TENANT_NAME
```

## Database Testing

Each test gets an isolated tenant database:
- **Fresh tenant**: Created automatically per test suite
- **No pollution**: Tests don't interfere with each other
- **Auto cleanup**: Databases cleaned up after tests complete

## Best Practices

- **Use unit tests** when possible (faster, no database setup)
- **Test edge cases** including null values and boundary conditions
- **Descriptive names** for test files and test cases
- **Clean imports** using path aliases (`@src`, `@spec`, `@sql`)

## Troubleshooting

```bash
# Check system health
npm run compile                    # TypeScript compilation
psql -d monk_main -c "SELECT 1;" # Database connectivity
curl http://localhost:9001/health  # API server

# Common fixes
npm run autoinstall               # Reset configuration
```

## Performance Tips

- **Run unit tests first**: `npm run spec:ts unit` for quick feedback
- **Pattern matching**: Use specific patterns to run relevant tests only
- **Parallel execution**: TypeScript tests can run concurrently

---

**For complete documentation including:**
- Detailed test architecture and implementation patterns
- Advanced testing strategies and performance considerations
- Troubleshooting procedures and debugging techniques
- Future enhancement plans

**See [SPEC.md](SPEC.md) - Complete Test Specification**

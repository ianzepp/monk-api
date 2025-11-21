# 30-auth-api: Authentication API

**Priority**: CRITICAL
**Coverage**: 33% (2 of 6 endpoints tested)
**Status**: IN PROGRESS - Core registration and login now tested, token refresh still needed

## Critical / Smoke Tests

### Tested (2)
- POST /auth/register - User registration with tenant creation from templates ✅ (6 tests | 3 skipped)
  - Tests: Tenant creation, custom username, system/demo templates, invalid template, duplicate tenant
  - Skipped: Enterprise mode database restrictions, personal mode collisions, template clone failures
- POST /auth/login - Authenticate with valid credentials and comprehensive error handling ✅ (6 tests | 1 skipped)
  - Tests: Valid login, format preference, missing tenant, missing username, nonexistent tenant, invalid username
  - Skipped: null/undefined tenant edge case

### Missing Critical Tests (4)
- POST /auth/refresh - JWT token refresh mechanism (BLOCKING: session management untested)
- GET /auth/tenants - List available tenants for user (personal mode discovery)
- GET /auth/templates - List available database templates (personal mode setup)
- POST /auth/fake - Debug endpoint for user impersonation tokens (testing/dev workflow)

## Additional Tests

### Missing Coverage
- Login edge cases (invalid credentials, expired tokens, malformed requests)
- Register validation (duplicate users, invalid email, password requirements)
- Refresh token expiration handling
- Multi-tenant authentication flows
- Rate limiting and brute force protection

## Implementation Notes

### Completed Work
- Register and login endpoints now have comprehensive test suites with error code coverage
- All error codes standardized with AUTH_ prefix for router-thrown errors and DATABASE_ prefix for database operations
- Error codes documented in src/routes/auth/PUBLIC.md master error codes reference table
- Tests use lightweight TestHelpers utility for tenant creation with unique naming (timestamp + random hex)
- Both endpoints validate required fields and test realistic error scenarios

### Test Patterns
- Tests create isolated tenants via TestHelpers.createTestTenant() to avoid cross-test pollution
- Error response validation checks both error message and error_code for accuracy
- Skipped tests documented with reasons (blocked by server mode, system mock limitations, etc.)

### Remaining Work
- Token refresh mechanism (POST /auth/refresh) - essential for session management
- Tenant discovery (GET /auth/tenants) - needed for personal mode support
- Template listing (GET /auth/templates) - needed for registration flow discovery
- Debug impersonation endpoint (POST /auth/fake) - testing/development utility

### Security Notes
- All error messages now standardized and documented for security consistency
- Test coverage validates input validation (required fields) and authentication failures
- Tests verify token generation and format preference support

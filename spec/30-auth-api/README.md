# 30-auth-api: Authentication API

**Priority**: CRITICAL
**Coverage**: 16% (1 of 6 endpoints tested)
**Status**: SEVERELY INCOMPLETE - Missing core registration and token refresh

## Critical / Smoke Tests

### Existing Tests (1)
- POST /auth/login - Basic login with valid credentials and error handling for missing fields

### Missing Critical Tests (5)
- POST /auth/register - User registration with tenant creation (BLOCKING: no way to test onboarding)
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

## Notes

- Authentication is the entry point for all API access
- Register endpoint is completely untested despite being critical for user onboarding
- Token refresh is essential for production but has zero test coverage
- Current test only validates happy path login, no security or error handling tests

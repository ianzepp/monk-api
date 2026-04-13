# 15-authentication: Authentication Workflows

**Priority**: HIGH (Security)
**Coverage**: Auth0/OIDC verifier, mapping, protected request resolution, and local-auth clean-break policy
**Status**: Implemented for Auth0 migration foundation

## Critical / Smoke Tests

### Implemented Critical Security Tests
- Auth0 RS256/JWKS verifier accepts valid fixture tokens and rejects bad issuer, audience, expiry, signature, and algorithm.
- Auth0 identity mappings cover create, duplicate, missing mapping, and cross-issuer subject behavior.
- Protected request resolution covers valid mapped tokens, missing mappings, malicious routing claims, inactive tenants, deleted users, role downgrade refresh, and production local JWT rejection.
- Local auth policy covers production rejection and explicit non-production bootstrap gating.

## Additional Tests

### Missing Coverage
- User role and permission testing (RBAC validation)
- Authentication error handling (invalid credentials, expired tokens)
- Session management (concurrent sessions, session invalidation)
- Token expiration handling (graceful expiration, renewal)
- Brute force protection (rate limiting, account lockout)
- Password reset workflows
- Multi-factor authentication (if implemented)
- Token revocation (blacklisting, logout)
- JWT algorithm confusion attacks (none algorithm, weak keys)
- Token replay attack prevention
- Cross-tenant authentication isolation

## Notes

- **CRITICAL SECURITY GAP**: Zero authentication workflow testing
- Authentication is the foundation of all security
- Auth0 token validation is critical - test signature, issuer, audience, expiry, and algorithm handling.
- Multi-tenant isolation must be validated by proving token claims cannot select Monk tenant routing or authorization state.
- Should test both happy path and attack scenarios
- High priority for production deployment
- Overlaps with 30-auth-api but focuses on security aspects

# 01-basic: Core Functionality

**Priority**: NICE TO HAVE
**Coverage**: Good (2 tests)
**Status**: Basic smoke tests implemented

## Critical / Smoke Tests

### Existing Tests (2)
- GET / - API discovery and catalog listing (api-discovery.test.sh)
- Tenant creation and isolation validation (tenant-isolation.test.sh)

## Additional Tests

### Existing Coverage
- API catalog endpoint functionality
- Tenant provisioning and isolation
- Basic API routing validation
- Multi-tenancy foundation

### Missing Coverage
- API version negotiation
- Health check endpoints
- Error response format consistency
- CORS and security headers validation

## Notes

- Good foundational tests for API discovery
- Tenant isolation is critical for multi-tenancy
- Could expand to test more basic API conventions
- Validates fundamental API structure

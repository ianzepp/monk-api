# 40-docs-api: Self-Documenting API

**Priority**: CRITICAL (required for CLI tool integration)
**Coverage**: 70% (Good)
**Status**: Core APIs documented, missing newer endpoints

## Critical / Smoke Tests

### Existing Tests (1)
- GET /docs/:api - Self-documentation for auth, data, describe, file, sudo APIs (docs-api.test.sh)

### Missing Critical Tests (3)
- GET /docs/bulk - Bulk API documentation (needed for CLI)
- GET /docs/find - Find/Query API documentation (needed for CLI)
- GET /docs/aggregate - Aggregate API documentation (needed for CLI)

## Additional Tests

### Existing Coverage
- Documentation endpoint returns OpenAPI-style schemas
- Multiple API types validated (auth, data, describe, file, sudo)
- Format and structure validation

### Missing Coverage
- Documentation for all newer APIs (bulk, find, aggregate, acls, history, stat)
- Versioning support in documentation
- Documentation for infrastructure APIs (snapshots, sandboxes, templates)
- Schema validation for returned documentation format
- Documentation accuracy validation (comparing docs to actual endpoints)

## Notes

- Critical for CLI tool which relies on self-documenting APIs
- Monk CLI uses /docs endpoints to discover available operations
- Missing documentation for find/bulk/aggregate APIs may break CLI workflows
- Test validates structure but not accuracy of documentation content
- Should ensure all public APIs have corresponding /docs endpoints

# 05-infrastructure: Infrastructure Management

**Priority**: NICE TO HAVE
**Coverage**: 60% (Database naming tested, API endpoints partial)
**Status**: Good naming tests, incomplete API coverage

## Critical / Smoke Tests

### Existing Tests (4: 3 shell, 1 TypeScript with 37 tests)
- Database naming and validation (database-naming.test.ts - 37 comprehensive tests)
- Sandbox CRUD operations (sandboxes-api.test.sh)
- Snapshot async workflow (snapshots-api.test.sh)
- Template management (templates-api.test.sh)

## Additional Tests

### Existing Coverage (database-naming.test.ts)
- Hash consistency and format validation (tenant_ prefix, 16-char hex)
- Unicode character handling and normalization
- Whitespace trimming and sanitization
- Database name validation (alphanumeric + underscore only)
- PostgreSQL identifier limits (63 chars max)
- SQL injection prevention in naming
- Security validation for reserved names
- Template, sandbox, and snapshot naming conventions

### Missing Coverage (Shell tests marked as "Future Tests")
- Complete template API testing (GET /api/sudo/templates, template details)
- Complete sandbox API testing (team-scoped access validation, extend expiration)
- Complete snapshot API testing (status transitions, immutability enforcement)
- Verification that snapshots cannot be created from sandboxes
- Performance testing for template cloning (should be 30x faster than full copy)

## Notes

- DatabaseNaming service has excellent test coverage (37 tests)
- Infrastructure APIs (templates, sandboxes, snapshots) have placeholder shell tests
- Shell tests exist but may have incomplete coverage based on "Future Tests" comments
- Critical for multi-tenant infrastructure management
- See PUBLIC.md for complete infrastructure API documentation

# 05-infrastructure: Core Infrastructure Tests

Infrastructure tests for basic connectivity and server configuration.

**Scope:**
- Core system connectivity
- Server configuration validation
- Basic infrastructure components
- Environment setup verification

**Test Focus:**
- Database connectivity testing
- Server configuration validation
- API server startup and health
- Infrastructure dependency verification
- Environment variable validation

## Tests

### database-naming.test.ts (Unit Test)

Tests the DatabaseNaming service which handles tenant database name generation.

**Test Coverage:**
- Hash consistency and format validation (tenant_ prefix, 16-char hex)
- Unicode character handling and normalization
- Whitespace trimming
- Database name validation (alphanumeric + underscore only)
- PostgreSQL identifier limits (63 chars max)
- SQL injection prevention
- Security validation for reserved names

**Running:**
```bash
npm run test:ts 05
```

**37 test cases** covering enterprise mode hashing, validation, and integration tests.
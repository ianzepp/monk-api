# Monk API Fixtures System

> **Complete guide to the template-based database cloning system for ultra-fast test setup and development workflows.**

The fixtures system is a sophisticated **template-based database cloning architecture** that uses PostgreSQL's `CREATE DATABASE WITH TEMPLATE` capability to achieve **30x faster test setup** compared to traditional fresh database creation.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Available Templates](#available-templates)
4. [Fixture Commands](#fixture-commands)
5. [Template Management](#template-management)
6. [Test Integration](#test-integration)
7. [Performance Benefits](#performance-benefits)
8. [Protection Mechanisms](#protection-mechanisms)

10. [Best Practices](#best-practices)
11. [Troubleshooting](#troubleshooting)
12. [Advanced Usage](#advanced-usage)

## Overview

The fixtures system provides pre-built, populated databases that can be cloned instantly for testing, development, and deployment scenarios. Instead of creating fresh databases and populating them with schemas and data (which takes 2-3 seconds per test), the system clones pre-built templates in ~0.1 seconds.

### Key Benefits
- **30x faster test execution** (6 seconds vs 180 seconds for 60 tests)
- **Consistent test data** across all environments
- **Protected core templates** prevent test instability
- **Multiple template types** for different use cases
- **Neon cloud integration** for deployment workflows
- **Automatic cleanup** prevents database accumulation

## Architecture

### Core Components

```
fixtures/
├── testing/                  # Protected template (5 records each)
│   ├── describe/            # JSON schema definitions
│   ├── data/                # Pre-generated test data
│   └── .locked              # Protection lock file
├── basic_large/              # Larger template (100+ records each)
└── empty/                   # Minimal template for production
```

### Database Architecture

**Template Databases:**
- `monk_template_testing` - Standard test template
- `monk_template_testing_large` - Performance testing template
- `monk_template_empty` - Production-ready template

**Tenant Registry:**
Templates are registered in `monk.tenants` with `tenant_type='template'` for management and discovery.

### System Flow

1. **Template Creation:** `fixtures:build` creates template databases from fixture definitions
2. **Test Setup:** Test helpers clone templates to create isolated tenant databases
3. **Automatic Cleanup:** Test databases are cleaned up after test suite completion
4. **Cloud Deployment:** Templates can be deployed to Neon for cloud testing

## Available Templates

### Basic Template
- **Purpose:** Standard development and testing
- **Contents:** 5 accounts, 5 contacts with relationships
- **Use Case:** Most tests, development workflows
- **Size:** ~2.7KB total data
- **Speed:** ~0.1s cloning time

### Basic Large Template
- **Purpose:** Performance testing and load testing
- **Contents:** 100+ accounts, 100+ contacts
- **Use Case:** Performance benchmarks, pagination tests
- **Size:** ~6.3KB total data
- **Speed:** ~0.1s cloning time (same as basic)

### Empty Template
- **Purpose:** Production tenant creation
- **Contents:** Core infrastructure only, no sample data
- **Use Case:** Production deployments, clean tenant setup
- **Size:** Minimal infrastructure tables
- **Speed:** Fastest cloning (minimal data)

## Fixture Commands

### Build Templates
```bash
# Build testing template (most common)
npm run fixtures:build basic

# Build with force (rebuild existing)
npm run fixtures:build -- --force basic_large

# Build custom template
npm run fixtures:build my-template
```

### Generate Data
```bash
# Generate 100 records for custom template
npm run fixtures:generate my-template 100

# Generate large dataset
npm run fixtures:generate basic_large 1000
```

### Lock Templates
```bash
# Lock template to prevent regeneration
npm run fixtures:lock basic

# Template will show lock error if generation attempted
```

### Deploy to Neon
```bash
# Deploy template to Neon cloud
npm run fixtures:deploy basic

# Deploy with progress tracking
npm run fixtures:deploy basic --progress

# Force deploy (overwrite existing)
npm run fixtures:deploy basic --force
```

## Template Management

### Creating Custom Templates

```bash
# 1. Copy existing template
cp -r fixtures/testing fixtures/my-template

# 2. Remove lock to allow generation
rm fixtures/my-template/.locked

# 3. Generate custom data
npm run fixtures:generate my-template 500

# 4. Build template database
npm run fixtures:build my-template

# 5. Lock for protection (optional)
npm run fixtures:lock my-template
```

### Template Protection

Templates use a multi-layer protection system:

1. **Application Lock:** `.locked` file prevents regeneration
2. **Git Protection:** `--skip-worktree` prevents accidental commits
3. **Name Validation:** Enforces lowercase + underscore format
4. **Content Validation:** Schema and data integrity checks

### Emergency Unlock

```bash
# Remove application lock
rm fixtures/testing/.locked

# Remove git protection
git update-index --no-skip-worktree fixtures/testing/data/*.json

# Make changes
npm run fixtures:generate basic 10

# Re-lock (recommended)
npm run fixtures:lock basic
git update-index --skip-worktree fixtures/testing/data/*.json
```

## Test Integration

### High-Level Test Helpers

```bash
# Most common pattern - 30x faster than fresh setup
setup_test_with_template testing"

# Fallback for special requirements
setup_test_isolated "test-name"

# No tenant setup needed
setup_test_basic "test-name"
```

### Test Development Workflow

```bash
# 1. Start with template (fast)
npm run test:sh spec/32-data-api/create-record.test.sh

# 2. Cleanup when done
npm run test:cleanup

# 3. Debug single test
npm run test:sh spec/32-data-api/create-record.test.sh
```

### Automatic Cleanup

The test system provides automatic cleanup:
- **Deferred cleanup** during test execution
- **Mass cleanup** at end of test suite
- **Connection termination** before database drops
- **Orphaned database** detection and removal

## Performance Benefits

### Speed Comparison

| Method | Time | Relative Speed |
|--------|------|----------------|
| Template Cloning | ~0.1s | **30x faster** |
| Fresh Creation | ~2-3s | Baseline |
| **60 tests total** | **~6s vs ~180s** | **30x improvement** |

### Performance Factors

- **Database size:** Cloning time remains constant regardless of template size
- **PostgreSQL efficiency:** `CREATE DATABASE WITH TEMPLATE` is highly optimized
- **Connection overhead:** Single template connection vs multiple fresh connections
- **Data loading:** Pre-loaded vs runtime data generation

### Memory Efficiency

- **Shared resources:** Templates use PostgreSQL's copy-on-write mechanism
- **Minimal overhead:** Each test database only stores differences
- **Automatic cleanup:** Prevents memory accumulation

## Protection Mechanisms

### Application-Level Protection

**Lock File System:**
```json
{
  "template testing",
  "locked_at": "2024-01-15T10:30:00Z",
  "locked_by": "user@hostname",
  "reason": "Template locked to prevent accidental regeneration",
  "schemas": 2,
  "data_files": 2
}
```

**Runtime Validation:**
- Lock existence check before generation
- Content integrity validation
- Schema consistency verification

### Git-Level Protection

**Skip Worktree:**
```bash
# Check locked files
git ls-files -v | grep ^S

# Files are protected from commits
git status  # Won't show modified data files
```

**Explicit Unlock Required:**
```bash
# Remove git protection
git update-index --no-skip-worktree fixtures/testing/data/*.json

# Make changes
# Re-apply protection
git update-index --skip-worktree fixtures/testing/data/*.json
```

### Template Validation

**Name Format:**
- Must match `^[a-z_]+$` (lowercase + underscores)
- Cannot contain spaces or special characters
- Examples: `basic_large`, `demo_small`, `test_data`

**Content Validation:**
- Schema file existence checks
- JSON syntax validation
- Data structure validation
- Relationship integrity checks


## Best Practices

### Template Selection

**Use Basic Template When:**
- Writing standard integration tests
- Testing CRUD operations
- Validating business logic
- Development and debugging

**Use Basic Large Template When:**
- Testing pagination functionality
- Performance benchmarking
- Load testing queries
- Testing with realistic data volumes

**Use Empty Template When:**
- Creating production tenants
- Testing schema creation
- User onboarding workflows
- Clean slate testing

### Template Maintenance

**Regular Maintenance:**
```bash
# Monthly template health check
npm run fixtures:build basic -- --force
npm run fixtures:build basic_large -- --force

# Verify data integrity
npm run test:sh 03-template-infrastructure/
```

**Lock Management:**
```bash
# Check lock status
ls -la fixtures/testing/.locked

# Review lock content
cat fixtures/testing/.locked

# List git-protected files
git ls-files -v | grep ^S
```

### Performance Optimization

**Template Optimization:**
- Keep template data minimal but representative
- Use appropriate record counts for use case
- Regular cleanup of unused templates
- Monitor cloning performance

**Test Performance:**
```bash
# Time template cloning
time npm run fixtures:build basic

# Monitor database sizes
psql -d monk -c "SELECT datname, pg_size_pretty(pg_database_size(datname)) FROM pg_database WHERE datname LIKE 'monk_template_%'"
```

## Troubleshooting

### Common Issues

**Template Not Found:**
```bash
# Error: Template database 'monk_template_testing' not found
# Solution: Build the template
npm run fixtures:build basic
```

**Permission Denied:**
```bash
# Error: Permission denied to create database
# Solution: Ensure PostgreSQL user has createdb privileges
# Grant permissions in PostgreSQL
```

**Template Locked:**
```bash
# Error: Template 'basic' is locked
# Solution: Remove lock file (if intentional)
rm fixtures/testing/.locked
npm run fixtures:generate basic 10
```

**Git Lock Issues:**
```bash
# Error: Cannot commit modified template data
# Solution: Check git protection
git ls-files -v | grep ^S
# Remove protection if needed
git update-index --no-skip-worktree fixtures/testing/data/*.json
```

### Debug Commands

```bash
# Check template databases
psql -l | grep monk_template

# Verify template content
psql -d monk_template_testing -c "SELECT COUNT(*) FROM accounts"

# Test cloning manually
createdb test_clone -T monk_template_testing

# Check tenant registry
psql -d monk -c "SELECT name, database, tenant_type FROM tenants WHERE tenant_type = 'template'"

# Monitor connections
psql -c "SELECT datname, numbackends FROM pg_stat_database WHERE datname LIKE 'monk_template_%' OR datname LIKE 'tenant_%'"
```

## Advanced Usage

### Custom Data Generation

**Schema-Aware Generation:**
The generation system respects:
- JSON Schema validation rules
- Pattern constraints (phone numbers, emails)
- Enum values and restrictions
- Required field generation
- Relationship integrity

### Template Composition

**Multi-Template Workflows:**
```bash
# Create specialized templates
cp -r fixtures/testing fixtures/api-tests
cp -r fixtures/testing fixtures/performance-tests

# Customize each template
npm run fixtures:generate api-tests 50
npm run fixtures:generate performance-tests 1000

# Build all templates
npm run fixtures:build api-tests
npm run fixtures:build performance-tests
```

### Integration with CI/CD

**GitHub Actions Example:**
```yaml
- name: Setup Test Templates
  run: |
    npm run fixtures:build basic
    npm run fixtures:build basic_large

- name: Run Tests
  run: npm run test:sh

- name: Cleanup
  run: npm run test:cleanup
```

### Monitoring and Metrics

**Performance Monitoring:**
```bash
# Template build time
time npm run fixtures:build basic

# Database size tracking
psql -c "SELECT datname, pg_size_pretty(pg_database_size(datname)) FROM pg_database WHERE datname LIKE 'monk_template_%'"
```

---

## Related Documentation

- **[TEST.md](TEST.md)** - Testing framework and test development
- **[DEVELOPER.md](DEVELOPER.md)** - Development setup and architecture
- **[INSTALL.md](../INSTALL.md)** - Installation and getting started
- **[API Documentation](API.md)** - Complete API reference

## Command Reference

| Command | Description | Example |
|---------|-------------|---------|
| `npm run fixtures:build [template testing` |
| `npm run fixtures:generate <template testing 100` |
| `npm run fixtures:lock <template testing` |
| `npm run fixtures:deploy <template testing` |
| `npm run test:cleanup` | Clean test databases | `npm run test:cleanup` |

**Speed Improvement:** **30x faster** than fresh database creation
**Template Types:** `basic`, `basic_large`, `empty`, custom
**Protection:** Multi-layer lock system prevents accidental changes
**Cloud Ready:** Full Neon integration for serverless deployments

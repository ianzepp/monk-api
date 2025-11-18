# Monk API Fixtures System

> **Template-based database cloning for ultra-fast test setup**

The fixtures system uses PostgreSQL's `CREATE DATABASE WITH TEMPLATE` to clone pre-built databases instantly, achieving **30x faster** setup compared to traditional fresh database creation.

## Quick Start

```bash
# Build standard test template (one-time setup)
npm run fixtures:build testing

# Run tests with template (0.1s vs 2-3s setup per test)
npm run test:sh spec/32-data-api/

# Cleanup test databases when done
npm run test:cleanup
```

## Available Templates

| Template | Records | Data Size | Use Case | Clone Speed |
|----------|---------|-----------|----------|-------------|
| `testing` | 5 each | ~2.7KB | Standard tests, development | ~0.1s |
| `testing_xl` | 100+ each | ~6.3KB | Performance tests, pagination | ~0.1s |
| `empty` | 0 | Minimal | Production tenants, clean slate | ~0.05s |

**Template Contents:** Each template includes `accounts` and `contacts` schemas with pre-defined relationships.

## Command Reference

### Build Templates
```bash
# Build testing template (most common)
npm run fixtures:build testing

# Build with force (rebuild existing)
npm run fixtures:build -- --force testing_xl

# Build all templates
npm run fixtures:build testing
npm run fixtures:build testing_xl
npm run fixtures:build empty
```

### Generate Custom Data
```bash
# Generate 100 records for custom template
npm run fixtures:generate my-template 100

# Generate large dataset for performance testing
npm run fixtures:generate testing_xl 1000
```

### Lock/Protect Templates
```bash
# Lock template to prevent regeneration
npm run fixtures:lock testing

# Template shows lock error if generation attempted
# Protects stable test data from accidental changes
```

### Deploy to Neon Cloud
```bash
# Deploy template to Neon cloud (requires NEON_DATABASE_URL)
npm run fixtures:deploy testing

# Force deploy (overwrite existing)
npm run fixtures:deploy testing --force
```

### Cleanup Test Databases
```bash
# Remove all test databases (tenant_test_*)
npm run test:cleanup

# Automatic cleanup runs after test suites
```

## Test Integration

### Using Templates in Tests

Templates are 30x faster than fresh database creation:

```bash
# In your test file (spec/*.test.sh)
setup_test_with_template "my-test" "testing"  # Fast: ~0.1s
setup_test_isolated "my-test"                 # Slow: ~2-3s
```

**Best Practice:** Always use `setup_test_with_template` unless you need a completely custom schema.

### Test Development Workflow

```bash
# 1. Ensure template exists
npm run fixtures:build testing

# 2. Run single test
npm run test:sh spec/32-data-api/create-record.test.sh

# 3. Run test suite
npm run test:sh spec/32-data-api/

# 4. Cleanup (or let automatic cleanup handle it)
npm run test:cleanup
```

## Performance Impact

**30x speed improvement** across test suites:

| Metric | Traditional | Templates | Improvement |
|--------|-------------|-----------|-------------|
| Setup time per test | 2-3s | ~0.1s | **30x faster** |
| 60 test suite | ~180s (3 min) | ~6s | **30x faster** |
| Daily dev cycle (100 runs) | 5 hours | 10 minutes | **Save 4.8 hours/day** |

**Why so fast?**
- PostgreSQL's `CREATE DATABASE WITH TEMPLATE` uses copy-on-write
- Cloning time constant regardless of template size
- No schema creation, validation, or data generation overhead

## Creating Custom Templates

```bash
# 1. Copy existing template structure
cp -r fixtures/testing fixtures/my-custom

# 2. Remove lock to allow generation
rm fixtures/my-custom/.locked

# 3. Customize schemas (optional)
# Edit fixtures/my-custom/describe/*.json

# 4. Generate custom data
npm run fixtures:generate my-custom 50

# 5. Build template database
npm run fixtures:build my-custom

# 6. Lock for protection (recommended)
npm run fixtures:lock my-custom
```

## Template Protection

Templates use multi-layer protection to prevent accidental changes:

### Application Lock
- **`.locked` file** prevents regeneration
- Contains metadata: locked_at, locked_by, reason
- Must be manually removed to regenerate

### Git Protection
```bash
# Check git-protected files
git ls-files -v | grep ^S

# Protected files won't show in git status
# Prevents accidental commits of generated data
```

### Emergency Unlock
```bash
# Remove application lock
rm fixtures/testing/.locked

# Remove git protection
git update-index --no-skip-worktree fixtures/testing/data/*.json

# Make changes
npm run fixtures:generate testing 10

# Re-lock (recommended)
npm run fixtures:lock testing
git update-index --skip-worktree fixtures/testing/data/*.json
```

## Troubleshooting

### Template Not Found
```bash
# Error: Template database 'monk_template_testing' not found
# Solution: Build the template
npm run fixtures:build testing
```

### Template Locked
```bash
# Error: Template 'testing' is locked
# Solution: Remove lock file (if intentional)
rm fixtures/testing/.locked
npm run fixtures:generate testing 10
```

### Verify Template Status
```bash
# Check template databases exist
psql -l | grep monk_template

# Verify template content
psql -d monk_template_testing -c "SELECT COUNT(*) FROM accounts"

# Check tenant registry
psql -d monk -c "SELECT name, database, tenant_type FROM tenants WHERE tenant_type = 'template'"
```

## Architecture

### Database Structure
- **Template DBs:** `monk_template_testing`, `monk_template_testing_xl`, `monk_template_empty`
- **Test DBs:** `tenant_test_*` (auto-created, auto-cleaned)
- **Registry:** Templates registered in `monk.tenants` with `tenant_type='template'`

### Directory Structure
```
fixtures/
├── testing/              # Protected template (5 records)
│   ├── describe/        # JSON schema definitions
│   ├── data/            # Pre-generated test data
│   └── .locked          # Protection lock file
├── testing_xl/          # Large template (100+ records)
└── empty/               # Minimal template
```

## Complete Documentation

📖 **[Full Fixtures Guide](../docs/FIXTURES.md)** - Comprehensive documentation including:
- Detailed architecture
- Template validation rules
- Advanced data generation
- CI/CD integration
- Performance optimization
- Best practices

## Next Steps

1. **Build your first template:** `npm run fixtures:build testing`
2. **Run a test suite:** `npm run test:sh spec/32-data-api/`
3. **Create custom templates** for your specific test scenarios
4. **Read the [complete documentation](../docs/FIXTURES.md)** for advanced usage

---

**💡 Pro Tip:** The 30x speed improvement compounds significantly across development cycles. A team running tests 100 times daily saves ~4.8 hours of waiting time.

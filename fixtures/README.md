# Monk API Fixtures System

> **Template-based database cloning for ultra-fast test setup**

The fixtures system provides pre-built database templates that can be cloned instantly for testing, achieving **30x faster** setup compared to traditional fresh database creation.

## Quick Start

```bash
# Build standard test template
npm run fixtures:build basic

# Run tests with template (0.1s vs 2-3s setup)
npm run test:sh spec/32-data-api/

# Cleanup when done
npm run test:cleanup
```

## Available Templates

| Template | Records | Use Case | Speed |
|----------|---------|----------|-------|
| `basic` | 5 each | Standard tests | ~0.1s |
| `basic_large` | 100+ each | Performance tests | ~0.1s |
| `empty` | 0 | Production setup | ~0.05s |

## Key Commands

```bash
npm run fixtures:build [template]     # Build template database
npm run fixtures:generate <t> <n>   # Generate test data
npm run fixtures:lock <template>    # Lock template
npm run fixtures:deploy <template>  # Deploy to Neon
```

## Performance Impact

**30x speed improvement** - Template cloning reduces test setup from 2-3 seconds to ~0.1 seconds per test.

For a test suite with 60 tests:
- **Traditional:** ~180 seconds (3 minutes)
- **Templates:** ~6 seconds
- **Time saved:** ~3 minutes per test run

## Documentation

📖 **[Complete Fixtures Documentation](../docs/FIXTURES.md)** - Comprehensive guide to the fixtures system

## Template Protection

Templates are protected by:
- **`.locked` files** - Prevent accidental regeneration
- **Git protection** - `--skip-worktree` prevents commits
- **Name validation** - Enforces format standards

## Next Steps

1. **Read the [complete documentation](../docs/FIXTURES.md)**
2. **Try building your first template testing`
3. **Run tests with templates:** `npm run test:sh 10`
4. **Create custom templates** for your specific needs

---

**💡 Pro Tip:** Always use templates for tests when possible. The 30x speed improvement compounds significantly across large test suites.

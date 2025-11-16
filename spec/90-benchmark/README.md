# Performance Benchmarks

Performance benchmarks for Monk API operations.

## Usage

Run individual benchmarks:
```bash
./spec/90-benchmark/data-api.test.sh
./spec/90-benchmark/describe-api.test.sh
```

Run all benchmarks:
```bash
npm run test:sh 90-benchmark
```

## Benchmarks

### Data API (`data-api.test.sh`)
Tests CRUD operations on existing schemas (minimal observer overhead):
- **Single record creation** - Baseline performance, typical CRUD overhead
- **Bulk record creation** - Amortized cost when creating multiple records
- **Record retrieval** - Read operations (no observer pipeline)
- **Record updates** - Similar overhead to creates

**Expected Performance:**
- Single creates: ~15-40ms (observer pipeline + database)
- Reads: ~5-15ms (no observers, just database)
- Bulk creates: ~10-20ms per record (amortized)

### Describe API (`describe-api.test.sh`)
Tests schema operations with full validation pipeline:
- **Simple schema creation** - 2 columns, basic validation
- **Complex schema creation** - 10 columns with constraints/relationships
- **Column additions** - ALTER TABLE operations
- **Schema retrieval** - Cached reads

**Expected Performance:**
- Simple schema: ~50-150ms (validation + DDL + metadata)
- Complex schema: ~100-300ms (10 columns with full validation)
- Column addition: ~30-80ms (ALTER TABLE + validation)
- Schema reads: ~5-15ms (cached)

## Performance Considerations

**Observer Pipeline Overhead:**
- Ring 1: Input validation (~2-5ms)
- Ring 2: Business logic checks (~5-15ms for DB lookups)
- Ring 5: Database writes (~5-20ms)
- Ring 6: DDL execution (~20-50ms for schema changes)
- Ring 7-8: Async operations (~2-5ms)

**Optimization Tips:**
- Use bulk operations when creating multiple records
- Schema operations are expensive - cache schema definitions
- Read operations bypass most observer overhead
- Connection pooling helps with concurrent requests

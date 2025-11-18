# Import Test Fixture

Test fixture for validating JSON-based data import through the Data API.

## Purpose

This fixture serves to validate that fixture data can be loaded through the Monk Data API with full observer pipeline validation, as opposed to raw SQL INSERT statements that bypass validation.

## Features

- **Dual Loading Methods**: Supports both SQL and JSON-based data loading
- **Comprehensive Validation**: Tests various column types and validation rules
- **API Integration**: Uses real authentication and API calls
- **Observer Pipeline**: All data goes through full validation stack

## Schema: `records`

Test schema with diverse column types:

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `name` | text | required, 2-100 chars | Record name |
| `email` | text | required, pattern | Email address |
| `age` | integer | optional, 0-150 | Age in years |
| `balance` | numeric | optional, >= 0, default 0.00 | Account balance |
| `is_active` | boolean | optional, default true | Active status |
| `status` | text | optional, enum, default 'pending' | Record status (pending/active/inactive/archived) |
| `metadata` | jsonb | optional | Flexible metadata |
| `tags` | text[] | optional | Array of tags |
| `created_date` | timestamp | optional | Custom creation timestamp |

## Data Records

5 test records with varying data:

1. **Alice Johnson** - Active engineering record with full metadata
2. **Bob Smith** - Active sales record with territory info
3. **Carol Davis** - Pending marketing record (minimal data)
4. **David Wilson** - Active VP with team size metadata
5. **Eve Martinez** - Inactive operations record

## Usage

### Build with SQL (default)
```bash
npm run fixtures:build -- import_test
```

### Build with JSON (via Data API)
```bash
npm run fixtures:build -- --with-json import_test
```

### Force Rebuild
```bash
npm run fixtures:build -- --force --with-json import_test
```

## Validation Tests

This fixture validates:

- ✅ Required field enforcement (name, email)
- ✅ Pattern validation (email format)
- ✅ Range validation (age 0-150, balance >= 0)
- ✅ Length validation (name 2-100 chars)
- ✅ Enum validation (status values)
- ✅ Default values (is_active, status, balance)
- ✅ JSONB storage and retrieval
- ✅ Array field handling
- ✅ Null value handling (age, metadata)
- ✅ Timestamp parsing

## Expected Results

Both SQL and JSON loading methods should produce identical databases with:
- 1 schema (`records`)
- 5 records
- All validation rules enforced
- All field types correctly stored

## Differences Between Methods

### SQL Loading (--with-sql)
- Direct PostgreSQL INSERT statements
- Bypasses observer pipeline
- Faster execution
- **Risk**: Can insert invalid data

### JSON Loading (--with-json)
- HTTP POST to `/api/data/records`
- Full observer pipeline validation
- JWT authentication required
- **Benefit**: Guaranteed valid data

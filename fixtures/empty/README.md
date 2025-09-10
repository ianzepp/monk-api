# Empty Fixtures Template

This template creates a production-ready tenant database with core schema tables but **no sample data**.

## Purpose

Perfect for production tenants who want to start with a clean, empty database containing only the required infrastructure tables.

## Contents

### Schemas (0 files)
- No schema definitions - tenants will create their own schemas via the API

### Data (0 files)
- No sample data - completely clean slate for production use

## Core Tables Created

When this template is built, it creates only the essential infrastructure tables via `sql/init-tenant.sql`:

- **`schemas`** - Schema registry (empty)
- **`columns`** - Column registry (empty)
- **`users`** - User accounts (contains only root user)
- **`pings`** - Health check table (empty)

## Usage

```bash
# Build empty template locally
npm run fixtures:build empty

# Deploy to Neon
npm run fixtures:deploy empty --progress

# Use for production tenant creation
# (tenant gets clean database with core infrastructure)
```

## Comparison with Other Templates

| Template | Schemas | Sample Data | Use Case |
|----------|---------|-------------|----------|
| `empty` | 0 | None | Production tenants |
| `basic` | 2 | ~10 records | Development/demos |
| `basic_large` | 2 | ~2000 records | Performance testing |

## Production Benefits

- **Clean Start**: No sample data to clean up
- **Minimal Size**: Smallest possible tenant database
- **Security**: No demo credentials or test data
- **Performance**: Fastest database creation and branching

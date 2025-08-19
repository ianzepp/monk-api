# PaaS Backend CLI Documentation

The `./monk` CLI provides programmatic access to the PaaS backend APIs with enterprise-grade automation capabilities.

## Quick Start

```bash
# Start development server
npm run dev

# Schema operations (YAML-only)
cat src/metadata/account.yaml | ./monk meta create schema
./monk meta list schema -e name
cat updated-schema.yaml | ./monk meta update schema account

# Data operations (JSON via STDIN)
echo '{"namespace":"test","name":"John"}' | ./monk data create account
./monk data list account -c
./monk data get account <id> -f name
```

## CLI Modules

### Data Module (`./monk data`)

**Operations:**
- `list <schema>` - List all records for schema
- `get <schema> <id>` - Get specific record  
- `create <schema>` - Create new record from STDIN
- `update <schema> <id>` - Update record from STDIN
- `delete <schema> <id>` - Delete record
- `export <schema> <directory>` - Export all records as individual JSON files
- `import <schema> <directory>` - Import JSON files for bulk operations

**Flags:**
- `-l LIMIT` - Query limit for list operations (default: 50)
- `-u URL` - Base URL for API (default: http://localhost:3001)  
- `-v` - Verbose output with human-friendly messages
- `-x` - Exit code only mode (no JSON output, just exit status)
- `-f FIELD` - Extract field value from response (e.g., -f id, -f name)
- `-c` - Count mode (return just count for list operations)

**Examples:**
```bash
# Basic operations
./monk data list account
./monk data get account 550e8400-e29b-41d4-a716-446655440000

# Programmatic patterns
ID=$(echo '{"name":"Test","namespace":"demo"}' | ./monk data create account -f id)
COUNT=$(./monk data list account -c)
if ./monk data delete account "$ID" -x; then echo "Deleted"; fi

# Validation testing
if echo '{"invalid":"data"}' | ./monk data create account -x; then
    echo "Should not happen"
else
    echo "Validation correctly rejected"
fi

# Bulk operations
./monk data export account ./backups/
./monk data import account ./backups/
```

### Meta Module (`./monk meta`)

**Operations:**
- `list <type>` - List metadata objects
- `get <type> <name>` - Get specific metadata object
- `create <type>` - Create new metadata object from STDIN (YAML)
- `update <type> <name>` - Update existing metadata object from STDIN (YAML)
- `delete <type> <name>` - Delete metadata object

**Types:**
- `schema` - Schema definitions in YAML format

**Flags:**
- `-e FIELD` - Extract field values from results (e.g., -e name, -e id)
- `-f FIELD` - Alias for -e (extract field)
- `-u URL` - Base URL for API (default: http://localhost:3001)
- `-v` - Verbose output with human-friendly messages
- `-x` - Exit code only mode
- `-c` - Count mode for list operations

**Examples:**
```bash
# Schema management
./monk meta list schema
./monk meta list schema -e name                    # Just names
SCHEMA_COUNT=$(./monk meta list schema -c)         # Just count

# Schema evolution (non-destructive)
cat account-v1.yaml | ./monk meta create schema
cat account-v2.yaml | ./monk meta update schema account  # Preserves data!

# Dependency management
./monk meta delete schema parent    # Fails if children exist
./monk meta delete schema child     # Must delete children first
./monk meta delete schema parent    # Then parent succeeds
```

## Advanced Features

### Test-Optimized Interface

The CLI is designed for shell scripting and test automation:

```bash
# Exit code testing (perfect for if statements)
if ./monk data create account -x; then
    echo "Creation succeeded"
fi

# Field extraction (perfect for variable assignment)  
ID=$(./monk data create account -f id)
NAME=$(./monk data get account "$ID" -f name)

# Count operations (perfect for validation)
INITIAL_COUNT=$(./monk data list account -c)
# ... operations ...
FINAL_COUNT=$(./monk data list account -c)
[ "$FINAL_COUNT" -eq $((INITIAL_COUNT + 1)) ] || exit 1
```

### Error Handling

**Structured Error Responses:**
```json
{
  "error": "Validation failed",
  "error_code": "VALIDATION_ERROR",
  "data": {
    "validation_errors": [
      {"code": "too_small", "minimum": 3, "path": ["name"]},
      {"code": "invalid_format", "pattern": "/^[A-Z]+$/", "path": ["sku"]}
    ]
  }
}
```

**Dependency Errors:**
```json
{
  "error": "Cannot delete schema 'parent' - referenced by: child1, child2",
  "error_code": "DEPENDENCY_ERROR", 
  "data": {"dependencies": ["child1", "child2"]}
}
```

## Output Modes

**Default (Programmatic):**
```bash
./monk data list account
# {"data":[{"id":"...","name":"..."}],"success":true}
```

**Field Extraction:**
```bash
./monk data create account -f id
# 550e8400-e29b-41d4-a716-446655440000
```

**Count Mode:**
```bash
./monk data list account -c  
# 5
```

**Exit Code Only:**
```bash
./monk data create account -x
# (no output, exit code 0=success, 1=failure)
```

**Human-Friendly (Verbose):**
```bash
./monk data create account -v
# → Creating new account record
# ✓ Success (201)
# {"data":...}
```

**Pretty Formatting:**
```bash
./monk data list account | jq .
# {
#   "data": [
#     {
#       "id": "...",
#       "name": "..."
#     }
#   ]
# }
```

## Environment Variables

- `CLI_BASE_URL` - API base URL (default: http://localhost:3001)
- `CLI_LIMIT` - Default query limit (default: 50)

## Dependencies

- **curl** - HTTP requests
- **jshon** - JSON parsing for field extraction and count operations
- **jq** - Optional for pretty JSON formatting

---

The CLI provides a **programmatic-first interface** optimized for automation, testing, and shell scripting while maintaining human-friendly modes when needed.
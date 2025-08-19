# Monk CLI

Command-line interface for PaaS backend operations. Provides programmatic access to data and schema management APIs.

## Installation

```bash
# Install globally
npm install -g .

# Or use directly
./monk --help
```

## Usage

```bash
# Data operations
monk data list account
monk data get account <id>
echo '{"name":"Test"}' | monk data create account
echo '{"name":"Updated"}' | monk data update account <id>
monk data delete account <id>

# Schema operations  
monk meta list schema
monk meta get schema account
cat schema.yaml | monk meta create schema
cat updated-schema.yaml | monk meta update schema account
monk meta delete schema account

# Advanced search operations
echo '{"where": {"status": "active"}}' | monk find user
echo '{"select": ["name"], "where": {"age": {"$gte": 18}}}' | monk find user
monk find user --head < query.json    # Get first record
monk find user --tail < query.json    # Get last record
```

## Configuration

Set the target API server:

```bash
export CLI_BASE_URL=https://api.example.com
# or
export CLI_BASE_URL=http://localhost:3000
```

## Programmatic Mode

All commands output raw JSON for programmatic use:

```bash
# Exit codes: 0 = success, 1 = error
monk data create account -x

# Extract specific fields
monk data get account <id> -f name

# Count records
monk data list account -c

# Convenience flags for find operations
monk find user --head < query.json     # First record only
monk find user --tail < query.json     # Last record only
monk find user -H < query.json         # Short form of --head
monk find user -T < query.json         # Short form of --tail
```

## Features

- **Pure shell scripts**: No Node.js runtime dependencies
- **JSON output**: Perfect for automation and scripting
- **Exit codes**: Proper success/failure handling
- **Field extraction**: Direct access to response data
- **HTTP configurable**: Works with any PaaS backend instance
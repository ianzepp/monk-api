# PUT /api/describe/:schema/:column

Update an existing column's properties. Supports both metadata-only updates (fast) and structural changes that trigger ALTER TABLE (slower).

## Path Parameters

- `:schema` - Schema name (required)
- `:column` - Column name (required)

## Query Parameters

None

## Request Body

```json
{
  "pattern": "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$",
  "description": "Updated email validation pattern",
  "index": true
}
```

### Metadata-Only Updates (Fast)
These fields update only the columns table metadata:
- **description** - Human-readable description
- **pattern** - Regular expression validation
- **minimum** - Minimum value constraint
- **maximum** - Maximum value constraint
- **enum_values** - Allowed values
- **immutable** - Write-once protection
- **sudo** - Sudo requirement for this field
- **tracked** - Change tracking
- **transform** - Data transformation
- Relationship fields (relationship_type, related_schema, etc.)

### Structural Updates (ALTER TABLE)
These fields trigger PostgreSQL ALTER TABLE:
- **type** - Change column data type
- **required** - Add/remove NOT NULL constraint
- **default_value** - Add/change DEFAULT constraint
- **unique** - Add/remove UNIQUE constraint
- **index** - Add/remove index
- **searchable** - Add/remove full-text search index

## Success Response (200)

```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "schema_name": "users",
    "column_name": "email",
    "type": "text",
    "required": true,
    "pattern": "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$",
    "description": "Updated email validation pattern",
    "index": true,
    "updated_at": "2024-01-15T12:45:00Z"
  }
}
```

## Error Responses

| Status | Error Code | Message | Condition |
|--------|------------|---------|-----------|
| 400 | `NO_UPDATES` | "No valid fields to update" | Empty request body |
| 400 | `INVALID_TYPE` | "Invalid column type" | Unsupported data type |
| 401 | `AUTH_TOKEN_REQUIRED` | "Authorization token required" | No Bearer token |
| 403 | `SCHEMA_PROTECTED` | "Schema is protected" | System schema |
| 404 | `SCHEMA_NOT_FOUND` | "Schema not found" | Invalid schema |
| 404 | `COLUMN_NOT_FOUND` | "Column not found" | Invalid column |

## Example Usage

### Update Description (Metadata Only)

```bash
curl -X PUT http://localhost:9001/api/describe/users/email \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Primary email address for account"
  }'
```

### Update Validation Pattern

```bash
curl -X PUT http://localhost:9001/api/describe/users/email \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "pattern": "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$"
  }'
```

### Make Column Required (ALTER TABLE)

```bash
curl -X PUT http://localhost:9001/api/describe/users/name \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "required": true
  }'
```

### Add Index (ALTER TABLE)

```bash
curl -X PUT http://localhost:9001/api/describe/users/email \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "index": true
  }'
```

### Enable Full-Text Search (ALTER TABLE)

```bash
curl -X PUT http://localhost:9001/api/describe/articles/content \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "searchable": true
  }'
```

### Change Data Type (ALTER TABLE)

```bash
# Convert integer to text
curl -X PUT http://localhost:9001/api/describe/products/code \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "text"
  }'
```

## Use Cases

### Improve Validation Rules

```javascript
// Tighten email validation
async function improveEmailValidation() {
  await fetch('/api/describe/users/email', {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
      description': 'Email address with strict validation'
    })
  });
}
```

### Add Performance Index

```javascript
// Add index to frequently queried column
async function optimizeQuery(schemaName, columnName) {
  const response = await fetch(`/api/describe/${schemaName}/${columnName}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ index: true })
  });

  console.log(`Index added to ${schemaName}.${columnName}`);
}
```

### Enable Change Tracking

```javascript
// Enable audit trail for sensitive field
async function enableAudit(schemaName, columnName) {
  await fetch(`/api/describe/${schemaName}/${columnName}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      tracked: true,
      description: 'Tracked for audit compliance'
    })
  });
}
```

### Make Field Immutable

```javascript
// Protect field from future changes
async function lockField(schemaName, columnName) {
  await fetch(`/api/describe/${schemaName}/${columnName}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      immutable: true,
      description: 'Immutable transaction ID'
    })
  });
}
```

## Metadata vs Structural Updates

### Metadata Updates (Fast, No Table Lock)
- Updates only the `columns` table
- No ALTER TABLE required
- Immediate effect
- No table locking
- Examples: description, pattern, enum_values

### Structural Updates (Slower, Table Lock)
- Updates `columns` table AND PostgreSQL table
- Requires ALTER TABLE
- May take time on large tables
- Brief table lock during operation
- Examples: type, required, index

## Type Conversion

When changing `type`, PostgreSQL attempts automatic conversion:

**Safe conversions:**
- `integer` → `text` (always works)
- `text` → `integer` (if all values are numeric)
- `decimal` → `integer` (truncates decimals)

**Risky conversions:**
- `text` → `uuid` (fails if non-UUID values exist)
- `integer` → `boolean` (PostgreSQL rules apply)

**Best practice:** Test type changes on a copy first.

## Adding/Removing Constraints

### Making Required
```json
{"required": true}
```
**Effect:** Adds NOT NULL constraint. Fails if NULL values exist.

### Making Unique
```json
{"unique": true}
```
**Effect:** Creates UNIQUE index. Fails if duplicate values exist.

### Removing Constraints
```json
{"required": false}
```
**Effect:** Drops NOT NULL constraint.

## Index Management

### Adding Standard Index
```json
{"index": true}
```
Creates: `CREATE INDEX idx_{schema}_{column} ON {schema}({column});`

### Adding Full-Text Index
```json
{"searchable": true}
```
Creates: `CREATE INDEX idx_{schema}_{column}_fts ON {schema} USING gin(to_tsvector('english', {column}));`

### Removing Index
```json
{"index": false}
```
Drops the index.

## Performance Considerations

- **Metadata updates**: Fast (< 10ms)
- **Structural updates**: Depends on table size
- Large tables: Consider maintenance windows for ALTER TABLE
- Adding indexes: Can be slow on large tables
- Type conversions: May require table scan

## Validation

Updates are validated for:
- Column exists and is accessible
- User has permission to modify
- Type is valid (if changing type)
- Structural changes are possible (e.g., no NULLs when adding NOT NULL)

## Related Endpoints

- [`GET /api/describe/:schema/:column`](GET.md) - Get column definition
- [`POST /api/describe/:schema/:column`](POST.md) - Create new column
- [`DELETE /api/describe/:schema/:column`](DELETE.md) - Delete column
- [`PUT /api/describe/:schema`](../:schema/PUT.md) - Update schema metadata

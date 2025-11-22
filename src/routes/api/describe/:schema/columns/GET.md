# GET /api/describe/:schema/columns

List all columns for a schema. Returns an array of column definitions including metadata, constraints, and configuration.

## Path Parameters

- `:schema` - Schema name (required)

## Query Parameters

None

## Request Body

None - GET request with no body.

## Success Response (200)

```json
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "schema_name": "users",
      "column_name": "email",
      "type": "text",
      "required": true,
      "unique": true,
      "pattern": "^[^@]+@[^@]+\\.[^@]+$",
      "index": true,
      "description": "User email address",
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:30:00Z"
    },
    {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "schema_name": "users",
      "column_name": "name",
      "type": "text",
      "required": true,
      "description": "User full name",
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### Response Fields

Each column object contains:

- **id** - Column record UUID
- **schema_name** - Name of the schema
- **column_name** - Name of the column
- **type** - Data type (text, integer, decimal, boolean, timestamp, etc.)
- **required** - Whether column is required (NOT NULL)
- **unique** - Whether column values must be unique
- **default_value** - Default value for the column
- **minimum** - Minimum value for numeric types
- **maximum** - Maximum value for numeric types or max length for text
- **pattern** - Regular expression pattern for text validation
- **enum_values** - Array of allowed values
- **description** - Human-readable description
- **immutable** - Whether value can be set once but never changed
- **sudo** - Whether sudo token required to modify
- **index** - Whether column has standard btree index
- **searchable** - Whether full-text search is enabled
- **tracked** - Whether changes are tracked in history
- **transform** - Auto-transform values (lowercase, uppercase, trim, etc.)
- **relationship_type** - Type of relationship (owned, referenced)
- **related_schema** - Target schema for relationships
- **related_column** - Target column for relationships
- **relationship_name** - Name of the relationship for API access
- **cascade_delete** - Whether to cascade delete
- **required_relationship** - Whether relationship is required
- **created_at** - Timestamp when column was created
- **updated_at** - Timestamp when column was last modified

## Error Responses

| Status | Error Code | Message | Condition |
|--------|------------|---------|-----------|
| 401 | `AUTH_TOKEN_REQUIRED` | "Authorization token required" | No Bearer token in Authorization header |
| 401 | `AUTH_TOKEN_INVALID` | "Invalid token" | Token malformed or bad signature |
| 401 | `AUTH_TOKEN_EXPIRED` | "Token has expired" | Token well-formed but past expiration |
| 404 | `SCHEMA_NOT_FOUND` | "Schema not found" | Invalid schema name |

## Example Usage

### List All Columns

```bash
curl -X GET http://localhost:9001/api/describe/users/columns \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "schema_name": "users",
      "column_name": "email",
      "type": "text",
      "required": true,
      "unique": true,
      "pattern": "^[^@]+@[^@]+\\.[^@]+$",
      "index": true,
      "description": "User email address",
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:30:00Z"
    },
    {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "schema_name": "users",
      "column_name": "name",
      "type": "text",
      "required": true,
      "description": "User full name",
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### Using in JavaScript

```javascript
async function listColumns(schemaName) {
  const response = await fetch(`/api/describe/${schemaName}/columns`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  const { data: columns } = await response.json();
  return columns;
}

// Get all required columns
async function getRequiredColumns(schemaName) {
  const columns = await listColumns(schemaName);
  return columns.filter(col => col.required);
}

// Get all indexed columns
async function getIndexedColumns(schemaName) {
  const columns = await listColumns(schemaName);
  return columns.filter(col => col.index || col.unique || col.searchable);
}
```

## Use Cases

### Schema Documentation Generator

```javascript
// Generate documentation for a schema
async function generateSchemaDoc(schemaName) {
  const columns = await listColumns(schemaName);

  const doc = columns.map(col => {
    const constraints = [];
    if (col.required) constraints.push('required');
    if (col.unique) constraints.push('unique');
    if (col.immutable) constraints.push('immutable');

    return `- **${col.column_name}** (${col.type})${constraints.length ? ' [' + constraints.join(', ') + ']' : ''}: ${col.description || 'No description'}`;
  }).join('\n');

  return doc;
}
```

### Validation Schema Builder

```javascript
// Build client-side validation from column metadata
async function buildValidationSchema(schemaName) {
  const columns = await listColumns(schemaName);

  const schema = {};

  for (const col of columns) {
    schema[col.column_name] = {
      type: col.type,
      required: col.required,
      unique: col.unique,
      pattern: col.pattern,
      min: col.minimum,
      max: col.maximum,
      enum: col.enum_values
    };
  }

  return schema;
}
```

### Migration Checker

```javascript
// Compare columns between environments
async function compareSchemaColumns(schemaName, env1, env2) {
  const cols1 = await fetchColumns(env1, schemaName);
  const cols2 = await fetchColumns(env2, schemaName);

  const names1 = cols1.map(c => c.column_name);
  const names2 = cols2.map(c => c.column_name);

  const onlyIn1 = names1.filter(n => !names2.includes(n));
  const onlyIn2 = names2.filter(n => !names1.includes(n));

  return {
    missing_in_env2: onlyIn1,
    missing_in_env1: onlyIn2,
    common: names1.filter(n => names2.includes(n))
  };
}
```

## Column Ordering

Columns are returned sorted by `column_name` in ascending order. This ensures consistent ordering across requests and environments.

## System Columns

System-managed columns (id, timestamps, access_*) are not returned by this endpoint. This endpoint only returns user-defined columns from the schema definition.

## Performance Considerations

- Results are fetched directly from the `columns` table
- Fast response time (typically < 20ms for schemas with < 100 columns)
- No joins or complex queries required
- Safe for frequent polling

## Related Endpoints

- [`GET /api/describe/:schema`](../GET.md) - Get schema metadata
- [`GET /api/describe/:schema/columns/:column`](:column/GET.md) - Get individual column
- [`POST /api/describe/:schema/columns/:column`](:column/POST.md) - Add new column
- [`PUT /api/describe/:schema/columns/:column`](:column/PUT.md) - Update column
- [`DELETE /api/describe/:schema/columns/:column`](:column/DELETE.md) - Remove column

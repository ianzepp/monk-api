# GET /api/describe/:schema/columns/:column

Retrieve a specific column definition including type, constraints, validation rules, and metadata. This endpoint returns the complete column configuration from the columns table.

## Path Parameters

- `:schema` - Schema name (required)
- `:column` - Column name (required)

## Query Parameters

None

## Request Body

None - GET request with no body.

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
    "unique": true,
    "pattern": "^[^@]+@[^@]+\\.[^@]+$",
    "description": "User email address",
    "index": true,
    "immutable": false,
    "sudo": false,
    "tracked": false,
    "searchable": false,
    "transform": null,
    "created_at": "2024-01-15T10:30:00Z",
    "updated_at": "2024-01-15T10:30:00Z"
  }
}
```

### Response Fields

#### Identity
- **id** - Column record UUID
- **schema_name** - Name of the schema
- **column_name** - Name of the column
- **type** - Data type (text, integer, decimal, boolean, timestamp, date, uuid, jsonb, or array types)

#### Constraints
- **required** - Whether column is required (NOT NULL)
- **default_value** - Default value for the column
- **unique** - Whether values must be unique

#### Validation
- **minimum** - Minimum value for numeric types
- **maximum** - Maximum value for numeric types or max length for text
- **pattern** - Regular expression pattern for text validation
- **enum_values** - Array of allowed values

#### Metadata
- **description** - Human-readable description of the column's purpose

#### Protection
- **immutable** - Value can be set once but never changed
- **sudo** - Require sudo token to modify this field

#### Indexing & Search
- **index** - Whether standard btree index is created
- **searchable** - Whether full-text search with GIN index is enabled

#### Change Tracking
- **tracked** - Whether changes are tracked in history table

#### Data Transform
- **transform** - Auto-transform values (lowercase, uppercase, trim, etc.)

#### Relationships
- **relationship_type** - Type of relationship (owned or referenced)
- **related_schema** - Target schema for relationship
- **related_column** - Target column for relationship
- **relationship_name** - Name of the relationship for API access
- **cascade_delete** - Whether to cascade delete when parent is deleted
- **required_relationship** - Whether relationship is required (NOT NULL FK)

## Error Responses

| Status | Error Code | Message | Condition |
|--------|------------|---------|-----------|
| 401 | `AUTH_TOKEN_REQUIRED` | "Authorization token required" | No Bearer token in Authorization header |
| 401 | `AUTH_TOKEN_INVALID` | "Invalid token" | Token malformed or bad signature |
| 401 | `AUTH_TOKEN_EXPIRED` | "Token has expired" | Token well-formed but past expiration |
| 404 | `SCHEMA_NOT_FOUND` | "Schema not found" | Invalid schema name |
| 404 | `COLUMN_NOT_FOUND` | "Column not found in schema" | Column doesn't exist |

## Example Usage

### Get Column Definition

```bash
curl -X GET http://localhost:9001/api/describe/users/email \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "schema_name": "users",
    "column_name": "email",
    "type": "text",
    "required": true,
    "unique": true,
    "pattern": "^[^@]+@[^@]+\\.[^@]+$",
    "description": "User email address",
    "index": true,
    "created_at": "2024-01-15T10:30:00Z",
    "updated_at": "2024-01-15T10:30:00Z"
  }
}
```

### Using in JavaScript

```javascript
async function getColumn(schemaName, columnName) {
  const response = await fetch(`/api/describe/${schemaName}/${columnName}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  const { data: column } = await response.json();
  return column;
}

// Check if column is required
async function isRequired(schemaName, columnName) {
  const column = await getColumn(schemaName, columnName);
  return column.required === true;
}

// Get validation pattern
async function getValidationPattern(schemaName, columnName) {
  const column = await getColumn(schemaName, columnName);
  return column.pattern;
}
```

## Use Cases

### Form Validation

```javascript
// Build client-side validation from column definition
async function buildFormValidation(schemaName) {
  const columns = await getAllColumns(schemaName);
  const validation = {};

  for (const column of columns) {
    validation[column.column_name] = {
      required: column.required,
      pattern: column.pattern,
      min: column.minimum,
      max: column.maximum,
      enum: column.enum_values
    };
  }

  return validation;
}
```

### Schema Documentation

```javascript
// Generate documentation from column metadata
async function documentColumn(schemaName, columnName) {
  const column = await getColumn(schemaName, columnName);

  return `
    ### ${column.column_name}
    ${column.description || 'No description'}

    - **Type:** ${column.type}
    - **Required:** ${column.required ? 'Yes' : 'No'}
    - **Unique:** ${column.unique ? 'Yes' : 'No'}
    ${column.pattern ? `- **Pattern:** \`${column.pattern}\`` : ''}
    ${column.minimum ? `- **Minimum:** ${column.minimum}` : ''}
    ${column.maximum ? `- **Maximum:** ${column.maximum}` : ''}
    ${column.enum_values ? `- **Allowed values:** ${column.enum_values.join(', ')}` : ''}
  `;
}
```

### Migration Comparison

```javascript
// Compare column definitions between environments
async function compareColumn(schemaName, columnName, env1, env2) {
  const col1 = await fetchColumn(env1, schemaName, columnName);
  const col2 = await fetchColumn(env2, schemaName, columnName);

  const differences = [];

  if (col1.type !== col2.type) {
    differences.push(`Type: ${env1}=${col1.type}, ${env2}=${col2.type}`);
  }

  if (col1.required !== col2.required) {
    differences.push(`Required: ${env1}=${col1.required}, ${env2}=${col2.required}`);
  }

  if (col1.pattern !== col2.pattern) {
    differences.push(`Pattern: ${env1}=${col1.pattern}, ${env2}=${col2.pattern}`);
  }

  return differences;
}
```

### UI Field Generation

```javascript
// Generate form field from column definition
async function renderFormField(schemaName, columnName) {
  const column = await getColumn(schemaName, columnName);

  const input = document.createElement('input');
  input.name = column.column_name;
  input.required = column.required;

  // Set input type based on column type
  switch (column.type) {
    case 'integer':
    case 'decimal':
      input.type = 'number';
      if (column.minimum) input.min = column.minimum;
      if (column.maximum) input.max = column.maximum;
      break;
    case 'boolean':
      input.type = 'checkbox';
      break;
    case 'date':
      input.type = 'date';
      break;
    case 'timestamp':
      input.type = 'datetime-local';
      break;
    default:
      input.type = 'text';
      if (column.pattern) input.pattern = column.pattern;
      if (column.maximum) input.maxLength = column.maximum;
  }

  return input;
}
```

## Column Types

### Basic Types
- **text** - General strings (PostgreSQL: TEXT)
- **integer** - Whole numbers (PostgreSQL: INTEGER)
- **decimal** - Precise decimals (PostgreSQL: NUMERIC)
- **boolean** - True/false values (PostgreSQL: BOOLEAN)

### Date/Time Types
- **timestamp** - Date and time (PostgreSQL: TIMESTAMP WITH TIME ZONE)
- **date** - Date only (PostgreSQL: DATE)

### Special Types
- **uuid** - Universally unique identifier (PostgreSQL: UUID)
- **jsonb** - JSON data (PostgreSQL: JSONB)

### Array Types
- **text[]** - Array of strings (PostgreSQL: TEXT[])
- **integer[]** - Array of integers (PostgreSQL: INTEGER[])
- And other array variants

## Protection Flags

### immutable
When `true`, value can be set once during record creation but never modified:
- Perfect for transaction IDs, timestamps, immutable identifiers
- Write operations on this field after creation will fail

### sudo
When `true`, modifying this field requires a sudo token:
- Even if the schema doesn't require sudo
- Additional protection for sensitive fields like roles, permissions

## Performance Considerations

- Column metadata is cached
- Fast response time (typically < 10ms)
- No database joins required
- Safe for frequent access

## Related Endpoints

- [`POST /api/describe/:schema/columns/:column`](POST.md) - Create new column
- [`PUT /api/describe/:schema/columns/:column`](PUT.md) - Update column definition
- [`DELETE /api/describe/:schema/columns/:column`](DELETE.md) - Delete column
- [`GET /api/describe/:schema`](../:schema/GET.md) - Get schema definition

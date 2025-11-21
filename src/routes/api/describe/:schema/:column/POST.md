# POST /api/describe/:schema/:column

Add a new column to an existing schema. This operation modifies both the columns table (metadata) and the PostgreSQL table structure (ALTER TABLE ADD COLUMN).

## Path Parameters

- `:schema` - Schema name (required)
- `:column` - Column name (required, taken from URL not request body)

## Query Parameters

None

## Request Body

```json
{
  "type": "text",
  "required": false,
  "unique": false,
  "pattern": "^\\+?[1-9]\\d{1,14}$",
  "description": "User phone number",
  "index": true
}
```

### Required Fields

- **type** - Data type: `text`, `integer`, `decimal`, `boolean`, `timestamp`, `date`, `uuid`, `jsonb`, or array types (`text[]`, `integer[]`, etc.)

### Optional Fields

#### Constraints
- **required** - Whether column is required/NOT NULL (default: `false`)
- **default_value** - Default value for the column
- **unique** - Whether values must be unique (default: `false`)

#### Validation
- **minimum** - Minimum value for numeric types
- **maximum** - Maximum value for numeric or max length for text
- **pattern** - Regular expression pattern for text validation
- **enum_values** - Array of allowed values

#### Metadata
- **description** - Human-readable description

#### Protection
- **immutable** - Value can be set once but never changed (default: `false`)
- **sudo** - Require sudo token to modify this field (default: `false`)

#### Indexing & Search
- **index** - Create standard btree index (default: `false`)
- **searchable** - Enable full-text search with GIN index (default: `false`, text columns only)

#### Change Tracking
- **tracked** - Track changes in history table (default: `false`)

#### Data Transform
- **transform** - Auto-transform values: `lowercase`, `uppercase`, `trim`, `normalize_phone`, `normalize_email`

#### Relationships
- **relationship_type** - Type of relationship: `owned` or `referenced`
- **related_schema** - Target schema for relationship
- **related_column** - Target column (default: `id`)
- **relationship_name** - Name for API access
- **cascade_delete** - Cascade delete when parent deleted (default: `false`)
- **required_relationship** - Relationship is required/NOT NULL FK (default: `false`)

## Success Response (200)

```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "schema_name": "users",
    "column_name": "phone",
    "type": "text",
    "required": false,
    "pattern": "^\\+?[1-9]\\d{1,14}$",
    "description": "User phone number",
    "index": true,
    "created_at": "2024-01-15T10:30:00Z",
    "updated_at": "2024-01-15T10:30:00Z"
  }
}
```

## Error Responses

| Status | Error Code | Message | Condition |
|--------|------------|---------|-----------|
| 400 | `MISSING_REQUIRED_FIELDS` | "Column type is required" | Missing type field |
| 400 | `INVALID_COLUMN_NAME` | "Column name must start with letter or underscore" | Invalid column name format |
| 400 | `INVALID_TYPE` | "Invalid column type" | Unsupported data type |
| 401 | `AUTH_TOKEN_REQUIRED` | "Authorization token required" | No Bearer token |
| 403 | `SCHEMA_PROTECTED` | "Schema is protected and cannot be modified" | System schema |
| 404 | `SCHEMA_NOT_FOUND` | "Schema not found" | Invalid schema name |
| 409 | `COLUMN_EXISTS` | "Column already exists" | Column name already in use |

## Example Usage

### Add Simple Text Column

```bash
curl -X POST http://localhost:9001/api/describe/users/bio \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "text",
    "description": "User biography"
  }'
```

### Add Required Email Column

```bash
curl -X POST http://localhost:9001/api/describe/users/email \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "text",
    "required": true,
    "unique": true,
    "pattern": "^[^@]+@[^@]+\\.[^@]+$",
    "description": "User email address",
    "index": true
  }'
```

### Add Integer Column with Constraints

```bash
curl -X POST http://localhost:9001/api/describe/products/price \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "decimal",
    "required": true,
    "minimum": 0,
    "maximum": 999999.99,
    "description": "Product price in USD"
  }'
```

### Add Column with Enum Values

```bash
curl -X POST http://localhost:9001/api/describe/users/role \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "text",
    "required": true,
    "enum_values": ["admin", "user", "guest"],
    "default_value": "user",
    "description": "User role"
  }'
```

### Add Full-Text Searchable Column

```bash
curl -X POST http://localhost:9001/api/describe/articles/content \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "text",
    "searchable": true,
    "description": "Article content for full-text search"
  }'
```

### Add Relationship Column

```bash
curl -X POST http://localhost:9001/api/describe/posts/author_id \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "uuid",
    "required": true,
    "relationship_type": "referenced",
    "related_schema": "users",
    "related_column": "id",
    "relationship_name": "author",
    "cascade_delete": false,
    "description": "Post author"
  }'
```

## Complete Schema Build Workflow

```javascript
// Create schema and add columns
async function buildUserSchema() {
  // Step 1: Create schema
  await fetch('/api/describe/users', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      schema_name: 'users',
      status: 'pending'
    })
  });

  // Step 2: Add columns
  const columns = [
    {
      name: 'name',
      def: {
        type: 'text',
        required: true,
        description: 'User full name'
      }
    },
    {
      name: 'email',
      def: {
        type: 'text',
        required: true,
        unique: true,
        pattern: '^[^@]+@[^@]+\\.[^@]+$',
        index: true,
        description: 'User email'
      }
    },
    {
      name: 'age',
      def: {
        type: 'integer',
        minimum: 0,
        maximum: 150,
        description: 'User age'
      }
    }
  ];

  for (const column of columns) {
    await fetch(`/api/describe/users/${column.name}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(column.def)
    });
  }

  // Step 3: Activate schema
  await fetch('/api/describe/users', {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ status: 'active' })
  });

  console.log('User schema created with columns');
}
```

## Column Naming Rules

Column names must follow PostgreSQL identifier rules:
- Start with a letter or underscore
- Contain only letters, numbers, and underscores
- Maximum 63 characters
- Case-insensitive (stored as lowercase)

**Valid examples:**
- `email`
- `first_name`
- `_internal_id`
- `created_at`

**Invalid examples:**
- `123code` (starts with number)
- `user-name` (contains hyphen)
- `user.name` (contains period)

## Data Types

### Basic Types
- **text** - General strings (PostgreSQL: TEXT)
- **integer** - Whole numbers (PostgreSQL: INTEGER)
- **decimal** - Precise decimals (PostgreSQL: NUMERIC)
- **boolean** - True/false (PostgreSQL: BOOLEAN)

### Date/Time
- **timestamp** - Date and time with timezone (PostgreSQL: TIMESTAMP WITH TIME ZONE)
- **date** - Date only (PostgreSQL: DATE)

### Special
- **uuid** - UUID (PostgreSQL: UUID)
- **jsonb** - JSON data (PostgreSQL: JSONB)

### Arrays
- **text[]** - String array (PostgreSQL: TEXT[])
- **integer[]** - Integer array (PostgreSQL: INTEGER[])
- **uuid[]** - UUID array (PostgreSQL: UUID[])

## Validation Rules

### Application-Level Validation
These rules are enforced in the observer pipeline, not the database:
- `minimum` - Min value for numbers
- `maximum` - Max value/length
- `pattern` - Regex validation
- `enum_values` - Allowed values
- `transform` - Data transformation

### Database-Level Constraints
These create actual PostgreSQL constraints:
- `required` - NOT NULL constraint
- `unique` - UNIQUE constraint/index
- `default_value` - DEFAULT constraint

## Index Types

### Standard Index (`index: true`)
Creates btree index for faster queries:
```sql
CREATE INDEX idx_users_email ON users(email);
```

### Unique Index (`unique: true`)
Creates unique index:
```sql
CREATE UNIQUE INDEX idx_users_email_unique ON users(email);
```

### Full-Text Search (`searchable: true`)
Creates GIN index for text search:
```sql
CREATE INDEX idx_users_content_fts ON users USING gin(to_tsvector('english', content));
```

## Relationship Types

### referenced
Creates foreign key to another table:
```json
{
  "type": "uuid",
  "relationship_type": "referenced",
  "related_schema": "users",
  "related_column": "id",
  "relationship_name": "author"
}
```

Allows: `GET /api/data/posts/:id/author`

### owned
Creates one-to-many ownership relationship:
```json
{
  "relationship_type": "owned",
  "related_schema": "comments",
  "relationship_name": "comments"
}
```

Allows: `GET /api/data/posts/:id/comments`

## ALTER TABLE Behavior

Adding a column triggers:
1. Record created in `columns` table
2. PostgreSQL ALTER TABLE executed:
   ```sql
   ALTER TABLE users ADD COLUMN phone TEXT;
   ```
3. Indexes/constraints created if specified
4. Schema cache invalidated

## Performance Considerations

- Column addition is a DDL operation (ALTER TABLE)
- May lock table briefly during addition
- Consider adding columns during maintenance for large tables
- Multiple columns? Add them one at a time in a transaction

## Related Endpoints

- [`GET /api/describe/:schema/:column`](GET.md) - Get column definition
- [`PUT /api/describe/:schema/:column`](PUT.md) - Update column
- [`DELETE /api/describe/:schema/:column`](DELETE.md) - Delete column
- [`POST /api/describe/:schema`](../:schema/POST.md) - Create schema

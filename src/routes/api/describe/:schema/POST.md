# POST /api/describe/:schema

Create a new schema with metadata and protection settings. After creating the schema, add columns individually using the column endpoints. The schema creation automatically generates the underlying PostgreSQL table structure.

## Path Parameters

- `:schema` - Schema name (required, must match `schema_name` in request body unless `?force=true`)

## Query Parameters

- `force=true` - Override schema name mismatch between URL and body. If URL schema differs from `schema_name` in request body, the request fails unless this parameter is provided.

## Request Body

```json
{
  "schema_name": "users",
  "status": "active",
  "description": "User accounts and profiles",
  "sudo": false,
  "freeze": false,
  "immutable": false
}
```

### Required Fields

- **schema_name** - Schema name (must match URL parameter unless `?force=true`)

### Optional Fields

- **status** - Schema status: `pending` (default), `active`, or `system`
- **description** - Human-readable description of the schema's purpose
- **sudo** - Require sudo token for all data operations (default: `false`)
- **freeze** - Prevent all data changes, SELECT still works (default: `false`)
- **immutable** - Records are write-once (can create but not modify) (default: `false`)

## Success Response (200)

```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "schema_name": "users",
    "status": "active",
    "description": "User accounts and profiles",
    "sudo": false,
    "freeze": false,
    "immutable": false,
    "created_at": "2024-01-15T10:30:00Z",
    "updated_at": "2024-01-15T10:30:00Z"
  }
}
```

## Error Responses

| Status | Error Code | Message | Condition |
|--------|------------|---------|-----------|
| 400 | `MISSING_REQUIRED_FIELDS` | "Schema name is required" | Missing schema_name field |
| 400 | `INVALID_SCHEMA_NAME` | "Schema name must contain only alphanumerics and underscores" | Invalid schema name format |
| 400 | `SCHEMA_NAME_MISMATCH` | "URL schema does not match body schema_name" | URL != body and no ?force=true |
| 401 | `AUTH_TOKEN_REQUIRED` | "Authorization token required" | No Bearer token in Authorization header |
| 401 | `AUTH_TOKEN_INVALID` | "Invalid token" | Token malformed or bad signature |
| 401 | `AUTH_TOKEN_EXPIRED` | "Token has expired" | Token well-formed but past expiration |
| 409 | `SCHEMA_EXISTS` | "Schema already exists" | Schema name already in use |

## Example Usage

### Create Basic Schema

```bash
curl -X POST http://localhost:9001/api/describe/users \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "schema_name": "users",
    "status": "active",
    "description": "User accounts and profiles"
  }'
```

### Create Schema with sudo Protection

```bash
curl -X POST http://localhost:9001/api/describe/financial_accounts \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "schema_name": "financial_accounts",
    "status": "active",
    "description": "Financial account records",
    "sudo": true
  }'
```

### Create Immutable Schema for Audit Log

```bash
curl -X POST http://localhost:9001/api/describe/audit_log \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type": "application/json" \
  -d '{
    "schema_name": "audit_log",
    "status": "active",
    "description": "System audit trail",
    "immutable": true
  }'
```

### Using force Parameter

```bash
# URL says 'users_v2' but body says 'users' - use force to override
curl -X POST "http://localhost:9001/api/describe/users_v2?force=true" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "schema_name": "users",
    "status": "active"
  }'
```

### Complete Schema Creation Workflow

```javascript
// Step 1: Create schema
async function createUserSchema() {
  const response = await fetch('/api/describe/users', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      schema_name: 'users',
      status: 'active',
      description: 'User accounts and profiles'
    })
  });

  const { data: schema } = await response.json();
  console.log('Schema created:', schema.schema_name);

  return schema;
}

// Step 2: Add columns (one at a time)
async function addUserColumns() {
  // Add name column
  await fetch('/api/describe/users/name', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      type: 'text',
      required: true,
      description: 'User full name'
    })
  });

  // Add email column
  await fetch('/api/describe/users/email', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      type: 'text',
      required: true,
      unique: true,
      pattern: '^[^@]+@[^@]+\\.[^@]+$',
      description: 'User email address'
    })
  });

  console.log('Columns added to schema');
}

// Execute workflow
await createUserSchema();
await addUserColumns();
```

## Schema Naming Rules

Schema names must follow PostgreSQL identifier rules:
- Start with a letter or underscore
- Contain only letters, numbers, and underscores
- Maximum 63 characters
- Case-insensitive (stored as lowercase)

**Valid examples:**
- `users`
- `user_accounts`
- `_internal_cache`
- `products_v2`

**Invalid examples:**
- `123users` (starts with number)
- `user-accounts` (contains hyphen)
- `user.accounts` (contains period)

## Adding Columns After Creation

**Important:** Schema creation no longer accepts a `columns` array in the request body. After creating the schema, add columns individually:

```bash
POST /api/describe/:schema/columns/:column
```

See [`POST /api/describe/:schema/columns/:column`](:column/POST.md) for details.

## Schema Protection Patterns

### Sudo-Protected Schema
Requires elevated permissions for all data operations:
```json
{
  "schema_name": "sensitive_data",
  "sudo": true
}
```

All operations on this schema will require a sudo token obtained via `POST /api/user/sudo`.

### Frozen Schema
Prevents all data modifications during maintenance:
```json
{
  "schema_name": "products",
  "freeze": true
}
```

Blocks CREATE, UPDATE, DELETE operations. SELECT still works.

### Immutable Schema
Write-once pattern for audit trails:
```json
{
  "schema_name": "transaction_log",
  "immutable": true
}
```

Records can be created but never modified. Perfect for compliance and audit requirements.

## Automatic Table Creation

When a schema is created, the system automatically:
1. Creates a record in the `schemas` table
2. Generates PostgreSQL table structure with system columns:
   - `id` (UUID, primary key)
   - `created_at` (timestamp)
   - `updated_at` (timestamp)
   - `trashed_at` (timestamp, for soft deletes)
   - `deleted_at` (timestamp, for permanent deletes)
   - `access_read` (UUID[], ACL permissions)
   - `access_edit` (UUID[], ACL permissions)
   - `access_full` (UUID[], ACL permissions)
3. Sets up triggers for timestamp management
4. Initializes cache entries

## System Schemas

You cannot create schemas with `status='system'` via the API. System schemas are reserved for:
- Core platform tables (schemas, columns, users, sessions)
- Internal metadata and configuration
- Protected system functionality

## Performance Considerations

- Schema creation is a DDL operation (ALTER TABLE)
- May take longer for databases with many schemas
- Consider creating schemas during setup/migration, not at runtime
- Use pending status initially, then activate after testing

## Related Endpoints

- [`GET /api/describe`](../GET.md) - List all schemas
- [`GET /api/describe/:schema`](GET.md) - Get schema definition
- [`PUT /api/describe/:schema`](PUT.md) - Update schema metadata
- [`DELETE /api/describe/:schema`](DELETE.md) - Delete schema
- [`POST /api/describe/:schema/columns/:column`](:column/POST.md) - Add column to schema

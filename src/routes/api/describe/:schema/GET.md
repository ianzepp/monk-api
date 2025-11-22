# GET /api/describe/:schema

Retrieve schema metadata including status, protection settings, and configuration. This endpoint returns schema-level information only - use column endpoints to retrieve column definitions.

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

### Response Fields

- **id** - Schema record UUID
- **schema_name** - Name of the schema
- **status** - Schema status: `pending`, `active`, or `system`
- **description** - Human-readable description of the schema's purpose
- **sudo** - Whether sudo token is required for data operations
- **freeze** - Whether all data changes are prevented (reads still work)
- **immutable** - Whether records are write-once (can be created but not modified)
- **created_at** - Timestamp when schema was created
- **updated_at** - Timestamp when schema was last modified

## Error Responses

| Status | Error Code | Message | Condition |
|--------|------------|---------|-----------|
| 401 | `AUTH_TOKEN_REQUIRED` | "Authorization token required" | No Bearer token in Authorization header |
| 401 | `AUTH_TOKEN_INVALID` | "Invalid token" | Token malformed or bad signature |
| 401 | `AUTH_TOKEN_EXPIRED` | "Token has expired" | Token well-formed but past expiration |
| 404 | `SCHEMA_NOT_FOUND` | "Schema not found" | Invalid schema name |

## Example Usage

### Get Schema Metadata

```bash
curl -X GET http://localhost:9001/api/describe/users \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**
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

### Using in JavaScript

```javascript
async function getSchema(schemaName) {
  const response = await fetch(`/api/describe/${schemaName}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  const { data: schema } = await response.json();
  return schema;
}

// Check if schema requires sudo
async function requiresSudo(schemaName) {
  const schema = await getSchema(schemaName);
  return schema.sudo === true;
}

// Check if schema is frozen
async function isFrozen(schemaName) {
  const schema = await getSchema(schemaName);
  return schema.freeze === true;
}
```

## Use Cases

### Schema Validation Before Operations

```javascript
// Check schema protection before attempting write
async function safeCreateRecord(schemaName, recordData) {
  const schema = await getSchema(schemaName);

  if (schema.freeze) {
    throw new Error(`Schema '${schemaName}' is frozen - no writes allowed`);
  }

  if (schema.sudo) {
    // Get sudo token first
    const sudoToken = await getSudoToken('Creating record');
    return createWithSudo(schemaName, recordData, sudoToken);
  }

  // Normal create operation
  return createRecord(schemaName, recordData);
}
```

### Schema Documentation UI

```javascript
// Display schema information in admin panel
async function renderSchemaInfo(schemaName) {
  const schema = await getSchema(schemaName);

  return `
    <div class="schema-info">
      <h2>${schema.schema_name}</h2>
      <p>${schema.description || 'No description'}</p>
      <dl>
        <dt>Status:</dt>
        <dd>${schema.status}</dd>
        <dt>Protection:</dt>
        <dd>
          ${schema.sudo ? '🔐 Sudo Required' : ''}
          ${schema.freeze ? '🧊 Frozen' : ''}
          ${schema.immutable ? '📌 Immutable' : ''}
        </dd>
        <dt>Created:</dt>
        <dd>${new Date(schema.created_at).toLocaleDateString()}</dd>
      </dl>
    </div>
  `;
}
```

### Migration Comparison

```javascript
// Compare schema settings between environments
async function compareSchemaConfig(schemaName, env1, env2) {
  const schema1 = await fetchSchema(env1, schemaName);
  const schema2 = await fetchSchema(env2, schemaName);

  const differences = [];

  if (schema1.sudo !== schema2.sudo) {
    differences.push(`Sudo: ${env1}=${schema1.sudo}, ${env2}=${schema2.sudo}`);
  }

  if (schema1.freeze !== schema2.freeze) {
    differences.push(`Freeze: ${env1}=${schema1.freeze}, ${env2}=${schema2.freeze}`);
  }

  if (schema1.immutable !== schema2.immutable) {
    differences.push(`Immutable: ${env1}=${schema1.immutable}, ${env2}=${schema2.immutable}`);
  }

  return differences;
}
```

## Schema Status Values

- **pending** - Schema created but not yet active
- **active** - Schema is active and available for use
- **system** - Protected system schema (cannot be modified or deleted)

## Schema Protection Flags

### sudo
When `true`, all data operations on this schema require a sudo token:
```bash
# Get sudo token first
POST /api/user/sudo
{"reason": "Modifying financial records"}

# Use sudo token for operations
Authorization: Bearer SUDO_TOKEN
```

### freeze
When `true`, all data changes are prevented:
- ❌ CREATE operations blocked
- ❌ UPDATE operations blocked
- ❌ DELETE operations blocked
- ✅ SELECT operations still work

Use for emergency lockdowns or maintenance windows.

### immutable
When `true`, records follow write-once pattern:
- ✅ Records can be created
- ❌ Records cannot be modified after creation
- ✅ Records can be soft-deleted (trashed)

Perfect for audit logs, blockchain-style records, or compliance requirements.

## Column Information

**Note:** This endpoint returns schema-level metadata only. To retrieve column definitions:

- Use [`GET /api/describe/:schema/columns`](columns/GET.md) for all columns
- Use [`GET /api/describe/:schema/columns/:column`](columns/:column/GET.md) for individual columns
- Query the `columns` table via Data API: `GET /api/data/columns?where={"schema_name":"users"}`

## System Schema Protection

Schemas with `status='system'` have special protection:
- Cannot be modified via PUT
- Cannot be deleted via DELETE
- Columns cannot be added or removed
- Only root users can access system schemas

## Performance Considerations

- Schema metadata is cached with timestamp-based validation
- Fast response time (typically < 10ms)
- Safe for frequent polling
- No database joins required

## Related Endpoints

- [`GET /api/describe`](../GET.md) - List all schemas
- [`POST /api/describe/:schema`](POST.md) - Create new schema
- [`PUT /api/describe/:schema`](PUT.md) - Update schema metadata
- [`DELETE /api/describe/:schema`](DELETE.md) - Delete schema
- [`GET /api/describe/:schema/columns/:column`](:column/GET.md) - Get column definition

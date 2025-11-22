# PUT /api/describe/:schema

Update schema metadata and protection settings. This endpoint modifies schema-level configuration only - use column endpoints to modify column definitions.

## Path Parameters

- `:schema` - Schema name (required)

## Query Parameters

None

## Request Body

```json
{
  "status": "active",
  "description": "Updated description",
  "sudo": true,
  "freeze": false,
  "immutable": false
}
```

### Allowed Updates

- **status** - Change schema status (`pending`, `active`)
- **description** - Update schema description
- **sudo** - Change sudo requirement for data operations
- **freeze** - Change freeze status (emergency lockdown)
- **immutable** - Change immutable status (write-once pattern)

**Note:** You cannot change `status` to `system` via the API. System schemas cannot be modified.

## Success Response (200)

```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "schema_name": "users",
    "status": "active",
    "description": "Updated description",
    "sudo": true,
    "freeze": false,
    "immutable": false,
    "created_at": "2024-01-15T10:30:00Z",
    "updated_at": "2024-01-15T12:45:00Z"
  }
}
```

## Error Responses

| Status | Error Code | Message | Condition |
|--------|------------|---------|-----------|
| 401 | `AUTH_TOKEN_REQUIRED` | "Authorization token required" | No Bearer token in Authorization header |
| 401 | `AUTH_TOKEN_INVALID` | "Invalid token" | Token malformed or bad signature |
| 401 | `AUTH_TOKEN_EXPIRED` | "Token has expired" | Token well-formed but past expiration |
| 403 | `SCHEMA_PROTECTED` | "Schema is protected and cannot be modified" | Attempting to modify system schema |
| 404 | `SCHEMA_NOT_FOUND` | "Schema not found" | Invalid schema name |

## Example Usage

### Activate Schema

```bash
curl -X PUT http://localhost:9001/api/describe/users \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "active"
  }'
```

### Enable sudo Protection

```bash
curl -X PUT http://localhost:9001/api/describe/financial_accounts \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sudo": true
  }'
```

### Emergency Freeze

```bash
# Freeze schema to prevent data changes during incident
curl -X PUT http://localhost:9001/api/describe/users \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "freeze": true
  }'
```

### Update Description

```bash
curl -X PUT http://localhost:9001/api/describe/products \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Product catalog with inventory tracking"
  }'
```

## Use Cases

### Schema Lifecycle Management

```javascript
// Deploy workflow: pending → active
async function activateSchema(schemaName) {
  const response = await fetch(`/api/describe/${schemaName}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ status: 'active' })
  });

  const { data: schema } = await response.json();
  console.log(`Schema '${schema.schema_name}' is now active`);
  return schema;
}
```

### Emergency Lockdown

```javascript
// Freeze schema during security incident
async function emergencyFreeze(schemaName, reason) {
  console.log(`EMERGENCY: Freezing ${schemaName} - ${reason}`);

  const response = await fetch(`/api/describe/${schemaName}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      freeze: true,
      description: `FROZEN: ${reason}`
    })
  });

  const { data: schema } = await response.json();

  // Notify team
  await notifyTeam(`Schema ${schemaName} has been frozen: ${reason}`);

  return schema;
}

// Later: Unfreeze after incident resolved
async function unfreezeSchema(schemaName) {
  return await fetch(`/api/describe/${schemaName}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ freeze: false })
  });
}
```

### Add sudo Protection to Existing Schema

```javascript
// Upgrade schema to require sudo
async function enableSudo(schemaName) {
  const response = await fetch(`/api/describe/${schemaName}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ sudo: true })
  });

  const { data: schema } = await response.json();
  console.log(`Schema '${schema.schema_name}' now requires sudo token`);
  return schema;
}
```

### Convert to Immutable Schema

```javascript
// Make existing schema immutable for compliance
async function makeImmutable(schemaName) {
  const response = await fetch(`/api/describe/${schemaName}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      immutable: true,
      description: 'Audit log - records are write-once'
    })
  });

  const { data: schema } = await response.json();
  console.log(`Schema '${schema.schema_name}' is now immutable`);
  return schema;
}
```

## Schema Status Transitions

Valid status transitions:
- `pending` → `active` (schema is ready for use)
- `active` → `pending` (rollback activation)

**Cannot transition to:**
- `system` (reserved for internal schemas)

## Protection Flag Behavior

### Enabling sudo
When sudo is enabled on an existing schema:
- **Immediate effect**: All subsequent data operations require sudo token
- **Active sessions**: Existing requests without sudo token will fail
- **Use case**: Upgrade security for sensitive data

### Enabling freeze
When freeze is enabled:
- **Immediate effect**: All write operations blocked
- **Read operations**: Continue to work normally
- **Use case**: Emergency lockdown, maintenance windows, incident response

### Enabling immutable
When immutable is enabled on existing schema:
- **New records**: Can be created
- **Existing records**: Can no longer be modified
- **Use case**: Convert audit log to write-once after initial data load

## Modifying Columns

**Important:** This endpoint updates schema-level metadata only. To modify columns:

- Add column: [`POST /api/describe/:schema/columns/:column`](:column/POST.md)
- Update column: [`PUT /api/describe/:schema/columns/:column`](:column/PUT.md)
- Delete column: [`DELETE /api/describe/:schema/columns/:column`](:column/DELETE.md)

## System Schema Protection

Schemas with `status='system'` cannot be modified:
- `PUT` operations return `403 SCHEMA_PROTECTED`
- Only root users can access system schemas
- System schema protection is permanent

Examples of system schemas:
- `schemas` - Schema metadata
- `columns` - Column definitions
- `users` - User accounts
- `sessions` - Active sessions

## Performance Considerations

- Schema metadata updates are fast (< 10ms)
- No DDL operations required (no ALTER TABLE)
- Changes take effect immediately
- Schema cache is invalidated and refreshed

## Validation

The endpoint validates:
- Schema exists and is accessible
- User has permission to modify schema
- Status values are valid (`pending`, `active`)
- Boolean values for protection flags

## Related Endpoints

- [`GET /api/describe/:schema`](GET.md) - Get schema definition
- [`POST /api/describe/:schema`](POST.md) - Create new schema
- [`DELETE /api/describe/:schema`](DELETE.md) - Delete schema
- [`PUT /api/describe/:schema/columns/:column`](:column/PUT.md) - Update column definition

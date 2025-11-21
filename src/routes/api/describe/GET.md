# GET /api/describe

List all available schema names in the current tenant. This endpoint provides a lightweight directory of schemas without their definitions or column details.

## Path Parameters

None

## Query Parameters

None

## Request Body

None - GET request with no body.

## Success Response (200)

```json
{
  "success": true,
  "data": [
    "users",
    "accounts",
    "products",
    "invoices"
  ]
}
```

The response contains an array of schema names (strings). System schemas are included in the list.

## Error Responses

| Status | Error Code | Message | Condition |
|--------|------------|---------|-----------|
| 401 | `AUTH_TOKEN_REQUIRED` | "Authorization token required" | No Bearer token in Authorization header |
| 401 | `AUTH_TOKEN_INVALID` | "Invalid token" | Token malformed or bad signature |
| 401 | `AUTH_TOKEN_EXPIRED` | "Token has expired" | Token well-formed but past expiration |

## Example Usage

### List All Schemas

```bash
curl -X GET http://localhost:9001/api/describe \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "data": [
    "users",
    "accounts",
    "products",
    "orders",
    "invoices"
  ]
}
```

### Using in JavaScript

```javascript
async function listSchemas() {
  const response = await fetch('/api/describe', {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  const { data: schemas } = await response.json();
  return schemas;
}

// Example: Check if a schema exists
async function schemaExists(schemaName) {
  const schemas = await listSchemas();
  return schemas.includes(schemaName);
}
```

## Use Cases

### Schema Discovery

```javascript
// Discover all available schemas in the tenant
const schemas = await listSchemas();
console.log('Available schemas:', schemas);

// Build dynamic UI for schema selection
const schemaSelect = document.getElementById('schema-select');
schemas.forEach(schema => {
  const option = document.createElement('option');
  option.value = schema;
  option.textContent = schema;
  schemaSelect.appendChild(option);
});
```

### Validation Before Operations

```javascript
// Validate schema exists before attempting operations
async function createRecord(schemaName, recordData) {
  const schemas = await listSchemas();

  if (!schemas.includes(schemaName)) {
    throw new Error(`Schema '${schemaName}' does not exist`);
  }

  // Proceed with create operation
  const response = await fetch(`/api/data/${schemaName}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify([recordData])
  });

  return response.json();
}
```

### Database Migration Tools

```javascript
// Check for schema changes between environments
async function compareSchemas(sourceEnv, targetEnv) {
  const sourceSchemas = await fetchSchemas(sourceEnv);
  const targetSchemas = await fetchSchemas(targetEnv);

  const missing = sourceSchemas.filter(s => !targetSchemas.includes(s));
  const extra = targetSchemas.filter(s => !sourceSchemas.includes(s));

  return { missing, extra };
}
```

## Default Behavior

- Returns **all schemas** in the current tenant (including system schemas)
- Returns **schema names only** (not full definitions or columns)
- Schemas are returned in **alphabetical order**
- No pagination - returns complete list

## Tenant Isolation

This endpoint respects tenant boundaries:
- Only returns schemas belonging to the authenticated user's tenant
- Different tenants cannot see each other's schemas
- System schemas may be visible across all tenants

## System Schemas

The response includes system schemas (those with `status='system'`):
- `schemas` - Schema metadata
- `columns` - Column definitions
- `users` - User accounts
- `sessions` - Active sessions
- And other internal tables

System schemas are protected and cannot be modified or deleted.

## Performance Considerations

This endpoint is highly optimized:
- Results are cached with timestamp-based validation
- Fast response time even with hundreds of schemas
- Minimal database queries
- Safe for frequent polling

## Related Endpoints

- [`GET /api/describe/:schema`](:schema/GET.md) - Get schema definition
- [`POST /api/describe/:schema`](:schema/POST.md) - Create new schema
- [`DELETE /api/describe/:schema`](:schema/DELETE.md) - Delete schema

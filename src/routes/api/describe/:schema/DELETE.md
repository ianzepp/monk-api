# DELETE /api/describe/:schema

Soft-delete a schema definition and its associated PostgreSQL table. The schema is marked as deleted and can be restored using the Data API if needed.

## Path Parameters

- `:schema` - Schema name (required)

## Query Parameters

None

## Request Body

None - DELETE request with no body.

## Success Response (200)

```json
{
  "success": true,
  "data": {
    "schema_name": "users"
  }
}
```

## Error Responses

| Status | Error Code | Message | Condition |
|--------|------------|---------|-----------|
| 401 | `AUTH_TOKEN_REQUIRED` | "Authorization token required" | No Bearer token in Authorization header |
| 401 | `AUTH_TOKEN_INVALID` | "Invalid token" | Token malformed or bad signature |
| 401 | `AUTH_TOKEN_EXPIRED` | "Token has expired" | Token well-formed but past expiration |
| 403 | `SCHEMA_PROTECTED` | "Schema is protected and cannot be modified" | Attempting to delete system schema |
| 404 | `SCHEMA_NOT_FOUND` | "Schema not found or already deleted" | Schema doesn't exist or is already trashed |

## Example Usage

### Delete Schema

```bash
curl -X DELETE http://localhost:9001/api/describe/old_users \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "schema_name": "old_users"
  }
}
```

### Using in JavaScript

```javascript
async function deleteSchema(schemaName) {
  const response = await fetch(`/api/describe/${schemaName}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  const { data } = await response.json();
  console.log(`Schema '${data.schema_name}' deleted successfully`);
  return data;
}
```

## Use Cases

### Cleanup Old Schemas

```javascript
// Delete temporary or test schemas
async function cleanupTestSchemas() {
  const schemas = await listSchemas();
  const testSchemas = schemas.filter(s => s.startsWith('test_'));

  for (const schemaName of testSchemas) {
    try {
      await deleteSchema(schemaName);
      console.log(`Deleted test schema: ${schemaName}`);
    } catch (error) {
      console.error(`Failed to delete ${schemaName}:`, error);
    }
  }
}
```

### Schema Migration

```javascript
// Replace old schema with new version
async function migrateSchema(oldName, newName) {
  // Step 1: Create new schema
  await createSchema(newName);

  // Step 2: Copy data from old to new
  const oldData = await getData(oldName);
  await bulkCreate(newName, oldData);

  // Step 3: Verify migration
  const count = await getRecordCount(newName);
  console.log(`Migrated ${count} records to ${newName}`);

  // Step 4: Delete old schema
  await deleteSchema(oldName);
  console.log(`Old schema ${oldName} deleted`);
}
```

### Safe Deletion with Confirmation

```javascript
// Delete schema with safety checks
async function safeDeleteSchema(schemaName) {
  // Check if schema has data
  const count = await getRecordCount(schemaName);

  if (count > 0) {
    const confirmed = confirm(
      `Schema '${schemaName}' contains ${count} records. Delete anyway?`
    );

    if (!confirmed) {
      console.log('Deletion cancelled');
      return;
    }
  }

  // Perform deletion
  await deleteSchema(schemaName);
  console.log(`Schema '${schemaName}' deleted (${count} records)`);
}
```

## Soft Delete Behavior

This endpoint performs a **soft delete**:
- Schema record is marked with `trashed_at` timestamp
- PostgreSQL table is **dropped** (data is lost)
- Schema definition remains in `schemas` table
- Can be restored by clearing `trashed_at` field

**Important:** While the schema metadata can be restored, the underlying data is permanently deleted when the PostgreSQL table is dropped.

## What Gets Deleted

When you delete a schema:

### Immediate Actions
- PostgreSQL table is **dropped** (all data permanently lost)
- Schema record marked with `trashed_at` timestamp
- Column definitions marked as trashed
- Schema cache invalidated

### Data Loss
- ⚠️ **All records in the table are permanently deleted**
- ⚠️ **This operation cannot be undone**
- ⚠️ **No backup is created automatically**

### What Remains
- Schema metadata in `schemas` table (trashed)
- Column definitions in `columns` table (trashed)
- Can be found using `?include_trashed=true`

## Restoring a Deleted Schema

To restore the schema definition (not the data):

```bash
# Clear trashed_at to restore schema metadata
PUT /api/data/schemas/:schema_id
{
  "trashed_at": null
}
```

**Note:** This only restores the schema definition. You'll need to manually restore any data from backups.

## System Schema Protection

System schemas cannot be deleted:
- `schemas` - Schema metadata
- `columns` - Column definitions
- `users` - User accounts
- `sessions` - Active sessions

Attempting to delete a system schema returns `403 SCHEMA_PROTECTED`.

## Pre-Delete Considerations

Before deleting a schema, consider:

1. **Backup data** - Export records if you might need them
```bash
GET /api/data/:schema?format=csv > backup.csv
```

2. **Check relationships** - Verify no other schemas reference this one
```bash
GET /api/data/columns?where={"related_schema":"schema_name"}
```

3. **Notify users** - Alert team members of the deletion
4. **Review freeze option** - Consider freezing instead of deleting for temporary disable

## Alternative: Freeze Instead of Delete

For temporary disabling without data loss:

```bash
PUT /api/describe/:schema
{
  "freeze": true
}
```

This prevents writes while preserving all data.

## Performance Considerations

- Schema deletion is a DDL operation (DROP TABLE)
- May take longer for large tables
- Locks the table during deletion
- Consider performing during maintenance windows for large schemas

## Related Endpoints

- [`GET /api/describe/:schema`](GET.md) - Get schema definition
- [`POST /api/describe/:schema`](POST.md) - Create new schema
- [`PUT /api/describe/:schema`](PUT.md) - Update schema metadata
- [`PUT /api/data/schemas/:id`](../../data/schemas/:id/PUT.md) - Restore trashed schema metadata

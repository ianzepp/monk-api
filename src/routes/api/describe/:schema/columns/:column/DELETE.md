# DELETE /api/describe/:schema/columns/:column

Remove a column from the schema. This operation soft-deletes the column metadata (marks as trashed in columns table) and drops the column from the PostgreSQL table, permanently deleting all data in that column.

## Path Parameters

- `:schema` - Schema name (required)
- `:column` - Column name (required)

## Query Parameters

None

## Request Body

None - DELETE request with no body.

## Success Response (200)

```json
{
  "success": true,
  "data": {
    "schema_name": "users",
    "column_name": "phone"
  }
}
```

## Error Responses

| Status | Error Code | Message | Condition |
|--------|------------|---------|-----------|
| 401 | `AUTH_TOKEN_REQUIRED` | "Authorization token required" | No Bearer token in Authorization header |
| 401 | `AUTH_TOKEN_INVALID` | "Invalid token" | Token malformed or bad signature |
| 401 | `AUTH_TOKEN_EXPIRED` | "Token has expired" | Token well-formed but past expiration |
| 403 | `SCHEMA_PROTECTED` | "Schema is protected and cannot be modified" | System schema |
| 404 | `SCHEMA_NOT_FOUND` | "Schema not found" | Invalid schema name |
| 404 | `COLUMN_NOT_FOUND` | "Column not found in schema" | Column doesn't exist or already deleted |

## Example Usage

### Delete Column

```bash
curl -X DELETE http://localhost:9001/api/describe/users/phone \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "schema_name": "users",
    "column_name": "phone"
  }
}
```

### Using in JavaScript

```javascript
async function deleteColumn(schemaName, columnName) {
  const response = await fetch(`/api/describe/${schemaName}/${columnName}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  const { data } = await response.json();
  console.log(`Column '${data.column_name}' deleted from '${data.schema_name}'`);
  return data;
}
```

## Use Cases

### Remove Deprecated Column

```javascript
// Clean up old columns no longer in use
async function removeDeprecatedColumns(schemaName, deprecatedColumns) {
  for (const columnName of deprecatedColumns) {
    try {
      await deleteColumn(schemaName, columnName);
      console.log(`Removed deprecated column: ${columnName}`);
    } catch (error) {
      console.error(`Failed to remove ${columnName}:`, error);
    }
  }
}

// Example
await removeDeprecatedColumns('users', ['old_field', 'temp_data', 'unused_column']);
```

### Schema Migration

```javascript
// Remove column during migration
async function migrateUserSchema() {
  // Add new column
  await createColumn('users', 'full_name', {
    type: 'text',
    required: true
  });

  // Copy data from old columns
  await copyDataToNewColumn();

  // Remove old columns
  await deleteColumn('users', 'first_name');
  await deleteColumn('users', 'last_name');

  console.log('Migration complete');
}
```

### Safe Deletion with Confirmation

```javascript
// Delete column with safety checks
async function safeDeleteColumn(schemaName, columnName) {
  // Check if column has data
  const sampleData = await fetch(`/api/find/${schemaName}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      select: [columnName],
      limit: 1
    })
  });

  const hasData = (await sampleData.json()).data.length > 0;

  if (hasData) {
    const confirmed = confirm(
      `Column '${columnName}' contains data. Delete anyway? This cannot be undone.`
    );

    if (!confirmed) {
      console.log('Deletion cancelled');
      return;
    }
  }

  // Perform deletion
  await deleteColumn(schemaName, columnName);
  console.log(`Column '${columnName}' permanently deleted`);
}
```

## What Gets Deleted

When you delete a column:

### Immediate Actions
- Column record in `columns` table marked with `trashed_at`
- PostgreSQL column **dropped** from table (`ALTER TABLE DROP COLUMN`)
- **All data in the column is permanently deleted**
- Associated indexes dropped
- Associated constraints removed
- Schema cache invalidated

### Data Loss
- ⚠️ **All data in this column is permanently deleted**
- ⚠️ **This operation cannot be undone**
- ⚠️ **No automatic backup is created**

### What Remains
- Column metadata in `columns` table (trashed)
- Can be found using `?include_trashed=true`
- Metadata can be restored, but data is lost forever

## Restoring Column Metadata

To restore the column definition (not the data):

```bash
# Clear trashed_at to restore column metadata
PUT /api/data/columns/:column_id
{
  "trashed_at": null
}
```

**Important:** This only restores the metadata. The PostgreSQL column and all data are permanently deleted.

To recreate the column with data, you must:
1. Create new column: `POST /api/describe/:schema/columns/:column`
2. Restore data from backups manually

## System Column Protection

You cannot delete:
- System columns (id, created_at, updated_at, etc.)
- Columns in system schemas
- Columns referenced by other schemas (foreign keys)

## Pre-Delete Considerations

Before deleting a column:

1. **Backup data** - Export column data if needed later
```bash
GET /api/data/:schema?select=column_name&format=csv > backup.csv
```

2. **Check relationships** - Verify no foreign keys reference this column
```bash
GET /api/data/columns?where={"related_schema":"schema","related_column":"column"}
```

3. **Review dependencies** - Check application code for references
4. **Notify team** - Alert developers of the deletion
5. **Test in staging** - Always test deletions in non-production first

## Performance Considerations

- Column deletion is a DDL operation (ALTER TABLE DROP COLUMN)
- May lock table briefly during deletion
- Faster than adding columns (no data migration)
- Consider maintenance windows for large tables
- Dropping indexed columns removes index automatically

## Common Errors

### Foreign Key Constraint
If other tables reference this column:
```
ERROR: cannot drop column because other objects depend on it
```
**Solution:** Remove foreign key relationships first.

### System Column
Attempting to delete protected columns:
```
403 SCHEMA_PROTECTED: System columns cannot be deleted
```
**Solution:** System columns (id, timestamps, access fields) cannot be deleted.

## ALTER TABLE Behavior

Deleting a column executes:
```sql
ALTER TABLE schema_name DROP COLUMN column_name CASCADE;
```

The `CASCADE` option ensures:
- Dependent indexes are dropped
- Dependent constraints are removed
- View dependencies may cause errors (drop views first)

## Related Endpoints

- [`GET /api/describe/:schema/columns/:column`](GET.md) - Get column definition
- [`POST /api/describe/:schema/columns/:column`](POST.md) - Create new column
- [`PUT /api/describe/:schema/columns/:column`](PUT.md) - Update column definition
- [`DELETE /api/describe/:schema`](../:schema/DELETE.md) - Delete entire schema

# PUT /api/data/:schema

Apply updates to every record in the payload, using the provided `id` fields to target rows. Use this endpoint for bulk edits, schema migrations, or cross-record data fixes—observers ensure validation and audit hooks run for each updated record, and omitting an `id` immediately rejects the request.

## Path Parameters

- `:schema` - Schema name (required)

## Query Parameters

- `include_trashed=true` - When combined with PATCH method, performs revert operation

## Request Body

Always expects an **array of record objects with `id` fields**. Only include the fields you want to update:

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "John Updated",
    "department": "Senior Engineering"
  },
  {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "email": "jane.smith@example.com"
  }
]
```

**Important:** Each object **must include an `id` field** to identify which record to update.

## Success Response (200)

```json
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "John Updated",
      "email": "john@example.com",
      "department": "Senior Engineering",
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T11:00:00Z",
      "trashed_at": null,
      "deleted_at": null
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "name": "Jane Smith",
      "email": "jane.smith@example.com",
      "department": "Marketing",
      "created_at": "2024-01-15T10:30:01Z",
      "updated_at": "2024-01-15T11:00:05Z",
      "trashed_at": null,
      "deleted_at": null
    }
  ]
}
```

### Response Fields

Each updated record includes:
- All fields (updated values merged with existing values)
- **updated_at** - Timestamp when record was updated
- Unchanged fields retain their original values

## Error Responses

| Status | Error Code | Message | Condition |
|--------|------------|---------|-----------|
| 400 | `BODY_NOT_ARRAY` | "Request body must be an array of update records with id fields" | Body is not an array or missing id fields |
| 401 | `AUTH_TOKEN_REQUIRED` | "Authorization token required" | No Bearer token in Authorization header |
| 401 | `AUTH_TOKEN_INVALID` | "Invalid token" | Token malformed or bad signature |
| 401 | `AUTH_TOKEN_EXPIRED` | "Token has expired" | Token well-formed but past expiration |
| 403 | `SCHEMA_FROZEN` | "Schema is frozen" | Attempting to write to frozen schema |
| 404 | `SCHEMA_NOT_FOUND` | "Schema not found" | Invalid schema name |
| 404 | `RECORD_NOT_FOUND` | "Record not found" | One or more IDs don't exist |
| 422 | Validation errors | Various | Observer validation failures |

## Transaction Behavior

All updates in the request execute within a **single database transaction**:

✅ **All succeed together** - If every update passes validation, all are persisted
❌ **All fail together** - If any update fails, the entire batch is rolled back

## Example Usage

### Bulk Update User Departments

```bash
curl -X PUT http://localhost:9001/api/data/users \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '[
    {"id": "user-1", "department": "Engineering"},
    {"id": "user-2", "department": "Engineering"},
    {"id": "user-3", "department": "Engineering"}
  ]'
```

### Partial Field Updates

Only the fields you include are updated—other fields remain unchanged:

```bash
curl -X PUT http://localhost:9001/api/data/products \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '[
    {"id": "prod-1", "price": 29.99},
    {"id": "prod-2", "in_stock": false}
  ]'
```

**Result:**
- Product 1: Only `price` updated, other fields unchanged
- Product 2: Only `in_stock` updated, other fields unchanged

### Bulk Status Change

```bash
curl -X PUT http://localhost:9001/api/data/orders \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '[
    {"id": "order-123", "status": "shipped", "shipped_at": "2024-01-15T10:00:00Z"},
    {"id": "order-456", "status": "shipped", "shipped_at": "2024-01-15T10:05:00Z"},
    {"id": "order-789", "status": "shipped", "shipped_at": "2024-01-15T10:10:00Z"}
  ]'
```

## Smart Routing: Revert Operation

When using **PATCH method** with `include_trashed=true`, this endpoint performs a **revert operation** instead of an update:

```bash
PATCH /api/data/users?include_trashed=true \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '[
    {"id": "user-1"},
    {"id": "user-2"}
  ]'
```

**Behavior:**
- Finds records where `trashed_at IS NOT NULL`
- Sets `trashed_at = NULL` (restores from trash)
- Returns restored records

**Use case:** Bulk restore soft-deleted records from trash bin.

## Observer Pipeline

Updated records pass through the full observer pipeline:

### Pre-Update Observers
- **Validation** - Schema validation, required fields, data types
- **Security** - Check permissions, verify ACLs
- **Business Logic** - Custom validation rules
- **Immutability Check** - Prevent changes to immutable fields

### Post-Update Observers
- **Audit Logging** - Record update events
- **Notifications** - Trigger webhooks, emails
- **Side Effects** - Update related records, invalidate caches

If any observer throws an error, the transaction rolls back and no records are updated.

## Schema Protection

### Frozen Schemas

Schemas with `freeze=true` reject all update operations:

```bash
PUT /api/data/audit_log
# Error 403: SCHEMA_FROZEN
```

### Sudo-Protected Schemas

Schemas with `sudo=true` require a sudo token:

```bash
# Get sudo token first
POST /api/user/sudo
{"reason": "Updating financial records"}

# Then use sudo token
PUT /api/data/financial_accounts
Authorization: Bearer SUDO_TOKEN
```

### Immutable Fields

Fields marked with `immutable=true` **cannot be changed** after creation:

```bash
PUT /api/data/transactions
[{"id": "tx-123", "transaction_id": "NEW-ID"}]

# Error: Cannot modify immutable fields: transaction_id
```

## Validation Examples

### Missing ID Field

```bash
PUT /api/data/users
[{"name": "Updated Name"}]  # Missing 'id' field

# Error 400: BODY_NOT_ARRAY
# "Request body must be an array of update records with id fields"
```

### Non-Existent Record

```bash
PUT /api/data/users
[{"id": "non-existent-id", "name": "Test"}]

# Error 404: RECORD_NOT_FOUND
```

### Invalid Field Value

```bash
PUT /api/data/products
[{"id": "prod-1", "price": "not-a-number"}]

# Error 422: Validation failed: price must be a number
```

## Merge Behavior

Updates are **merged** with existing records:

**Existing record:**
```json
{
  "id": "user-1",
  "name": "Alice",
  "email": "alice@example.com",
  "department": "Engineering",
  "role": "Senior"
}
```

**Update request:**
```json
[{"id": "user-1", "department": "Management"}]
```

**Result:**
```json
{
  "id": "user-1",
  "name": "Alice",              // ← Unchanged
  "email": "alice@example.com", // ← Unchanged
  "department": "Management",   // ← Updated
  "role": "Senior",             // ← Unchanged
  "updated_at": "2024-01-15T11:00:00Z"
}
```

## Updating System Fields

Most system fields are **protected** and cannot be updated:

❌ **Cannot update:**
- `id` - Record identifier (immutable)
- `created_at` - Creation timestamp (immutable)
- `trashed_at` - Use DELETE endpoint instead
- `deleted_at` - Use DELETE with permanent=true instead

✅ **Can update:**
- `updated_at` - Automatically set to current timestamp
- User-defined fields

## Performance Considerations

### Batch Size Recommendations

- ✅ **1-100 records**: Optimal performance
- ⚠️ **100-1000 records**: Good, but consider chunking
- ❌ **1000+ records**: Use chunking strategy (see below)

### Large Update Strategy

```javascript
async function bulkUpdate(updates, batchSize = 100) {
  const results = [];

  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize);

    const response = await fetch('/api/data/users', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(batch)
    });

    const { data } = await response.json();
    results.push(...data);

    console.log(`Updated ${i + batch.length}/${updates.length} records`);
  }

  return results;
}
```

## Related Endpoints

- [`GET /api/data/:schema`](GET.md) - Query all records
- [`POST /api/data/:schema`](POST.md) - Bulk create records
- [`DELETE /api/data/:schema`](DELETE.md) - Bulk delete records
- [`PUT /api/data/:schema/:id`](../:schema/:record/PUT.md) - Update single record

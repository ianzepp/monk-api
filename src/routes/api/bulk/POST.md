# POST /api/bulk

Execute multiple operations inside one transaction.

This endpoint is for batch work that should succeed or fail as a unit.
It runs each operation in sequence and rolls the whole transaction back on error.

## Docs Path

- Live route: `POST /api/bulk`
- Docs page: `/docs/api/bulk/POST`

## Authentication

Requires a valid JWT bearer token.
Authorization is checked per operation inside the payload.

```bash
Authorization: Bearer <token>
```

## Request Body

```json
{
  "operations": [
    {
      "operation": "create-one",
      "model": "users",
      "data": {"name": "Ada", "email": "ada@example.com"}
    },
    {
      "operation": "update-any",
      "model": "orders",
      "filter": {"where": {"status": "pending"}},
      "data": {"priority": "high"}
    },
    {
      "operation": "aggregate",
      "model": "orders",
      "filter": {"where": {"status": "paid"}},
      "aggregate": {"total": {"$sum": "amount"}},
      "groupBy": ["status"]
    }
  ]
}
```

## Supported operations

### Read helpers
- `select`
- `select-all`
- `select-one`
- `select-404`
- `select-max` *(currently returns an empty array with a warning)*
- `count`
- `aggregate`

### Create
- `create`
- `create-one`
- `create-all`

### Update
- `update`
- `update-one`
- `update-all`
- `update-any`
- `update-404`

### Delete
- `delete`
- `delete-one`
- `delete-all`
- `delete-any`
- `delete-404`

### Upsert
- `upsert`
- `upsert-one`
- `upsert-all`

### Access control
- `access`
- `access-one`
- `access-all`
- `access-any`
- `access-404`

## Validation rules

- `operations` must be an array.
- Each operation must include `operation` and `model`.
- `*-one` operations require `id`.
- `*-404` operations require `id` or `filter`.
- `*-any` operations require `filter`.
- `create-all`, `update-all`, `delete-all`, `access-all`, and `upsert-all` require `data` to be an array.
- `update-all`, `delete-all`, and `access-all` require each array item to include an `id`.
- `aggregate` requires an `aggregate` object and does not use `data`.

## Response

```json
{
  "success": true,
  "data": [
    {
      "operation": "create-one",
      "model": "users",
      "result": {"id": "user_1", "name": "Ada"}
    },
    {
      "operation": "update-any",
      "model": "orders",
      "result": [{"id": "order_1", "priority": "high"}]
    }
  ]
}
```

## Error behavior

- Validation errors return `400` or `422` with a structured error code.
- Any failure rolls back the full transaction.
- No partial writes are persisted.

## Examples

### Create and update in one transaction

```bash
curl -X POST http://localhost:9001/api/bulk \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "operations": [
      {
        "operation": "create-one",
        "model": "users",
        "data": {"name": "Jane", "email": "jane@example.com"}
      },
      {
        "operation": "access-one",
        "model": "users",
        "id": "user-123",
        "data": {"access_read": ["user-123"]}
      }
    ]
  }'
```

### Filter-based batch changes

```json
{
  "operations": [
    {
      "operation": "update-any",
      "model": "orders",
      "filter": {"where": {"status": "pending"}},
      "data": {"priority": "high"}
    },
    {
      "operation": "delete-any",
      "model": "notifications",
      "filter": {"where": {"read": true}}
    }
  ]
}
```

## Notes

- Bulk execution runs through the same observer and validation pipeline as single routes.
- `select-max` is currently not implemented.
- `filter` may be used on `*-any` operations and on some `*-404` operations.

## Related docs

- [Bulk API overview](./PUBLIC.md)
- [Data API](../data/PUBLIC.md)
- [Aggregate API](../aggregate/PUBLIC.md)

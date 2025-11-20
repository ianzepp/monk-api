# Bulk API

Execute multiple observer-aware operations across schemas in a single transaction.

## Base Path
All Bulk API requests use: `POST /api/bulk`

## Endpoint Summary

| Method | Path | Description |
|--------|------|-------------|
| POST | [`/api/bulk`](#post-apibulk) | Execute multiple schema operations inside one transaction. |

## Content Type
- **Request**: `application/json`
- **Response**: `application/json`

## Authentication Required
Include a valid JWT bearer token. Authorization is evaluated per operation inside the bulk payload.

---

## POST /api/bulk

Submit an ordered list of operations—spanning CRUD actions, ACL updates, read helpers, and aggregations—and the platform will execute them sequentially inside a single transaction. Observer rings, validation, and auditing run for every operation just as they would through the individual endpoints.

### Request Body
```json
{
  "operations": [
    {
      "operation": "string",     // Required: supported operation (hyphen-case)
      "schema": "string",        // Required: target schema name
      "data": {},                 // Required for mutations (object or array depending on operation)
      "id": "string",            // Required for single-record operations
      "filter": {},               // Required for *-any variants, optional for read helpers
      "aggregate": {},            // Required for aggregate operations
      "groupBy": ["field"],      // Optional: string or string array for aggregate
      "message": "string"        // Optional: custom 404 message for *-404 variants
    }
  ]
}
```

### Success Response (200)
```json
{
  "success": true,
  "data": [
    {
      "operation": "create-all",
      "schema": "users",
      "result": [{"id": "user_1", "name": "Ada"}, {"id": "user_2", "name": "Grace"}]
    },
    {
      "operation": "update-any",
      "schema": "accounts",
      "result": [{"id": "acct_1", "status": "active"}]
    },
    {
      "operation": "aggregate",
      "schema": "orders",
      "result": [{"status": "pending", "total_orders": 12}]
    }
  ]
}
```

## Supported Operations

### Read Helpers
| Operation | Description | Requirements |
|-----------|-------------|--------------|
| `select` / `select-all` | Return records matching an optional filter. | `schema`, optional `filter` |
| `select-one` | Return a single record by `id` or filter. | `schema`, `id` or `filter` |
| `select-404` | Same as `select-one` but raises 404 when missing. | `schema`, `id` or `filter`, optional `message` |
| `count` | Return the count of records. | `schema`, optional `filter` |
| `aggregate` | Run aggregations with optional grouping. | `schema`, `aggregate`, optional `filter`/`where`, optional `groupBy` |

### Create
| Operation | Description | Requirements |
|-----------|-------------|--------------|
| `create` / `create-one` | Create a single record. | `schema`, `data` (object) |
| `create-all` | Create multiple records. | `schema`, `data` (array of objects) |

### Update
| Operation | Description | Requirements |
|-----------|-------------|--------------|
| `update` / `update-one` | Update a record by `id`. | `schema`, `id`, `data` |
| `update-all` | Update explicit records by providing `{id, ...changes}` items. | `schema`, `data` (array with `id`) |
| `update-any` | Update records matching a filter. | `schema`, `filter`, `data` |
| `update-404` | Update a single record and raise 404 if missing. | `schema`, `id` or `filter`, `data`, optional `message` |

### Delete (Soft Delete)
| Operation | Description | Requirements |
|-----------|-------------|--------------|
| `delete` / `delete-one` | Soft delete a record by `id`. | `schema`, `id` |
| `delete-all` | Soft delete explicit records. | `schema`, `data` (array with `id`) |
| `delete-any` | Soft delete records matching a filter. | `schema`, `filter` |
| `delete-404` | Soft delete a single record and raise 404 if missing. | `schema`, `id` or `filter`, optional `message` |

### Access Control
| Operation | Description | Requirements |
|-----------|-------------|--------------|
| `access` / `access-one` | Update ACL fields for a record. | `schema`, `id`, `data` |
| `access-all` | Update ACL fields for specific IDs. | `schema`, `data` (array with `id`) |
| `access-any` | Update ACL fields for records matching a filter. | `schema`, `filter`, `data` |
| `access-404` | ACL update that raises 404 when missing. | `schema`, `id` or `filter`, `data`, optional `message` |

### Unsupported
| Operation | Status |
|-----------|--------|
| `select-max` | Not implemented (returns empty array) |
| `upsert`, `upsert-one`, `upsert-all` | Not implemented (throws 422 `OPERATION_UNSUPPORTED`) |

## Validation Rules
- `create-all`, `update-all`, `delete-all`, `access-all` require `data` to be an array. `update-all`, `delete-all`, `access-all` require each element to include an `id`.
- `update-all`, `delete-all`, `access-all` reject `filter`. Use the `*-any` variants for filter-based updates.
- `update-any`, `delete-any`, `access-any` require a `filter` object.
- `aggregate` requires a non-empty `aggregate` object and does not accept `data`.
- `*-one` and `*-404` operations require an `id` unless a `filter` is provided (where supported).

## Transaction Behavior

All bulk requests execute inside a transaction created by the route (`withTransactionParams`). On success the transaction commits and results are returned in the same order as requested. Any error causes the transaction to roll back and propagates the error response—no partial writes are persisted.

## Error Responses

### Validation Errors

| Status | Error Code | Message | Condition |
|--------|------------|---------|-----------|
| 400 | `REQUEST_INVALID_FORMAT` | "Request body must contain an operations array" | Missing/invalid payload wrapper |
| 400 | `OPERATION_MISSING_FIELDS` | "Operation missing required fields" | Missing `operation` or `schema` |
| 400 | `OPERATION_MISSING_ID` | "ID required for operation" | `*-one` without `id` or array entries without `id` |
| 400 | `OPERATION_MISSING_DATA` | "Operation requires data field" | Mutation without payload |
| 400 | `OPERATION_INVALID_DATA` | "Operation requires data to be [object|array]" | Wrong payload shape or extraneous data |
| 400 | `OPERATION_MISSING_FILTER` | "Operation requires filter to be an object" | `*-any` without filter |
| 400 | `OPERATION_INVALID_FILTER` | "Operation does not support filter" | `*-all` with filter |
| 400 | `OPERATION_MISSING_AGGREGATE` | "Operation requires aggregate" | `aggregate` without spec |
| 400 | `OPERATION_INVALID_GROUP_BY` | "groupBy must be string or array" | Invalid aggregate grouping |
| 422 | `OPERATION_UNSUPPORTED` | "Unsupported operation" | Upsert / select-max |

### Authentication Errors

| Status | Error Code | Message | Condition |
|--------|------------|---------|-----------|
| 401 | `TOKEN_MISSING` | "Authorization header required" | Missing bearer token |
| 401 | `TOKEN_INVALID` | "Invalid or expired token" | Token validation failed |
| 403 | `PERMISSION_DENIED` | "Operation not authorized" | Lacking schema permission |

## Usage Examples

### Mixed Schema Operations
```bash
curl -X POST http://localhost:9001/api/bulk \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "operations": [
      {
        "operation": "create-one",
        "schema": "users",
        "data": {"name": "Jane", "email": "jane@example.com"}
      },
      {
        "operation": "access-one",
        "schema": "users",
        "id": "user-123",
        "data": {"access_read": ["user-123"]}
      },
      {
        "operation": "aggregate",
        "schema": "orders",
        "aggregate": {"total": {"$sum": "total"}},
        "filter": {"where": {"user_id": "user-123"}}
      }
    ]
  }'
```

### Batch Record Updates with Filters
```json
{
  "operations": [
    {
      "operation": "update-any",
      "schema": "orders",
      "filter": {"where": {"status": "pending", "total": {"$gte": 1000}}},
      "data": {"priority": "high"}
    },
    {
      "operation": "delete-any",
      "schema": "notifications",
      "filter": {"where": {"read": true}}
    }
  ]
}
```

### Explicit Record Updates
```json
{
  "operations": [
    {
      "operation": "update-all",
      "schema": "inventory",
      "data": [
        {"id": "product_1", "reserved": 10},
        {"id": "product_2", "reserved": 4}
      ]
    }
  ]
}
```

## Related Documentation

- **CRUD Endpoints**: [`docs/data`](../../docs/32-data-api.md)
- **Aggregation Endpoint**: [`docs/34-aggregate-api.md`](../../docs/34-aggregate-api.md)
- **Observer System**: [`docs/OBSERVERS.md`](../../docs/OBSERVERS.md)

The Bulk API delivers high-throughput, transaction-safe orchestration across schemas while preserving the Monk platform’s validation, security, and auditing guarantees.
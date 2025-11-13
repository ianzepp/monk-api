# 35-Bulk API Documentation

> **Transaction-Safe Bulk Operations**
>
> The Bulk API provides atomic, observer-aware execution for multiple database actions across schemas. All operations run inside a single transaction started by the Bulk route, guaranteeing that either every step succeeds or the entire request is rolled back.

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Core Endpoint](#core-endpoint)
4. [Payload Requirements](#payload-requirements)
5. [Supported Operations](#supported-operations)
6. [Transaction Management](#transaction-management)
7. [Error Handling](#error-handling)
8. [Performance Notes](#performance-notes)
9. [Testing](#testing)
10. [Common Use Cases](#common-use-cases)

## Overview

The Bulk API batches heterogeneous operations into a single request. Observer rings, validation, security checks, and auditing run identically to individual endpoints, but the overhead of multiple HTTP round-trips is eliminated.

### Key Capabilities
- **Atomic Transactions**: Every request runs inside a single SQL transaction with automatic rollback on failure.
- **Observer Pipeline**: Create, update, delete, access, and aggregation flows all traverse the full observer stack.
- **Mixed Operations**: Combine different schemas and operation types in one ordered payload.
- **Read + Write**: Supports read helpers (`select`, `count`, `aggregate`, etc.) alongside mutating operations.
- **Detailed Results**: Each operation returns its individual result (records, counts, aggregates, etc.).

### Current Limitations
- **Upsert Operations**: `upsert`, `upsert-one`, and `upsert-all` return `OPERATION_UNSUPPORTED`.
- **Select-Max**: `select-max` is stubbed and currently returns an empty array with a warning.
- **Parallel Execution**: Operations run sequentially in request order.

### Base URL
```
POST /api/bulk
```

## Authentication

Bulk requests require a valid JWT and inherit access controls from the individual operations that run inside the transaction.

```
Authorization: Bearer <jwt>
```

### Required Permissions
Permissions are enforced per operation:
- **Create (`create`, `create-one`, `create-all`)**: `create_data`
- **Update (`update`, `update-one`, `update-all`, `update-any`, `update-404`)**: `update_data`
- **Delete (`delete`, `delete-one`, `delete-all`, `delete-any`, `delete-404`)**: `delete_data`
- **Access (`access`, `access-one`, `access-all`, `access-any`, `access-404`)**: `update_acl`
- **Read (`select*`, `count`, `aggregate`)**: Corresponding read permission for the target schema

## Core Endpoint

### POST /api/bulk

Submit an ordered list of operations to be executed within a single transaction.

```bash
POST /api/bulk
Content-Type: application/json
Authorization: Bearer <jwt>

{
  "operations": [
    {
      "operation": "create-all",
      "schema": "users",
      "data": [
        {"name": "John Doe", "email": "john@example.com"},
        {"name": "Jane Smith", "email": "jane@example.com"}
      ]
    },
    {
      "operation": "update-any",
      "schema": "accounts",
      "filter": {"where": {"status": "pending"}},
      "data": {"status": "active"}
    },
    {
      "operation": "aggregate",
      "schema": "orders",
      "aggregate": {
        "total_orders": {"$count": "*"},
        "avg_total": {"$avg": "total"}
      },
      "groupBy": ["status"],
      "filter": {"where": {"created_at": {"$gte": "2025-01-01"}}}
    }
  ]
}
```

**Example Response**
```json
{
  "success": true,
  "data": [
    {
      "operation": "create-all",
      "schema": "users",
      "result": [
        {"id": "user_123", "name": "John Doe", ...},
        {"id": "user_124", "name": "Jane Smith", ...}
      ]
    },
    {
      "operation": "update-any",
      "schema": "accounts",
      "result": [
        {"id": "acct_1", "status": "active", ...},
        {"id": "acct_2", "status": "active", ...}
      ]
    },
    {
      "operation": "aggregate",
      "schema": "orders",
      "result": [
        {"status": "pending", "total_orders": 12, "avg_total": 180.5},
        {"status": "completed", "total_orders": 4, "avg_total": 425.0}
      ]
    }
  ]
}
```

## Payload Requirements

Each operation shares a common structure with strongly typed fields. The Bulk Processor validates shape before executing any database work.

| Field | Type | Notes |
|-------|------|-------|
| `operation` | string | Required. One of the supported operation names (hyphenated). |
| `schema` | string | Required for all database-backed operations. |
| `data` | object/array | Required for create/update/delete/access variants as noted below. |
| `filter` | object | Required for `*-any` operations; optional for read helpers (`select`, `count`, `aggregate`). |
| `id` | string | Required for `*-one` operations. |
| `aggregate` | object | Required for `aggregate`; maps aliases to aggregation specs. |
| `groupBy` | string or string[] | Optional for `aggregate`; use either a single field name or an array. |
| `message` | string | Optional custom not-found message for the `*-404` variants. |

Validation rules enforced by the Bulk Processor:
- `create-all`, `update-all`, `delete-all`, `access-all` require `data` to be an array of objects. `update-all`, `delete-all`, and `access-all` require each element to include an `id`.
- `create`, `create-one`, `update`, `update-one`, `update-any`, `update-404`, `access`, `access-one`, `access-any`, `access-404` require `data` to be an object.
- `update-any`, `delete-any`, `access-any` require a `filter` object; `update-all`, `delete-all`, `access-all` reject a `filter` (use the `*-any` variants instead).
- `aggregate` requires a non-empty `aggregate` object and does **not** accept a `data` property.

## Supported Operations

### Read Helpers
| Operation | Description | Required Fields |
|-----------|-------------|-----------------|
| `select` / `select-all` | Returns records matching an optional filter. | `schema`, optional `filter` |
| `select-one` | Returns a single record (first match). | `schema`, `id` or `filter` |
| `select-404` | Like `select-one` but throws 404 when no record is found. | `schema`, `id` or `filter` |
| `count` | Returns the count of records matching a filter. | `schema`, optional `filter` |
| `aggregate` | Runs aggregation queries with optional grouping. | `schema`, `aggregate`, optional `filter`/`where`, optional `groupBy` |

### Create Operations
| Operation | Description | Required Fields |
|-----------|-------------|-----------------|
| `create` / `create-one` | Create a single record. | `schema`, `data` (object) |
| `create-all` | Create multiple records in one observer run. | `schema`, `data` (array of objects) |

### Update Operations
| Operation | Description | Required Fields |
|-----------|-------------|-----------------|
| `update` / `update-one` | Update a single record by `id`. | `schema`, `id`, `data` |
| `update-all` | Update multiple records by supplying an array of `{id, ...changes}` objects. No filter allowed. | `schema`, `data` (array with `id`) |
| `update-any` | Update records matching a filter. | `schema`, `filter`, `data` |
| `update-404` | Update a single record and throw 404 when it does not exist. | `schema`, `filter` or `id`, `data` |

### Delete Operations (Soft Delete)
| Operation | Description | Required Fields |
|-----------|-------------|-----------------|
| `delete` / `delete-one` | Soft delete a single record by `id`. | `schema`, `id` |
| `delete-all` | Soft delete multiple records listed in `data`. | `schema`, `data` (array with `id`) |
| `delete-any` | Soft delete records matching a filter. | `schema`, `filter` |
| `delete-404` | Soft delete a single record and throw 404 when it does not exist. | `schema`, `filter` or `id` |

### Access Control Operations
| Operation | Description | Required Fields |
|-----------|-------------|-----------------|
| `access` / `access-one` | Update ACL fields (`access_read`, etc.) for a single record. | `schema`, `id`, `data` |
| `access-all` | Batch ACL updates for specific record IDs. | `schema`, `data` (array with `id` + ACL fields) |
| `access-any` | Apply ACL changes to records matching a filter. | `schema`, `filter`, `data` |
| `access-404` | ACL update that throws 404 when record not found. | `schema`, `filter` or `id`, `data` |

### Unsupported Operations
| Operation | Status | Response |
|-----------|--------|----------|
| `select-max` | Planned | Returns `[]` and logs a warning |
| `upsert`, `upsert-one`, `upsert-all` | Not implemented | Throws 422 `OPERATION_UNSUPPORTED` |

## Transaction Management

All bulk requests execute inside a transaction created by the route (`withTransactionParams`). Internally the Bulk Processor simply throws when an operation fails; the route layer consistently rolls the transaction back before returning the error response. On success the transaction is committed and the `data` array returned to the client reflects every operation’s result in request order.

## Error Handling

### Validation Errors
| Error Code | Description | Trigger |
|------------|-------------|---------|
| `REQUEST_INVALID_FORMAT` | Body missing `operations` array or not an object. | Missing top-level structure |
| `OPERATION_MISSING_FIELDS` | Missing `operation` or `schema`. | Incomplete operation entry |
| `OPERATION_MISSING_ID` | Required `id` missing or blank. | `*-one`, array entries that require `id` |
| `OPERATION_MISSING_DATA` | Required `data` missing. | Mutations without payload |
| `OPERATION_INVALID_DATA` | `data` not the expected type or provided when disallowed. | Arrays vs objects / extra `data` |
| `OPERATION_MISSING_FILTER` | Required `filter` missing. | `update-any`, `delete-any`, `access-any` |
| `OPERATION_INVALID_FILTER` | Filter supplied where not supported. | `update-all`, `delete-all`, `access-all` |
| `OPERATION_MISSING_AGGREGATE` | Aggregation spec missing/empty. | `aggregate` operations |
| `OPERATION_INVALID_GROUP_BY` | `groupBy` not a string or string array. | `aggregate` operations |
| `OPERATION_UNSUPPORTED` | Operation intentionally not implemented. | Upsert / select-max |

### Runtime Errors
The underlying database and observer layers can still raise runtime exceptions (validation errors, business logic failures, ACL violations). These bubble back as standard Monk API HTTP errors and trigger transaction rollback.

## Performance Notes

The Bulk Processor executes operations sequentially. Observer batching (for `*-all` variants) keeps pipeline overhead low for array payloads. No explicit limits are enforced at the API layer; platform limits (JSON body size, 10MB request cap, database timeouts) still apply.

## Testing

The Bulk API has shell-based tests that cover creation, rollback, and mixed-operation flows:

- `create-accounts-simple.test.sh`
- `rollback-check.test.sh`
- `rollback-mixed-operations.test.sh`

Additional tests can be added under `spec/35-bulk-api/` to cover new operations such as `update-any`, `delete-any`, and `aggregate`.

## Common Use Cases

### User Onboarding Workflow
```json
{
  "operations": [
    {
      "operation": "create-one",
      "schema": "users",
      "data": {
        "name": "New Employee",
        "email": "new.employee@company.com",
        "role": "employee"
      }
    },
    {
      "operation": "create-one",
      "schema": "accounts",
      "data": {
        "user_id": "user_123456",
        "type": "employee",
        "status": "active"
      }
    },
    {
      "operation": "access-one",
      "schema": "accounts",
      "id": "account_123456",
      "data": {
        "access_read": ["user_123456"],
        "access_edit": ["admin_user"]
      }
    }
  ]
}
```

### Data Migration Script
```json
{
  "operations": [
    {
      "operation": "update-any",
      "schema": "legacy_users",
      "filter": {"where": {"migration_status": "pending"}},
      "data": {"migration_status": "processing"}
    },
    {
      "operation": "create-all",
      "schema": "users",
      "data": [
        {"name": "Migrated User 1", "email": "user1@new.com", "legacy_id": "old_123"},
        {"name": "Migrated User 2", "email": "user2@new.com", "legacy_id": "old_456"}
      ]
    },
    {
      "operation": "delete-any",
      "schema": "legacy_users",
      "filter": {"where": {"migration_status": "processing"}}
    }
  ]
}
```

### Batch Order Analytics
```json
{
  "operations": [
    {
      "operation": "aggregate",
      "schema": "orders",
      "aggregate": {
        "total": {"$sum": "total"},
        "count": {"$count": "*"}
      },
      "groupBy": "status",
      "filter": {"where": {"created_at": {"$gte": "2025-05-01"}}}
    },
    {
      "operation": "update-any",
      "schema": "orders",
      "filter": {"where": {"status": "pending", "total": {"$gte": 1000}}},
      "data": {"priority": "high"}
    }
  ]
}
```

---

**Next: [37-File API Documentation](37-file-api.md)** – Virtual file system interface

**Previous: [33-Find API Documentation](33-find-api.md)** – Advanced search and filtering

# 35-Bulk API Documentation

> **Transaction-Safe Bulk Operations**
>
> The Bulk API provides atomic transaction processing for multiple database operations across different schemas. It supports mixed operation types with automatic rollback on failure, ensuring data consistency and integrity.

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Core Endpoint](#core-endpoint)
4. [Operation Types](#operation-types)
5. [Transaction Management](#transaction-management)
6. [Mixed Operations](#mixed-operations)
7. [Error Handling](#error-handling)
8. [Performance Optimization](#performance-optimization)
9. [Testing](#testing)
10. [Common Use Cases](#common-use-cases)

## Overview

The Bulk API provides a powerful transaction-safe interface for executing multiple database operations in a single atomic transaction. Unlike individual API calls, bulk operations ensure all-or-nothing execution with automatic rollback on any failure.

### Key Capabilities
- **Atomic Transactions**: All operations succeed or all rollback automatically
- **Mixed Operations**: Support for different operation types in single request
- **Multi-Schema Support**: Operations across multiple schemas in one transaction
- **Observer Pipeline**: Full validation, security, audit, and integration processing
- **Performance Optimized**: Efficient batch processing with connection pooling
- **Comprehensive Error Reporting**: Detailed failure information for debugging

### Base URL
```
POST /api/bulk
```

## Authentication

All Bulk API endpoints require valid JWT authentication. The API respects tenant isolation and applies appropriate permissions for each operation.

```bash
Authorization: Bearer <jwt>
```

### Required Permissions
Operations require permissions based on their type:
- **create-one/create-all**: `create_data` permission
- **update-one/update-all**: `update_data` permission
- **delete-one/delete-all**: `delete_data` permission
- **upsert-one/upsert-all**: `create_data` and `update_data` permissions

## Core Endpoint

### POST /api/bulk

Executes multiple operations in a single atomic transaction.

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
      "operation": "update-all",
      "schema": "accounts",
      "where": {"status": "pending"},
      "data": {"status": "active"}
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "operation": "create-all",
        "schema": "users",
        "status": "success",
        "data": [
          {"id": "user_123456", "name": "John Doe", "email": "john@example.com"},
          {"id": "user_123457", "name": "Jane Smith", "email": "jane@example.com"}
        ],
        "count": 2
      },
      {
        "operation": "update-all",
        "schema": "accounts",
        "status": "success",
        "data": {"updated": 15, "matched": 15}
      }
    ],
    "transaction": "committed"
  }
}
```

## Operation Types

### Create Operations

#### create-one
Creates a single record with full validation and observer processing.

```json
{
  "operation": "create-one",
  "schema": "users",
  "data": {
    "name": "New User",
    "email": "newuser@example.com",
    "status": "active"
  }
}
```

#### create-all
Creates multiple records in a single operation with bulk validation.

```json
{
  "operation": "create-all",
  "schema": "users",
  "data": [
    {"name": "User 1", "email": "user1@example.com"},
    {"name": "User 2", "email": "user2@example.com"},
    {"name": "User 3", "email": "user3@example.com"}
  ]
}
```

### Update Operations

#### update-one
Updates a single record by ID with full validation.

```json
{
  "operation": "update-one",
  "schema": "users",
  "id": "user_123456",
  "data": {
    "status": "inactive",
    "updated_at": "2025-01-01T00:00:00Z"
  }
}
```

#### update-all
Updates multiple records matching filter criteria.

```json
{
  "operation": "update-all",
  "schema": "users",
  "where": {"status": "pending", "created_at": {"$lt": "2024-12-31"}},
  "data": {
    "status": "active",
    "processed_at": "2025-01-01T00:00:00Z"
  }
}
```

### Delete Operations

#### delete-one
Soft deletes a single record by ID.

```json
{
  "operation": "delete-one",
  "schema": "users",
  "id": "user_123456"
}
```

#### delete-all
Soft deletes multiple records matching filter criteria.

```json
{
  "operation": "delete-all",
  "schema": "users",
  "where": {"status": "inactive", "last_login": {"$lt": "2023-01-01"}}
}
```

### Upsert Operations

#### upsert-one
Creates or updates a single record based on existence.

```json
{
  "operation": "upsert-one",
  "schema": "users",
  "where": {"email": "user@example.com"},
  "data": {
    "name": "Updated Name",
    "email": "user@example.com",
    "status": "active"
  }
}
```

#### upsert-all
Creates or updates multiple records in bulk.

```json
{
  "operation": "upsert-all",
  "schema": "users",
  "data": [
    {"email": "user1@example.com", "name": "User 1", "status": "active"},
    {"email": "user2@example.com", "name": "User 2", "status": "pending"}
  ],
  "conflict_columns": ["email"]
}
```

## Transaction Management

### Automatic Rollback
The Bulk API automatically rolls back all operations if any operation fails:

```json
{
  "operations": [
    {
      "operation": "create-all",
      "schema": "users",
      "data": [{"name": "Valid User", "email": "valid@example.com"}]
    },
    {
      "operation": "create-all",
      "schema": "users", 
      "data": [{"name": "Invalid User"}] // Missing required email
    }
  ]
}
```

**Response:**
```json
{
  "success": false,
  "error": {
    "type": "ValidationError",
    "message": "Validation failed for operation 2: Missing required field 'email'",
    "code": "VALIDATION_ERROR",
    "details": {
      "operation_index": 1,
      "operation_type": "create-all",
      "schema": "users",
      "errors": ["Missing required field 'email'"]
    }
  },
  "data": {
    "transaction": "rolled_back",
    "operations_completed": 0
  }
}
```

### Manual Commit Control
For advanced use cases, you can control transaction commit behavior:

```json
{
  "operations": [...],
  "transaction_options": {
    "isolation_level": "read_committed",
    "timeout": 30000,
    "retry_on_deadlock": true
  }
}
```

## Mixed Operations

### Cross-Schema Operations
Execute operations across multiple schemas in a single transaction:

```json
{
  "operations": [
    {
      "operation": "create-one",
      "schema": "users",
      "data": {"name": "John Doe", "email": "john@example.com"}
    },
    {
      "operation": "create-one",
      "schema": "accounts",
      "data": {"user_id": "user_123456", "type": "premium"}
    },
    {
      "operation": "create-all",
      "schema": "permissions",
      "data": [
        {"user_id": "user_123456", "permission": "read"},
        {"user_id": "user_123456", "permission": "write"}
      ]
    }
  ]
}
```

### Complex Business Logic
Implement sophisticated business workflows:

```json
{
  "operations": [
    {
      "operation": "update-all",
      "schema": "orders",
      "where": {"status": "pending", "total": {"$gte": 1000}},
      "data": {"status": "processing", "priority": "high"}
    },
    {
      "operation": "create-all",
      "schema": "notifications",
      "data": [
        {"type": "order_processing", "order_id": "order_123", "user_id": "user_456"}
      ]
    },
    {
      "operation": "update-one",
      "schema": "inventory",
      "id": "product_789",
      "data": {"reserved": {"$increment": 1}}
    }
  ]
}
```

## Error Handling

### Common Error Responses

#### Validation Error
```json
{
  "success": false,
  "error": {
    "type": "ValidationError",
    "message": "Validation failed for operation 2",
    "code": "VALIDATION_ERROR",
    "details": {
      "operation_index": 1,
      "operation_type": "create-all",
      "schema": "users",
      "errors": [
        "Field 'email' is required",
        "Field 'age' must be a positive number"
      ]
    }
  }
}
```

#### Transaction Error
```json
{
  "success": false,
  "error": {
    "type": "TransactionError",
    "message": "Transaction rolled back due to deadlock",
    "code": "TRANSACTION_ROLLED_BACK",
    "details": {
      "operations_attempted": 3,
      "operations_completed": 1,
      "deadlock_victim": "operation_2"
    }
  }
}
```

#### Permission Error
```json
{
  "success": false,
  "error": {
    "type": "PermissionError",
    "message": "Insufficient permissions for operation 3",
    "code": "PERMISSION_DENIED",
    "details": {
      "operation_index": 2,
      "operation_type": "delete-all",
      "schema": "users",
      "required_permission": "delete_data"
    }
  }
}
```

## Performance Optimization

### Batch Size Recommendations
- **Optimal Batch Size**: 100-500 records per create-all operation
- **Maximum Operations**: 50 operations per bulk request
- **Maximum Records**: 10,000 records per operation
- **Timeout**: 30 seconds per bulk request

### Connection Pooling
The Bulk API automatically manages database connections for optimal performance:

```json
{
  "operations": [...],
  "performance_options": {
    "batch_size": 250,
    "parallel_operations": false,
    "connection_pooling": true,
    "prepared_statements": true
  }
}
```

## Testing

The Bulk API includes comprehensive test coverage for transaction safety and rollback scenarios. Test files include:

- **create-accounts-simple.test.sh** - Basic bulk creation operations
- **rollback-check.test.sh** - Transaction rollback on validation failure
- **rollback-mixed-operations.test.sh** - Mixed operation rollback scenarios

See the test directory for detailed coverage information.

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
        "role": "employee",
        "department": "engineering"
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
      "operation": "create-all",
      "schema": "permissions",
      "data": [
        {"user_id": "user_123456", "permission": "email_access"},
        {"user_id": "user_123456", "permission": "calendar_access"},
        {"user_id": "user_123456", "permission": "file_storage_basic"}
      ]
    }
  ]
}
```

### Data Migration Script
```json
{
  "operations": [
    {
      "operation": "update-all",
      "schema": "legacy_users",
      "where": {"migration_status": "pending"},
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
      "operation": "delete-all",
      "schema": "legacy_users",
      "where": {"migration_status": "processing"}
    }
  ]
}
```

### Batch Order Processing
```json
{
  "operations": [
    {
      "operation": "update-all",
      "schema": "orders",
      "where": {
        "status": "pending",
        "payment_status": "confirmed",
        "total": {"$lte": 1000}
      },
      "data": {
        "status": "processing",
        "processed_at": "2025-01-01T12:00:00Z"
      }
    },
    {
      "operation": "create-all",
      "schema": "order_items",
      "data": [
        {"order_id": "order_123", "product_id": "prod_456", "quantity": 2},
        {"order_id": "order_123", "product_id": "prod_789", "quantity": 1}
      ]
    },
    {
      "operation": "update-all",
      "schema": "inventory",
      "where": {"product_id": {"$in": ["prod_456", "prod_789"]}},
      "data": {"reserved": {"$increment": 1}}
    }
  ]
}
```

---

**Next: [37-File API Documentation](37-file-api.md)** - Virtual file system interface

**Previous: [33-Find API Documentation](33-find-api.md)** - Advanced search and filtering
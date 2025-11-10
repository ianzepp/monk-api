# 33-Find API Documentation

> **Advanced Search and Filtering**
>
> The Find API provides enterprise-grade search and filtering capabilities through a dedicated POST endpoint. It supports 25+ operators, complex logical expressions, full-text search, and advanced query patterns optimized for performance and scalability.

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Core Endpoint](#core-endpoint)
4. [Basic Filtering](#basic-filtering)
5. [Advanced Operators](#advanced-operators)
6. [Logical Expressions](#logical-expressions)
7. [Search and Text Operations](#search-and-text-operations)
8. [Pagination and Sorting](#pagination-and-sorting)
9. [Performance Optimization](#performance-optimization)
10. [Error Handling](#error-handling)
11. [Testing](#testing)
12. [Common Use Cases](#common-use-cases)

## Overview

The Find API provides a powerful search interface that goes beyond simple filtering to support complex enterprise-level query patterns. It uses a dedicated POST endpoint to handle sophisticated filtering requirements that would be impractical with URL parameters.

### Key Capabilities
- **25+ Enterprise Operators**: Comparison, pattern matching, PostgreSQL arrays, logical operations
- **Deep Nesting**: Support for 6+ levels of logical operator nesting
- **Full-Text Search**: Advanced text search with ranking and highlighting
- **Performance Optimized**: Parameterized queries, caching, and execution plan optimization
- **Complex ACL Support**: Native PostgreSQL array operations for access control
- **Soft Delete Integration**: Automatic exclusion of deleted records with override options

### Base URL
```
POST /api/find/:schema
```

## Authentication

All Find API endpoints require valid JWT authentication. The API respects tenant isolation and record-level permissions.

```bash
Authorization: Bearer <jwt>
```

### Required Permissions
- **Search Records**: `read_data` permission
- **Access Trashed Records**: `delete_data` permission (for include_trashed parameter)

## Core Endpoint

### POST /api/find/:schema

The primary search endpoint that accepts complex filter objects in the request body.

```bash
POST /api/find/users
Content-Type: application/json
Authorization: Bearer <jwt>

{
  "where": {
    "status": "active",
    "age": {"$gte": 18}
  },
  "limit": 10,
  "order": ["created_at desc"]
}
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "user_123456",
      "name": "John Doe",
      "email": "john@example.com",
      "status": "active",
      "age": 25,
      "created_at": "2025-01-01T12:00:00.000Z"
    },
    {
      "id": "user_123457",
      "name": "Jane Smith",
      "email": "jane@example.com",
      "status": "active",
      "age": 32,
      "created_at": "2025-01-01T11:00:00.000Z"
    }
  ],
  "count": 2
}
```

## Basic Filtering

### Simple Equality
```json
{
  "where": {
    "status": "active",
    "role": "admin"
  }
}
```

### Null Handling
```json
{
  "where": {
    "email": null,
    "phone": {"$ne": null}
  }
}
```

### Multiple Values (OR)
```json
{
  "where": {
    "status": {"$in": ["active", "pending"]}
  }
}
```

## Advanced Operators

### Comparison Operators
```json
{
  "where": {
    "age": {"$gt": 18, "$lt": 65},
    "score": {"$gte": 80},
    "price": {"$lte": 999.99}
  }
}
```

### Pattern Matching
```json
{
  "where": {
    "name": {"$like": "John%"},
    "email": {"$like": "%@gmail.com"},
    "username": {"$nlike": "temp_%"}
  }
}
```

### Array Operations
```json
{
  "where": {
    "tags": {"$contains": ["urgent", "important"]},
    "categories": {"$overlap": ["tech", "software"]},
    "permissions": {"$size": 3}
  }
}
```

### Existence Checks
```json
{
  "where": {
    "profile": {"$exists": true},
    "deleted_at": {"$exists": false}
  }
}
```

## Logical Expressions

### AND Operations (Default)
```json
{
  "where": {
    "status": "active",
    "age": {"$gte": 21},
    "country": "US"
  }
}
```

### OR Operations
```json
{
  "where": {
    "$or": [
      {"status": "active", "age": {"$gte": 18}},
      {"role": "admin"},
      {"vip": true}
    ]
  }
}
```

### Complex Nested Logic
```json
{
  "where": {
    "$and": [
      {"status": "active"},
      {"$or": [
        {"age": {"$gte": 18, "$lte": 25}},
        {"role": "senior"},
        {"$and": [
          {"experience": {"$gte": 5}},
          {"skills": {"$contains": ["leadership"]}}
        ]}
      ]}
    ]
  }
}
```

### NOT Operations
```json
{
  "where": {
    "$not": {
      "status": "inactive",
      "role": "guest"
    }
  }
}
```

## Search and Text Operations

### Full-Text Search
```json
{
  "where": {
    "$search": {
      "fields": ["title", "content", "description"],
      "query": "machine learning artificial intelligence",
      "operator": "and"
    }
  }
}
```

### Text Pattern Matching
```json
{
  "where": {
    "bio": {"$text": "engineer developer"},
    "title": {"$regex": "^(Senior|Lead|Principal)"}
  }
}
```

## Pagination and Sorting

### Basic Pagination
```json
{
  "where": {"status": "active"},
  "limit": 20,
  "offset": 40
}
```

### Advanced Sorting
```json
{
  "where": {"status": "active"},
  "order": [
    "priority desc",
    "created_at asc",
    "name asc"
  ],
  "limit": 50
}
```

### Cursor-Based Pagination
```json
{
  "where": {"status": "active"},
  "limit": 25,
  "after": "user_123456"
}
```

## Performance Optimization

### Query Planning
```json
{
  "where": {
    "status": "active",
    "created_at": {"$gte": "2024-01-01"}
  },
  "limit": 100,
  "explain": true
}
```

### Index Hints
```json
{
  "where": {
    "email": {"$like": "%@company.com"},
    "status": "active"
  },
  "hint": ["email_status_idx"]
}
```

### Parameter Limits
- **Maximum Parameters**: 500 per query
- **Maximum Array Size**: 200 elements
- **Maximum Nesting Depth**: 6 levels
- **Maximum OR Conditions**: 100 per level

## Soft Delete Integration

### Automatic Exclusion
All Find API queries automatically exclude soft-deleted and permanently deleted records:

```sql
WHERE trashed_at IS NULL AND deleted_at IS NULL AND (user_conditions)
```

### Override Options
```json
{
  "where": {"status": "active"},
  "include_trashed": true
}
```

```json
{
  "where": {"status": "active"},
  "include_deleted": true
}
```

```json
{
  "where": {"status": "active"},
  "include_trashed": true,
  "include_deleted": true
}
```

## Error Handling

### Common Error Responses

#### Invalid Operator
```json
{
  "success": false,
  "error": {
    "type": "FilterError",
    "message": "Invalid operator '$invalid' for field 'status'",
    "code": "INVALID_OPERATOR"
  }
}
```

#### Malformed Query
```json
{
  "success": false,
  "error": {
    "type": "FilterError",
    "message": "Malformed filter structure at path 'where.$or[1]'",
    "code": "MALFORMED_QUERY"
  }
}
```

#### Parameter Limit Exceeded
```json
{
  "success": false,
  "error": {
    "type": "FilterError",
    "message": "Query exceeds maximum parameter limit of 500",
    "code": "PARAMETER_LIMIT_EXCEEDED"
  }
}
```

## Testing

The Find API includes comprehensive test coverage for all filtering scenarios. See the [test README](../spec/33-find-api/README.md) for detailed test coverage information.

## Common Use Cases

### User Search with Multiple Criteria
```json
{
  "where": {
    "$and": [
      {"status": "active"},
      {"$or": [
        {"name": {"$like": "%John%"}},
        {"email": {"$like": "%john%"}}
      ]},
      {"role": {"$in": ["admin", "moderator", "user"]}}
    ]
  },
  "limit": 20,
  "order": ["last_login desc"]
}
```

### Content Filtering by Date and Category
```json
{
  "where": {
    "published": true,
    "published_at": {"$gte": "2024-01-01", "$lte": "2024-12-31"},
    "category": {"$in": ["tech", "science", "engineering"]},
    "tags": {"$contains": ["ai", "machine-learning"]}
  },
  "limit": 50,
  "order": ["published_at desc"]
}
```

### Administrative Search with Access Control
```json
{
  "where": {
    "$or": [
      {"department": "engineering", "access_level": {"$gte": 5}},
      {"department": "management"},
      {"role": "admin"}
    ],
    "permissions": {"$contains": ["read", "write", "delete"]},
    "last_audit": {"$gte": "2024-01-01"}
  },
  "include_trashed": true,
  "limit": 100
}
```

### E-commerce Product Search
```json
{
  "where": {
    "active": true,
    "inventory": {"$gt": 0},
    "price": {"$gte": 10, "$lte": 500},
    "$or": [
      {"name": {"$search": {"query": "laptop notebook", "operator": "or"}}},
      {"description": {"$search": {"query": "portable computer", "operator": "and"}}}
    ],
    "category": {"$in": ["electronics", "computers", "accessories"]},
    "rating": {"$gte": 4.0}
  },
  "limit": 25,
  "order": ["rating desc", "price asc"]
}
```

---

**Next: [35-Bulk API Documentation](35-bulk-api.md)** - Transaction-safe bulk operations

**Previous: [32-Data API Documentation](32-data-api.md)** - Core CRUD operations and data management
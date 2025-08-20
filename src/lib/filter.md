# Filter Class Documentation

MongoDB-style query DSL for dynamic schema filtering with full logical operator support.

## Basic Usage

```typescript
import { Filter } from './filter.js';
import { System } from './system.ts';

const system = new System(/* ... hono context required here */);
const filter = new Filter(system, 'user', 'users');
filter.assign({
    where: { status: 'active' },
    select: ['name', 'email'],
    order: [{ created_at: 'desc' }],
    limit: 50
});

const results = await filter.execute();
```

## Input Formats

### Automatic Conversions

```typescript
// Single UUID → ID lookup
filter.assign('123e4567-e89b-12d3-a456-426614174000');
// Converts to: { where: { id: 'uuid' } }

// Array of UUIDs → $in lookup  
filter.assign(['uuid1', 'uuid2', 'uuid3']);
// Converts to: { where: { id: { $in: ['uuid1', 'uuid2', 'uuid3'] } } }

// Plain string → name lookup
filter.assign('john-doe');
// Converts to: { where: { name: 'john-doe' } }

// Empty array → no conditions
filter.assign([]);
// No filters applied
```

## Comparison Operators

### Basic Operators
```json
{
  "where": {
    "name": "John",                    // Equality (implicit $eq)
    "age": { "$eq": 25 },             // Explicit equality
    "status": { "$ne": "inactive" },   // Not equal
    "score": { "$neq": 0 }            // Not equal (alias)
  }
}
```

### Numeric Comparisons
```json
{
  "where": {
    "age": { "$gt": 18 },             // Greater than
    "score": { "$gte": 80 },          // Greater than or equal
    "weight": { "$lt": 200 },         // Less than  
    "height": { "$lte": 180 }         // Less than or equal
  }
}
```

### Range Queries
```json
{
  "where": {
    "age": { "$gte": 18, "$lt": 65 }  // 18 <= age < 65
  }
}
```

## Pattern Matching

### String Patterns
```json
{
  "where": {
    "email": { "$like": "%@company.com" },    // Case-sensitive LIKE
    "name": { "$ilike": "%john%" },           // Case-insensitive LIKE
    "username": { "$regex": "^admin_" }       // Regular expression (if implemented)
  }
}
```

## Array Operations

### Inclusion/Exclusion
```json
{
  "where": {
    "status": { "$in": ["active", "pending", "approved"] },
    "role": { "$nin": ["banned", "suspended"] }
  }
}
```

## Logical Operators

### AND (Implicit and Explicit)
```json
{
  "where": {
    "status": "active",               // Implicit AND
    "age": { "$gte": 18 },           // All top-level conditions are AND-ed
    "$and": [                        // Explicit AND grouping
      { "department": "engineering" },
      { "level": { "$gte": 5 } }
    ]
  }
}
```

### OR Conditions
```json
{
  "where": {
    "$or": [
      { "role": "admin" },
      { "role": "moderator" },
      { "age": { "$gte": 65 } }
    ]
  }
}
```

### NOT Conditions
```json
{
  "where": {
    "$not": {
      "status": "banned"
    }
  }
}
```

### Complex Nested Logic
```json
{
  "where": {
    "domain": "production",
    "$or": [
      {
        "$and": [
          { "role": "admin" },
          { "department": "security" }
        ]
      },
      {
        "$and": [
          { "role": "manager" },
          { "years_experience": { "$gte": 10 } }
        ]
      }
    ]
  }
}
```

**Generated SQL**:
```sql
WHERE "domain" = 'production' 
  AND (
    ("role" = 'admin' AND "department" = 'security') 
    OR 
    ("role" = 'manager' AND "years_experience" >= 10)
  )
```

## Field Selection

### Select Specific Fields
```json
{
  "select": ["id", "name", "email"]
}
```
**Generated SQL**: `SELECT "id", "name", "email"`

### Select All Fields
```json
{
  "select": ["*"]
}
```
**Generated SQL**: `SELECT *`

### Default Behavior
```json
{}
```
**Generated SQL**: `SELECT *` (default when no select specified)

## Sorting

### Single Column
```json
{
  "order": [{ "name": "asc" }]
}
```

### Multiple Columns
```json
{
  "order": [
    { "name": "asc" },
    { "created_at": "desc" },
    { "priority": "asc" }
  ]
}
```

### String Format
```json
{
  "order": ["name asc", "age desc"]
}
```

### Default Direction
```json
{
  "order": ["name"]  // Defaults to ASC
}
```

## Pagination

```json
{
  "limit": 50,
  "offset": 100
}
```
**Generated SQL**: `LIMIT 50 OFFSET 100`

## Data Type Handling

### Automatic Type Detection
```json
{
  "where": {
    "name": "O'Malley",              // String (auto-escaped)
    "age": 25,                       // Number (no quotes)
    "is_active": true,               // Boolean
    "description": null,             // NULL
    "tags": ["red", "blue"]          // Array (for $in/$nin)
  }
}
```

**Generated SQL**:
```sql
WHERE "name" = 'O''Malley' 
  AND "age" = 25 
  AND "is_active" = true 
  AND "description" = NULL
```

## Complete Example

```json
{
  "select": ["id", "name", "email", "role"],
  "where": {
    "domain": "company",
    "$or": [
      {
        "$and": [
          { "role": "admin" },
          { "department": { "$in": ["IT", "Security"] } }
        ]
      },
      {
        "seniority_level": { "$gte": 8 }
      }
    ],
    "status": { "$ne": "suspended" },
    "last_login": { "$gte": "2024-01-01" }
  },
  "order": [
    { "role": "asc" },
    { "last_login": "desc" }
  ],
  "limit": 25,
  "offset": 0
}
```

**Generated SQL**:
```sql
SELECT "id", "name", "email", "role" 
FROM "users" 
WHERE "domain" = 'company' 
  AND (
    ("role" = 'admin' AND "department" IN ('IT', 'Security')) 
    OR 
    "seniority_level" >= 8
  ) 
  AND "status" != 'suspended' 
  AND "last_login" >= '2024-01-01' 
ORDER BY "role" ASC, "last_login" DESC 
LIMIT 25 OFFSET 0
```

## Current Limitations

### Not Yet Implemented
- **$regex/$nregex**: Regular expression matching
- **$exists/$null**: Field existence checking  
- **$any/$all/$nany/$nall**: Advanced array operations
- **$find/$text**: Full-text search operations
- **Lookups/Related**: Cross-schema relationship queries

### Logical Operator Edge Cases
- **Empty logical arrays**: `{ "$or": [] }` behavior undefined
- **Single-child logic**: `{ "$or": [condition] }` may add unnecessary parentheses
- **Deeply nested logic**: Performance may degrade with very deep nesting

### SQL Injection Prevention
- **String escaping**: Single quotes are escaped (`'` → `''`)
- **Column names**: Quoted with double quotes for safety
- **No raw SQL injection**: All values are properly formatted

### Performance Considerations
- **Large IN arrays**: No limit on array size, may hit PostgreSQL limits
- **Complex nesting**: Deep logical trees may generate complex SQL
- **No query optimization**: Relies on PostgreSQL query planner

## Architecture

### Internal Structure
- **Tree-based conditions**: Supports arbitrary logical nesting
- **Legacy compatibility**: Maintains backward compatibility with flat structure
- **Dynamic table support**: Works with runtime-created schemas
- **Type safety**: Full TypeScript support throughout

### Extension Points
- **Add new operators**: Extend `FilterOp` enum and `_buildConditionSQL()`
- **Custom logic**: Override logical operators in `_buildLogicalSQL()`
- **Validation**: Add input validation in assignment methods
- **Optimization**: Add query analysis and optimization layers

This Filter implementation provides enterprise-grade querying capabilities while maintaining a clean, familiar MongoDB-style external interface.
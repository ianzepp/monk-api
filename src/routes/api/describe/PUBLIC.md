# Describe API

The Describe API provides schema definition and management capabilities using Monk-native format with direct PostgreSQL type mapping. Create, update, and manage database table structures with column-level precision.

## Base Path
All Describe API routes are prefixed with `/api/describe`

## Endpoint Summary

### Schema Operations

| Method | Path | Description |
|--------|------|-------------|
| GET | [`/api/describe`](GET.md) | List all available schema names |
| GET | [`/api/describe/:schema`](:schema/GET.md) | Retrieve schema metadata |
| POST | [`/api/describe/:schema`](:schema/POST.md) | Create a new schema |
| PUT | [`/api/describe/:schema`](:schema/PUT.md) | Update schema metadata |
| DELETE | [`/api/describe/:schema`](:schema/DELETE.md) | Soft-delete a schema |

### Column Operations

| Method | Path | Description |
|--------|------|-------------|
| GET | [`/api/describe/:schema/:column`](:schema/:column/GET.md) | Retrieve column definition |
| POST | [`/api/describe/:schema/:column`](:schema/:column/POST.md) | Add a new column to schema |
| PUT | [`/api/describe/:schema/:column`](:schema/:column/PUT.md) | Update column properties |
| DELETE | [`/api/describe/:schema/:column`](:schema/:column/DELETE.md) | Remove column from schema |

## Content Type
- **Request**: `application/json`
- **Response**: `application/json`

## Authentication Required
All endpoints require a valid JWT token in the Authorization header: `Bearer <token>`

---

## Quick Start

### Creating a Schema with Columns

```bash
# Step 1: Create schema
curl -X POST http://localhost:9001/api/describe/users \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "schema_name": "users",
    "status": "pending"
  }'

# Step 2: Add name column
curl -X POST http://localhost:9001/api/describe/users/name \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "text",
    "required": true,
    "description": "User full name"
  }'

# Step 3: Add email column
curl -X POST http://localhost:9001/api/describe/users/email \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "text",
    "required": true,
    "unique": true,
    "pattern": "^[^@]+@[^@]+\\.[^@]+$",
    "index": true,
    "description": "User email address"
  }'

# Step 4: Activate schema
curl -X PUT http://localhost:9001/api/describe/users \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "active"}'
```

---

## Schema Reference

### Schema Fields

All fields available when creating or updating schemas:

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `schema_name` | text | Yes | - | Unique identifier for the schema. Must match URL parameter. |
| `status` | text | No | `pending` | Schema status: `pending`, `active`, or `system`. |
| `description` | text | No | - | Human-readable description of the schema's purpose. |
| `sudo` | boolean | No | `false` | Require sudo token for all data operations on this schema. |
| `freeze` | boolean | No | `false` | Prevent all data changes (create, update, delete). SELECT still works. |
| `immutable` | boolean | No | `false` | Records are write-once: can be created but never modified. |

**Notes:**
- System fields (id, timestamps, access_*) are automatically added to all tables
- `schema_name` must be a valid PostgreSQL identifier (alphanumeric and underscores)
- Schemas with `status='system'` cannot be modified or deleted

### Column Fields

All fields available when creating or updating columns:

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| **Identity** |
| `type` | text | Yes | - | Data type: `text`, `integer`, `decimal`, `boolean`, `timestamp`, `date`, `uuid`, `jsonb`, or array types. See [type mapping](#postgresql-type-mapping). |
| **Constraints** |
| `required` | boolean | No | `false` | Whether the column is required (NOT NULL constraint). |
| `default_value` | text | No | - | Default value for the column. |
| `unique` | boolean | No | `false` | Whether the column must have unique values. Creates UNIQUE index. |
| **Validation** |
| `minimum` | numeric | No | - | Minimum value for numeric types. Application-level validation. |
| `maximum` | numeric | No | - | Maximum value for numeric types or max length for text. |
| `pattern` | text | No | - | Regular expression pattern for text validation. |
| `enum_values` | text[] | No | - | Array of allowed values. Application-level validation. |
| **Metadata** |
| `description` | text | No | - | Human-readable description of the column's purpose. |
| **Protection** |
| `immutable` | boolean | No | `false` | Value can be set once but never changed. Perfect for audit trails. |
| `sudo` | boolean | No | `false` | Require sudo token to modify this field. |
| **Indexing & Search** |
| `index` | boolean | No | `false` | Create standard btree index on this column for faster queries. |
| `searchable` | boolean | No | `false` | Enable full-text search with GIN index. For text columns only. |
| **Change Tracking** |
| `tracked` | boolean | No | `false` | Track changes to this column in the `history` table. |
| **Data Transform** |
| `transform` | text | No | - | Auto-transform values: `lowercase`, `uppercase`, `trim`, `normalize_phone`, `normalize_email`. |
| **Relationships** |
| `relationship_type` | text | No | - | Type of relationship: `owned` or `referenced`. |
| `related_schema` | text | No | - | Target schema for the relationship. |
| `related_column` | text | No | `id` | Target column for the relationship (usually `id`). |
| `relationship_name` | text | No | - | Name of the relationship for API access. |
| `cascade_delete` | boolean | No | `false` | Whether to cascade delete when parent is deleted. |
| `required_relationship` | boolean | No | `false` | Whether the relationship is required (NOT NULL FK). |

**Notes:**
- `schema_name` and `column_name` come from URL parameters, not request body
- **Structural changes** (trigger ALTER TABLE): `type`, `required`, `default_value`, `unique`, `index`, `searchable`
- **Metadata-only**: `description`, `pattern`, `minimum`, `maximum`, `enum_values`, `immutable`, `sudo`, `tracked`, `transform`
- Column names must start with a letter or underscore, followed by alphanumerics/underscores

---

## PostgreSQL Type Mapping

User-facing types are mapped to PostgreSQL types internally:

| User Type | PostgreSQL Type | Use Case |
|-----------|-----------------|----------|
| `text` | TEXT | General strings |
| `integer` | INTEGER | Whole numbers |
| `decimal` | NUMERIC | Precise decimals, currency |
| `boolean` | BOOLEAN | True/false values |
| `timestamp` | TIMESTAMP WITH TIME ZONE | Date and time with timezone |
| `date` | DATE | Date only |
| `uuid` | UUID | Unique identifiers |
| `jsonb` | JSONB | JSON data structures |
| `text[]` | TEXT[] | Array of strings |
| `integer[]` | INTEGER[] | Array of integers |
| `decimal[]` | NUMERIC[] | Array of decimals |
| `uuid[]` | UUID[] | Array of UUIDs |

**Note:** Use user-facing types (e.g., `decimal`) in API requests. The system automatically maps them to appropriate PostgreSQL types (e.g., `NUMERIC`).

## System Fields

All schemas automatically include system-managed fields:

| Field | Type | Purpose |
|-------|------|---------|
| `id` | UUID | Primary key (auto-generated) |
| `access_read` | UUID[] | Read access control list |
| `access_edit` | UUID[] | Edit access control list |
| `access_full` | UUID[] | Full access control list |
| `access_deny` | UUID[] | Deny access control list |
| `created_at` | TIMESTAMP | Record creation time |
| `updated_at` | TIMESTAMP | Last modification time |
| `trashed_at` | TIMESTAMP | Soft delete timestamp |
| `deleted_at` | TIMESTAMP | Hard delete timestamp |

**Do not define these fields in your schemas** - they are automatically added.

## Schema Protection Features

### System Schema Protection
System schemas (`status='system'`) cannot be modified or deleted:
- `schemas` - Schema metadata registry
- `users` - User account management
- `columns` - Column metadata table
- `history` - Change tracking and audit trails

### Sudo-Protected Schemas
Schemas marked with `sudo=true` require a short-lived sudo token for all data operations. Users must call `POST /api/user/sudo` to obtain the token before modifying these schemas.

**Use case**: Protect critical system schemas from accidental modifications.

### Frozen Schemas
Schemas marked with `freeze=true` prevent ALL data changes (create, update, delete). SELECT operations continue to work normally.

**Use cases**:
- Emergency lockdowns during security incidents
- Maintenance windows requiring read-only access
- Regulatory compliance freeze periods

### Immutable Schemas
Schemas marked with `immutable=true` allow records to be created but never modified or deleted. Write-once data pattern.

**Use cases**:
- Audit logs and compliance trails that must never change
- Transaction history and financial records
- Event logs and time-series data
- Append-only ledgers

**Note:** Unlike `freeze`, immutable schemas still allow INSERT operations. Only UPDATE and DELETE are prevented.

### Field-Level Protection

**Immutable Fields**: Fields marked with `immutable=true` can be set once but never changed. Perfect for audit trails and write-once data like transaction IDs.

**Sudo-Protected Fields**: Fields marked with `sudo=true` require a sudo token to modify, even if the schema itself doesn't require sudo. Allows fine-grained protection of sensitive fields like salary or pricing information.

## Related Documentation

- **Data Operations**: `/docs/data` - CRUD operations on schema records
- **Bulk Operations**: `/docs/bulk` - Batch operations across schemas
- **Advanced Search**: `/docs/find` - Complex queries with filtering
- **History API**: `/docs/history` - Change tracking and audit trails

The Describe API provides the foundation for all data operations by defining database structure with Monk-native format and direct PostgreSQL mapping.

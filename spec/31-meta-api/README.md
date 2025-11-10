# 31-Meta API: Schema Management API Tests

Tests for the Meta API (Describe API) endpoints handling JSON schema operations and metadata management.

**Scope:**
- Schema creation and management
- JSON Schema validation and DDL generation
- Schema lifecycle operations (CRUD)
- Column metadata and population
- Relationship definition and validation
- Schema protection mechanisms
- Nested relationship discovery

**Test Focus:**
- Schema creation from JSON with various field types and constraints
- Schema retrieval, listing, and metadata extraction
- Schema updates and structural modifications
- Schema deletion and soft delete functionality
- Column population and metadata accuracy
- Relationship types (belongs_to, has_many, many_to_many)
- Nested relationship traversal and data integrity
- System schema protection and permission validation
- Schema caching and performance optimization

**Test Files:**
- `create-schema.test.sh` - Basic schema creation and validation
- `select-schema.test.sh` - Schema retrieval and listing operations
- `update-schema.test.sh` - Schema modification and DDL updates
- `delete-schema.test.sh` - Schema deletion and soft delete functionality
- `columns-population.test.sh` - Column metadata extraction and population
- `nested-relationships.test.sh` - Complex nested relationship testing
- `relationship-types.test.sh` - Various relationship type validation

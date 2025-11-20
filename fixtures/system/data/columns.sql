-- ============================================================================
-- DATA: Column definitions for system schemas
-- ============================================================================
-- These define the portable (non-system) columns for core schemas
-- System fields (id, access_*, created_at, etc.) are automatically added
-- to all tables and should NOT be included here

-- ============================================================================
-- COLUMNS FOR: schemas
-- ============================================================================
INSERT INTO "columns" (schema_name, column_name, type, required, default_value, description) VALUES
    ('schemas', 'schema_name', 'text', true, NULL, 'Unique name for the schema'),
    ('schemas', 'status', 'text', false, 'active', 'Schema status (active, disabled, system)'),
    ('schemas', 'description', 'text', false, NULL, 'Human-readable description of the schema'),
    ('schemas', 'sudo', 'boolean', false, NULL, 'Whether schema modifications require sudo access'),
    ('schemas', 'frozen', 'boolean', false, NULL, 'Whether all data changes are prevented on this schema'),
    ('schemas', 'immutable', 'boolean', false, NULL, 'Whether records are write-once (can be created but never modified)');

-- ============================================================================
-- COLUMNS FOR: columns
-- ============================================================================
INSERT INTO "columns" (schema_name, column_name, type, required, description) VALUES
    ('columns', 'schema_name', 'text', true, 'Name of the schema this column belongs to'),
    ('columns', 'column_name', 'text', true, 'Name of the column'),
    ('columns', 'type', 'text', true, 'Data type of the column'),
    ('columns', 'required', 'boolean', false, 'Whether the column is required (NOT NULL)'),
    ('columns', 'default_value', 'text', false, 'Default value for the column'),
    ('columns', 'description', 'text', false, 'Human-readable description of the column'),
    ('columns', 'relationship_type', 'text', false, 'Type of relationship (owned, referenced)'),
    ('columns', 'related_schema', 'text', false, 'Related schema for relationships'),
    ('columns', 'related_column', 'text', false, 'Related column for relationships'),
    ('columns', 'relationship_name', 'text', false, 'Name of the relationship'),
    ('columns', 'cascade_delete', 'boolean', false, 'Whether to cascade delete on relationship'),
    ('columns', 'required_relationship', 'boolean', false, 'Whether the relationship is required'),
    ('columns', 'minimum', 'numeric', false, 'Minimum value constraint for numeric columns'),
    ('columns', 'maximum', 'numeric', false, 'Maximum value constraint for numeric columns'),
    ('columns', 'pattern', 'text', false, 'Regular expression pattern for validation'),
    ('columns', 'enum_values', 'text[]', false, 'Allowed enum values'),
    ('columns', 'is_array', 'boolean', false, 'Whether the column is an array type'),
    ('columns', 'immutable', 'boolean', false, 'Whether the column value cannot be changed once set'),
    ('columns', 'sudo', 'boolean', false, 'Whether modifying this column requires sudo access'),
    ('columns', 'unique', 'boolean', false, 'Whether the column must have unique values'),
    ('columns', 'index', 'boolean', false, 'Whether to create a standard btree index on this column'),
    ('columns', 'tracked', 'boolean', false, 'Whether changes to this column are tracked in history'),
    ('columns', 'searchable', 'boolean', false, 'Whether to enable full-text search with GIN index'),
    ('columns', 'transform', 'text', false, 'Auto-transform values: lowercase, uppercase, trim, normalize_phone, normalize_email');

-- ============================================================================
-- COLUMNS FOR: users
-- ============================================================================
INSERT INTO "columns" (schema_name, column_name, type, required, description) VALUES
    ('users', 'name', 'text', true, 'User display name'),
    ('users', 'auth', 'text', true, 'Authentication identifier'),
    ('users', 'access', 'text', true, 'User access level (root, full, edit, read, deny)');

-- ============================================================================
-- COLUMNS FOR: history
-- ============================================================================
INSERT INTO "columns" (schema_name, column_name, type, required, description) VALUES
    ('history', 'change_id', 'bigserial', true, 'Auto-incrementing change identifier for ordering'),
    ('history', 'schema_name', 'text', true, 'Name of the schema where the change occurred'),
    ('history', 'record_id', 'uuid', true, 'ID of the record that was changed'),
    ('history', 'operation', 'text', true, 'Operation type: create, update, or delete'),
    ('history', 'changes', 'jsonb', true, 'Field-level changes with old and new values'),
    ('history', 'created_by', 'uuid', false, 'ID of the user who made the change'),
    ('history', 'request_id', 'text', false, 'Request correlation ID for tracing'),
    ('history', 'metadata', 'jsonb', false, 'Additional context (IP address, user agent, etc.)');

-- ============================================================================
-- COLUMNS FOR: snapshots
-- ============================================================================
INSERT INTO "columns" (schema_name, column_name, type, required, description) VALUES
    ('snapshots', 'name', 'text', true, 'Snapshot identifier'),
    ('snapshots', 'database', 'text', true, 'PostgreSQL database name (format: snapshot_{random})'),
    ('snapshots', 'description', 'text', false, 'Optional description of snapshot purpose'),
    ('snapshots', 'status', 'text', true, 'Processing status: pending, processing, active, failed'),
    ('snapshots', 'snapshot_type', 'text', true, 'Type: manual, auto, pre_migration, scheduled'),
    ('snapshots', 'size_bytes', 'bigint', false, 'Snapshot database size in bytes'),
    ('snapshots', 'record_count', 'integer', false, 'Total records at snapshot time'),
    ('snapshots', 'error_message', 'text', false, 'Error details if status is failed'),
    ('snapshots', 'created_by', 'uuid', true, 'User who created the snapshot'),
    ('snapshots', 'expires_at', 'timestamp', false, 'Retention policy expiration time');

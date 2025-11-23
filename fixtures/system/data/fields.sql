-- ============================================================================
-- DATA: Field definitions for system models
-- ============================================================================
-- These define the portable (non-system) fields for core models
-- System fields (id, access_*, created_at, etc.) are automatically added
-- to all tables and should NOT be included here

-- ============================================================================
-- FIELDS FOR: models
-- ============================================================================
INSERT INTO "fields" (model_name, field_name, type, required, default_value, description) VALUES
    ('models', 'model_name', 'text', true, NULL, 'Unique name for the model'),
    ('models', 'status', 'text', false, 'active', 'Model status (active, disabled, system)'),
    ('models', 'description', 'text', false, NULL, 'Human-readable description of the model'),
    ('models', 'sudo', 'boolean', false, NULL, 'Whether model modifications require sudo access'),
    ('models', 'frozen', 'boolean', false, NULL, 'Whether all data changes are prevented on this model'),
    ('models', 'immutable', 'boolean', false, NULL, 'Whether records are write-once (can be created but never modified)'),
    ('models', 'external', 'boolean', false, NULL, 'Whether model is managed externally (skip DDL operations)');

-- ============================================================================
-- FIELDS FOR: fields
-- ============================================================================
INSERT INTO "fields" (model_name, field_name, type, required, description) VALUES
    ('fields', 'model_name', 'text', true, 'Name of the model this field belongs to'),
    ('fields', 'field_name', 'text', true, 'Name of the field'),
    ('fields', 'type', 'text', true, 'Data type of the field'),
    ('fields', 'required', 'boolean', false, 'Whether the field is required (NOT NULL)'),
    ('fields', 'default_value', 'text', false, 'Default value for the field'),
    ('fields', 'description', 'text', false, 'Human-readable description of the field'),
    ('fields', 'relationship_type', 'text', false, 'Type of relationship (owned, referenced)'),
    ('fields', 'related_model', 'text', false, 'Related model for relationships'),
    ('fields', 'related_field', 'text', false, 'Related field for relationships'),
    ('fields', 'relationship_name', 'text', false, 'Name of the relationship'),
    ('fields', 'cascade_delete', 'boolean', false, 'Whether to cascade delete on relationship'),
    ('fields', 'required_relationship', 'boolean', false, 'Whether the relationship is required'),
    ('fields', 'minimum', 'numeric', false, 'Minimum value constraint for numeric fields'),
    ('fields', 'maximum', 'numeric', false, 'Maximum value constraint for numeric fields'),
    ('fields', 'pattern', 'text', false, 'Regular expression pattern for validation'),
    ('fields', 'enum_values', 'text[]', false, 'Allowed enum values'),
    ('fields', 'is_array', 'boolean', false, 'Whether the field is an array type'),
    ('fields', 'immutable', 'boolean', false, 'Whether the field value cannot be changed once set'),
    ('fields', 'sudo', 'boolean', false, 'Whether modifying this field requires sudo access'),
    ('fields', 'unique', 'boolean', false, 'Whether the field must have unique values'),
    ('fields', 'index', 'boolean', false, 'Whether to create a standard btree index on this field'),
    ('fields', 'tracked', 'boolean', false, 'Whether changes to this field are tracked in history'),
    ('fields', 'searchable', 'boolean', false, 'Whether to enable full-text search with GIN index'),
    ('fields', 'transform', 'text', false, 'Auto-transform values: lowercase, uppercase, trim, normalize_phone, normalize_email');

-- ============================================================================
-- FIELDS FOR: users
-- ============================================================================
INSERT INTO "fields" (model_name, field_name, type, required, description) VALUES
    ('users', 'name', 'text', true, 'User display name'),
    ('users', 'auth', 'text', true, 'Authentication identifier'),
    ('users', 'access', 'text', true, 'User access level (root, full, edit, read, deny)');

-- ============================================================================
-- FIELDS FOR: history
-- ============================================================================
INSERT INTO "fields" (model_name, field_name, type, required, description) VALUES
    ('history', 'change_id', 'bigserial', true, 'Auto-incrementing change identifier for ordering'),
    ('history', 'model_name', 'text', true, 'Name of the model where the change occurred'),
    ('history', 'record_id', 'uuid', true, 'ID of the record that was changed'),
    ('history', 'operation', 'text', true, 'Operation type: create, update, or delete'),
    ('history', 'changes', 'jsonb', true, 'Field-level changes with old and new values'),
    ('history', 'created_by', 'uuid', false, 'ID of the user who made the change'),
    ('history', 'request_id', 'text', false, 'Request correlation ID for tracing'),
    ('history', 'metadata', 'jsonb', false, 'Additional context (IP address, user agent, etc.)');

-- ============================================================================
-- FIELDS FOR: snapshots
-- ============================================================================
INSERT INTO "fields" (model_name, field_name, type, required, description) VALUES
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

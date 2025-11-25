-- ============================================================================
-- DATA: Fields model registration and field definitions
-- ============================================================================
-- Register the fields table and define metadata for all system models

-- Register fields model
INSERT INTO "models" (model_name, status, sudo)
VALUES ('fields', 'system', true);

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
